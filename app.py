import os
import re
import urllib.parse
import tempfile
import uuid
import threading
import time
from flask import Flask, request, jsonify, render_template, Response, stream_with_context
import yt_dlp
import requests

# Try importing static_ffmpeg to load static Windows ffmpeg binaries at runtime
try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
    print("TubeFlow: static-ffmpeg paths registered successfully!")
except Exception as e:
    print("TubeFlow Warning: static-ffmpeg paths could not be registered:", str(e))

app = Flask(__name__, template_folder='templates', static_folder='static')

# Helper to generate yt-dlp options with browser impersonation and alternative player clients to bypass cloud blocking / SSL EOF / bot checks
def get_ydl_opts(extra_opts=None):
    opts = {
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['ios', 'web_embedded']
            }
        }
    }
    try:
        from yt_dlp.networking.impersonate import ImpersonateTarget
        opts['impersonate'] = ImpersonateTarget.from_str('chrome')
    except Exception:
        pass
    
    if extra_opts:
        if 'extractor_args' in extra_opts:
            opts['extractor_args'].update(extra_opts['extractor_args'])
            for k, v in extra_opts.items():
                if k != 'extractor_args':
                    opts[k] = v
        else:
            opts.update(extra_opts)
    return opts

# Global Task Registry to hold live download states
# Structure: { task_id: { 'status': '...', 'percent': 0, 'speed': '...', 'eta': 0, 'msg': '...', 'filepath': '...', 'filename': '...', 'created_at': 0 } }
DOWNLOAD_TASKS = {}
tasks_lock = threading.Lock()

# Helper to format duration
def format_duration(seconds):
    if not seconds:
        return "0:00"
    seconds = int(seconds)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"

# Helper to format views
def format_views(views):
    if not views:
        return "0 views"
    views = int(views)
    if views >= 1_000_000_000:
        return f"{views / 1_000_000_000:.1f}B views"
    elif views >= 1_000_000:
        return f"{views / 1_000_000:.1f}M views"
    elif views >= 1_000:
        return f"{views / 1_000:.1f}K views"
    return f"{views} views"

# Helper to sanitize filename
def sanitize_filename(name):
    name = re.sub(r'[\\/*?:"<>|]', "", name)
    return name[:100].strip()

# Cleanup thread to prevent memory leak by deleting task data older than 30 minutes
def cleanup_old_tasks():
    while True:
        time.sleep(300) # Run every 5 minutes
        now = time.time()
        expired_ids = []
        with tasks_lock:
            for tid, tdata in DOWNLOAD_TASKS.items():
                if now - tdata.get('created_at', 0) > 1800: # 30 mins
                    expired_ids.append(tid)
                    # Clean up file if still exists
                    filepath = tdata.get('filepath')
                    if filepath and os.path.exists(filepath):
                        try:
                            os.remove(filepath)
                        except Exception:
                            pass
            for tid in expired_ids:
                del DOWNLOAD_TASKS[tid]

# Start task cleaner daemon
cleanup_thread = threading.Thread(target=cleanup_old_tasks, daemon=True)
cleanup_thread.start()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/info')
def get_info():
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL is required'}), 400
    
    try:
        info = None
        try:
            ydl_opts = get_ydl_opts({'extract_flat': False})
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
        except Exception as e:
            print(f"TubeFlow: Impersonation extraction failed ({str(e)}). Retrying with standard options...")
            fallback_opts = {
                'quiet': True,
                'no_warnings': True,
                'nocheckcertificate': True,
                'extract_flat': False,
                'extractor_args': {
                    'youtube': {
                        'player_client': ['ios', 'web_embedded']
                    }
                }
            }
            with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                info = ydl.extract_info(url, download=False)
            
        if not info:
            return jsonify({'error': 'Could not extract video information'}), 400
            
        # Select best high-res thumbnail
        thumbnail = info.get('thumbnail')
        thumbnails = info.get('thumbnails', [])
        if thumbnails:
            thumbnails = [t for t in thumbnails if t.get('width')]
            if thumbnails:
                thumbnails.sort(key=lambda x: x.get('width', 0), reverse=True)
                thumbnail = thumbnails[0].get('url')
        
        # Select best audio stream for file size estimations during merging
        best_audio = None
        for f in info.get('formats', []):
            if f.get('vcodec') == 'none' and f.get('acodec') != 'none':
                if not best_audio or (f.get('filesize') or f.get('filesize_approx') or 0) > (best_audio.get('filesize') or best_audio.get('filesize_approx') or 0):
                    best_audio = f
        
        best_audio_size = (best_audio.get('filesize') or best_audio.get('filesize_approx') or 0) if best_audio else 0

        # Parse formats
        video_formats = []
        audio_formats = []
        added_resolutions = set()

        for f in info.get('formats', []):
            direct_url = f.get('url')
            if not direct_url:
                continue
                
            format_id = f.get('format_id')
            ext = f.get('ext', 'mp4')
            vcodec = f.get('vcodec', 'none') or 'none'
            acodec = f.get('acodec', 'none') or 'none'
            filesize = f.get('filesize') or f.get('filesize_approx') or 0
            
            # Codec fallback for non-YouTube platforms (TikTok/Instagram) where codec fields might be empty/null
            # but resolution dimensions exist. We treat them as combined video+audio formats.
            if vcodec == 'none' and acodec == 'none' and (f.get('height') or f.get('width')):
                vcodec = 'mp4'
                acodec = 'aac'
                
            resolution = f.get('resolution')
            height = f.get('height')
            if not resolution and height:
                resolution = f"{f.get('width', 0)}x{height}"
            
            quality_label = f"{height}p" if height else (resolution or "Unknown")
            
            # Audio bitrate
            abr = f.get('abr')
            audio_label = f"{int(abr)}kbps" if abr else "High Quality"
            
            # 1. Combined formats (Video + Audio) - directly streamable
            if vcodec != 'none' and acodec != 'none':
                video_formats.append({
                    'format_id': format_id,
                    'ext': ext,
                    'resolution': resolution,
                    'quality_label': quality_label,
                    'filesize': filesize,
                    'type': 'combined',
                    'note': f"Video + Audio ({ext.upper()})"
                })
                if height:
                    added_resolutions.add(height)

            # 2. Audio-only formats
            elif vcodec == 'none' and acodec != 'none':
                audio_formats.append({
                    'format_id': format_id,
                    'ext': ext,
                    'quality_label': audio_label,
                    'filesize': filesize,
                    'type': 'audio',
                    'note': f"Audio only ({ext.upper()})"
                })

        # 3. Video-only formats (High Res like 1080p, 1440p) - we merge them with best audio on-the-fly!
        for f in info.get('formats', []):
            direct_url = f.get('url')
            if not direct_url:
                continue
            
            vcodec = f.get('vcodec', 'none')
            acodec = f.get('acodec', 'none')
            height = f.get('height')
            
            if vcodec != 'none' and acodec == 'none' and height and height not in added_resolutions:
                format_id = f.get('format_id')
                ext = f.get('ext', 'mp4')
                filesize = f.get('filesize') or f.get('filesize_approx') or 0
                resolution = f.get('resolution') or f"{f.get('width', 0)}x{height}"
                quality_label = f"{height}p"
                
                estimated_filesize = filesize + best_audio_size if filesize else 0
                
                video_formats.append({
                    'format_id': format_id,
                    'ext': 'mp4',
                    'resolution': resolution,
                    'quality_label': quality_label,
                    'filesize': estimated_filesize,
                    'type': 'merge',
                    'note': "Video + Audio (HQ Merge)"
                })
                added_resolutions.add(height)

        # Sort video formats by height descending
        def get_height(x):
            label = x['quality_label']
            m = re.search(r'(\d+)', label)
            return int(m.group(1)) if m else 0
            
        video_formats.sort(key=get_height, reverse=True)
        
        # Sort audio formats by quality
        def get_audio_bitrate(x):
            label = x['quality_label']
            m = re.search(r'(\d+)', label)
            return int(m.group(1)) if m else 0
        audio_formats.sort(key=get_audio_bitrate, reverse=True)

        return jsonify({
            'title': info.get('title', 'Unknown Video'),
            'author': info.get('uploader') or info.get('channel', 'Unknown Creator'),
            'thumbnail': thumbnail,
            'duration': info.get('duration', 0),
            'duration_formatted': format_duration(info.get('duration')),
            'views': info.get('view_count', 0),
            'views_formatted': format_views(info.get('view_count')),
            'description': info.get('description', '')[:300] + '...' if info.get('description') else 'No description available.',
            'video_formats': video_formats,
            'audio_formats': audio_formats,
            'url': url
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Task Progress Hook for yt-dlp
def make_progress_hook(task_id):
    def progress_hook(d):
        if d['status'] == 'downloading':
            downloaded = d.get('downloaded_bytes', 0)
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            percent = 0
            if total > 0:
                percent = round((downloaded / total) * 100, 1)
            
            speed = d.get('speed', 0)
            speed_str = "0 KB/s"
            if speed:
                if speed >= 1024 * 1024:
                    speed_str = f"{speed / (1024 * 1024):.1f} MB/s"
                else:
                    speed_str = f"{speed / 1024:.1f} KB/s"
                    
            eta = d.get('eta', 0)
            eta_str = f"{eta}s" if eta else "calculating..."
            
            # Format filename to keep logs clean
            filename = os.path.basename(d.get('filename', ''))
            
            with tasks_lock:
                if task_id in DOWNLOAD_TASKS:
                    DOWNLOAD_TASKS[task_id].update({
                        'status': 'downloading',
                        'percent': percent,
                        'speed': speed_str,
                        'eta': eta_str,
                        'msg': f"Downloading file: {percent}% completed at {speed_str} (ETA: {eta_str})"
                    })
        elif d['status'] == 'finished':
            with tasks_lock:
                if task_id in DOWNLOAD_TASKS:
                    DOWNLOAD_TASKS[task_id].update({
                        'status': 'merging',
                        'percent': 95,
                        'msg': "Merging audio and video tracks into MP4... Please wait."
                    })
    return progress_hook

# Background Thread Runner for yt-dlp downloads
def async_download_worker(url, format_id, task_id, title, is_merge):
    try:
        temp_dir = tempfile.gettempdir()
        outtmpl = os.path.join(temp_dir, f"tubeflow_{task_id}.%(ext)s")
        
        ffmpeg_dir = None
        try:
            import static_ffmpeg.run
            ffmpeg_dir = static_ffmpeg.run.get_platform_dir()
        except Exception:
            pass
        
        # Setup specific options
        if is_merge:
            ydl_opts = get_ydl_opts({
                'format': f"{format_id}+bestaudio[ext=m4a]/bestaudio",
                'outtmpl': outtmpl,
                'progress_hooks': [make_progress_hook(task_id)],
                'merge_output_format': 'mp4',
                'postprocessor_args': {
                    'ffmpeg': ['-c:a', 'aac']
                }
            })
        else:
            # For combined or audio-only, direct download is faster via yt-dlp
            ydl_opts = get_ydl_opts({
                'format': format_id,
                'outtmpl': outtmpl,
                'progress_hooks': [make_progress_hook(task_id)]
            })
            
        if ffmpeg_dir:
            ydl_opts['ffmpeg_location'] = ffmpeg_dir
            
        # Execute download with fallback
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
        except Exception as dl_err:
            print(f"TubeFlow: Impersonation download failed ({str(dl_err)}). Retrying with standard options...")
            fallback_opts = {
                'format': ydl_opts.get('format'),
                'outtmpl': ydl_opts.get('outtmpl'),
                'quiet': True,
                'no_warnings': True,
                'nocheckcertificate': True,
                'progress_hooks': ydl_opts.get('progress_hooks'),
                'merge_output_format': ydl_opts.get('merge_output_format'),
                'postprocessor_args': ydl_opts.get('postprocessor_args'),
                'ffmpeg_location': ydl_opts.get('ffmpeg_location'),
                'extractor_args': {
                    'youtube': {
                        'player_client': ['ios', 'web_embedded']
                    }
                }
            }
            with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                ydl.download([url])
            
        # Discover output filepath
        ext = 'mp4'
        if not is_merge:
            # Check format details to find extension
            res_info = None
            try:
                with yt_dlp.YoutubeDL(get_ydl_opts()) as ydl_info:
                    res_info = ydl_info.extract_info(url, download=False)
            except Exception:
                fallback_info_opts = {
                    'quiet': True,
                    'no_warnings': True,
                    'nocheckcertificate': True,
                    'extractor_args': {
                        'youtube': {
                            'player_client': ['ios', 'web_embedded']
                        }
                    }
                }
                with yt_dlp.YoutubeDL(fallback_info_opts) as ydl_info:
                    res_info = ydl_info.extract_info(url, download=False)
                for f in res_info.get('formats', []):
                    if f.get('format_id') == format_id:
                        ext = f.get('ext', 'mp4')
                        break
                        
        final_filepath = os.path.join(temp_dir, f"tubeflow_{task_id}.{ext}")
        
        # Fallback discovery if file has a slightly different extension
        if not os.path.exists(final_filepath):
            for file in os.listdir(temp_dir):
                if file.startswith(f"tubeflow_{task_id}"):
                    final_filepath = os.path.join(temp_dir, file)
                    ext = file.split('.')[-1]
                    break
                    
        if not os.path.exists(final_filepath):
            raise FileNotFoundError("Merged/Downloaded output file was not found on the server.")
            
        # Complete task registration
        safe_title = sanitize_filename(title)
        filename = f"{safe_title}.{ext}"
        
        with tasks_lock:
            if task_id in DOWNLOAD_TASKS:
                DOWNLOAD_TASKS[task_id].update({
                    'status': 'completed',
                    'percent': 100,
                    'filepath': final_filepath,
                    'filename': filename,
                    'msg': "Download complete! Ready to save."
                })
                
    except Exception as e:
        print(f"TubeFlow Async Error: {str(e)}")
        with tasks_lock:
            if task_id in DOWNLOAD_TASKS:
                DOWNLOAD_TASKS[task_id].update({
                    'status': 'error',
                    'msg': f"Download failed: {str(e)}"
                })

# API 1: Start background download task
@app.route('/api/download/start')
def start_async_download():
    url = request.args.get('url')
    format_id = request.args.get('url_format_id') or request.args.get('format_id')
    
    if not url or not format_id:
        return jsonify({'error': 'URL and format_id are required'}), 400
        
    try:
        info = None
        try:
            ydl_opts = get_ydl_opts()
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
        except Exception:
            fallback_opts = {
                'quiet': True,
                'no_warnings': True,
                'nocheckcertificate': True,
                'extractor_args': {
                    'youtube': {
                        'player_client': ['ios', 'web_embedded']
                    }
                }
            }
            with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                info = ydl.extract_info(url, download=False)
            
        if not info:
            return jsonify({'error': 'Could not extract video details'}), 400
            
        title = info.get('title', 'video')
        
        # Find format details to check if it needs merging
        selected_format = None
        for f in info.get('formats', []):
            if f.get('format_id') == format_id:
                selected_format = f
                break
                
        if not selected_format:
            return jsonify({'error': f'Format {format_id} not found'}), 404
            
        vcodec = selected_format.get('vcodec', 'none')
        acodec = selected_format.get('acodec', 'none')
        is_merge = (vcodec != 'none' and acodec == 'none')
        
        # Generate task ID
        task_id = str(uuid.uuid4())
        
        with tasks_lock:
            DOWNLOAD_TASKS[task_id] = {
                'status': 'starting',
                'percent': 0,
                'speed': '0 KB/s',
                'eta': 'calculating...',
                'msg': 'Initializing download thread on server...',
                'filepath': '',
                'filename': '',
                'created_at': time.time()
            }
            
        # Start worker thread
        thread = threading.Thread(
            target=async_download_worker,
            args=(url, format_id, task_id, title, is_merge),
            daemon=True
        )
        thread.start()
        
        return jsonify({'task_id': task_id, 'title': title})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# API 2: Query download task progress
@app.route('/api/download/progress')
def get_download_progress():
    task_id = request.args.get('task_id')
    if not task_id:
        return jsonify({'error': 'task_id is required'}), 400
        
    with tasks_lock:
        task = DOWNLOAD_TASKS.get(task_id)
        
    if not task:
        return jsonify({'error': 'Task not found or expired'}), 404
        
    return jsonify({
        'status': task['status'],
        'percent': task['percent'],
        'speed': task['speed'],
        'eta': task['eta'],
        'msg': task['msg']
    })

# API 3: Download finished file attachment
@app.route('/api/download/get')
def get_finished_file():
    task_id = request.args.get('task_id')
    if not task_id:
        return "task_id parameter is required", 400
        
    with tasks_lock:
        task = DOWNLOAD_TASKS.get(task_id)
        
    if not task or task['status'] != 'completed':
        return "File is not ready or task has expired", 404
        
    filepath = task['filepath']
    filename = task['filename']
    
    if not filepath or not os.path.exists(filepath):
        return "Output file not found on the server filesystem.", 404
        
    filesize = os.path.getsize(filepath)
    
    # Streaming generator
    def generate_file():
        with open(filepath, 'rb') as f_in:
            while True:
                chunk = f_in.read(1024 * 1024)
                if not chunk:
                    break
                yield chunk
        # Cleanup file upon complete stream output
        try:
            os.remove(filepath)
            print(f"TubeFlow Async Cleaned Up: {filepath}")
        except Exception:
            pass
            
    encoded_filename = urllib.parse.quote(filename)
    response_headers = {
        'Content-Disposition': f"attachment; filename*=UTF-8''{encoded_filename}",
        'Content-Type': 'application/octet-stream',
        'Content-Length': str(filesize)
    }
    
    return Response(stream_with_context(generate_file()), headers=response_headers)

def run_server_on_android():
    os.makedirs('static', exist_ok=True)
    os.makedirs('templates', exist_ok=True)
    # Run locally on the phone's localhost loopback, disabling reloader to prevent thread restarts
    app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)

if __name__ == '__main__':
    os.makedirs('static', exist_ok=True)
    os.makedirs('templates', exist_ok=True)
    port = int(os.environ.get('PORT', 7860))
    app.run(host='0.0.0.0', port=port, debug=False)
