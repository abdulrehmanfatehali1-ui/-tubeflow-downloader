import os
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import re
import urllib.parse
import tempfile
import uuid
import threading
import time
import subprocess
from flask import Flask, request, jsonify, render_template, Response, stream_with_context
import yt_dlp
import requests
import socket
socket.setdefaulttimeout(12.0)

# Try importing curl_cffi for Cloudflare-bypassing Chrome TLS impersonation on the server
try:
    from curl_cffi import requests as curl_requests
except ImportError:
    curl_requests = None

# Try importing static_ffmpeg to load static Windows ffmpeg binaries at runtime
try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
    print("TubeFlow: static-ffmpeg paths registered successfully!")
except Exception as e:
    print("TubeFlow Warning: static-ffmpeg paths could not be registered:", str(e))

app = Flask(__name__, template_folder='templates', static_folder='static')

# Programmatically start the bgutil-pot PO Token provider server in the background
try:
    log_file = open("bgutil.log", "a")
    subprocess.Popen(
        ["bgutil-pot", "server", "--host", "127.0.0.1", "--port", "4416"],
        stdout=log_file,
        stderr=log_file
    )
    print("TubeFlow: bgutil-pot PO Token server successfully started on 127.0.0.1:4416!")
except Exception as e:
    print("TubeFlow Warning: bgutil-pot server could not be started:", str(e))



# Helper to generate yt-dlp options with browser impersonation and alternative player clients to bypass cloud blocking / SSL EOF / bot checks
def get_ydl_opts(extra_opts=None):
    opts = {
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'socket_timeout': 15,
        'retries': 2,
        'extractor_retries': 2,
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'ios', 'tv', 'creator']
            },
            'youtubepot-bgutilhttp': {
                'base_url': 'http://127.0.0.1:4416'
            }
        }
    }
    
    # Auto-load Netscape cookies if cookies.txt is present in the app's root folder!
    # This completely unblocks YouTube extractions forever on the cloud server!
    if os.path.exists('cookies.txt'):
        opts['cookiefile'] = 'cookies.txt'
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

# List of public stable Invidious and Piped instances to fetch YouTube metadata when yt-dlp is blocked
INVIDIOUS_INSTANCES = [
    'https://invidious.projectsegfau.lt',
    'https://invidious.no-logs.com',
    'https://inv.tux.im',
    'https://invidious.jing.rocks',
    'https://yewtu.be'
]

PIPED_INSTANCES = [
    'https://pipedapi.ram.icu',
    'https://pipedapi.colbyland.org',
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.smnz.de'
]

COBALT_INSTANCES = [
    'https://apicobalt.mgytr.top',
    'https://cobaltapi.kittycat.boo',
    'https://dog.kittycat.boo',
    'https://fox.kittycat.boo',
    'https://api.cobalt.liubquanti.click',
    'https://api.cobalt.blackcat.sweeux.org',
    'https://cobaltapi.cjs.nz'
]

def get_dynamic_invidious_instances():
    try:
        r = requests.get("https://api.invidious.io/instances.json?sort_by=type,health", timeout=3.5)
        if r.status_code == 200:
            data = r.json()
            instances = []
            for item in data:
                domain = item[0]
                details = item[1]
                if details.get('type') == 'https' and details.get('api', True):
                    uri = details.get('uri') or f"https://{domain}"
                    instances.append(uri)
            if instances:
                return instances[:8]
    except Exception:
        pass
    return INVIDIOUS_INSTANCES

def query_single_cobalt(instance, url, quality_label=None, is_audio=False):
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
    
    # Map quality label
    q = '720'
    if quality_label:
        ql = quality_label.lower()
        if '2160' in ql or '4k' in ql: q = 'max'
        elif '1440' in ql or '2k' in ql: q = '1440'
        elif '1080' in ql: q = '1080'
        elif '720' in ql: q = '720'
        elif '480' in ql: q = '480'
        elif '360' in ql: q = '360'
        
    download_mode = 'audio' if is_audio else 'auto'
    audio_format = 'mp3' if is_audio else 'best'
    
    payloads = [
        # Modern v10/v11 API payload
        {
            'url': url,
            'videoQuality': q,
            'downloadMode': download_mode,
            'audioFormat': audio_format,
            'filenameStyle': 'basic'
        },
        # Level 1: Strict v7 payload
        {
            'url': url,
            'videoQuality': q,
            'downloadMode': download_mode
        },
        # Level 2: Strict v6 payload
        {
            'url': url,
            'vQuality': q,
            'downloadMode': download_mode
        },
        # Level 3: Minimal universal payload
        {
            'url': url
        }
    ]
    
    for path in ["/", "/api/json", ""]:
        for payload in payloads:
            try:
                target_url = f"{instance.rstrip('/')}{path}"
                if curl_requests:
                    response = curl_requests.post(target_url, headers=headers, json=payload, impersonate="chrome", timeout=5)
                else:
                    response = requests.post(target_url, headers=headers, json=payload, timeout=5)
                
                if response.status_code == 200:
                    data = response.json()
                    if data and data.get('status') in ['stream', 'redirect', 'tunnel', 'picker']:
                        return {'source': 'cobalt', 'data': data, 'instance': instance}
            except Exception:
                pass
    return None

def parse_cobalt_info(data, url):
    title = data.get('filename') or "Extracted Video"
    if title.endswith('.mp4') or title.endswith('.mkv') or title.endswith('.webm'):
        title = title.rsplit('.', 1)[0]
    direct_url = data.get('url')
    payload = f"{direct_url}|{title}|mp4"
    encoded_id = base64.b64encode(payload.encode('utf-8')).decode('utf-8')
    video_formats = [{
        'format_id': encoded_id,
        'ext': 'mp4',
        'resolution': '720p',
        'quality_label': '720p',
        'filesize': 0,
        'type': 'combined',
        'note': 'Direct HD Stream (Bypassed)'
    }]
    return {
        'title': title,
        'author': 'Cobalt Attestation Bypass',
        'thumbnail': 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=300&auto=format&fit=crop',
        'duration': 0,
        'duration_formatted': 'Direct',
        'views': 1000,
        'views_formatted': 'Active Stream',
        'description': 'Bypassed successfully via multi-layered dynamic proxy fallback routing.',
        'video_formats': video_formats,
        'audio_formats': [],
        'url': url
    }


# Helper to extract 11-character YouTube video ID
def extract_youtube_id(url):
    pattern = r'(?:https?://)?(?:www\.)?(?:youtube\.com/(?:watch\?v=|embed/|v/|shorts/)|youtu\.be/)([a-zA-Z0-9_-]{11})'
    match = re.search(pattern, url)
    return match.group(1) if match else None

# Fallback function to extract YouTube metadata via public Invidious API
def query_single_invidious(instance, video_id):
    try:
        api_url = f"{instance}/api/v1/videos/{video_id}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        if curl_requests:
            response = curl_requests.get(api_url, headers=headers, impersonate="chrome", timeout=3.5)
        else:
            response = requests.get(api_url, headers=headers, timeout=3.5)
            
        if response.status_code == 200:
            data = response.json()
            if data and 'title' in data:
                return {'source': 'invidious', 'data': data, 'instance': instance}
    except Exception:
        pass
    return None

# Fallback function to extract YouTube metadata via public Piped API
def query_single_piped(instance, video_id):
    try:
        api_url = f"{instance}/streams/{video_id}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        if curl_requests:
            response = curl_requests.get(api_url, headers=headers, impersonate="chrome", timeout=3.5)
        else:
            response = requests.get(api_url, headers=headers, timeout=3.5)
            
        if response.status_code == 200:
            data = response.json()
            if data and 'title' in data:
                return {'source': 'piped', 'data': data, 'instance': instance}
    except Exception:
        pass
    return None

def fetch_youtube_via_fallback_apis(url):
    video_id = extract_youtube_id(url)
    if not video_id:
        return None
        
    dynamic_invidious = get_dynamic_invidious_instances()
    
    # Query all Invidious, Piped, and Cobalt instances concurrently for sub-second responses!
    total_workers = len(dynamic_invidious) + len(PIPED_INSTANCES) + len(COBALT_INSTANCES)
    with ThreadPoolExecutor(max_workers=total_workers) as executor:
        futures = []
        for inst in dynamic_invidious:
            futures.append(executor.submit(query_single_invidious, inst, video_id))
        for inst in PIPED_INSTANCES:
            futures.append(executor.submit(query_single_piped, inst, video_id))
        for inst in COBALT_INSTANCES:
            futures.append(executor.submit(query_single_cobalt, inst, url))
            
        try:
            for future in as_completed(futures, timeout=8.0):
                try:
                    res = future.result()
                    if res:
                        return res
                except Exception:
                    pass
        except Exception:
            pass
    return None

# Mapper to translate Invidious JSON payload to TubeFlow Ultimate UI schema
def parse_invidious_info(data, url):
    title = data.get('title', 'Unknown Video')
    author = data.get('author', 'Unknown Creator')
    
    thumbnail = ""
    thumbnails = data.get('videoThumbnails', [])
    if thumbnails:
        thumbnails.sort(key=lambda x: x.get('width', 0), reverse=True)
        thumbnail = thumbnails[0].get('url', '')
        
    duration = data.get('lengthSeconds', 0)
    views = data.get('viewCount', 0)
    description = data.get('description', '')[:300] + '...'
    
    video_formats = []
    audio_formats = []
    
    # 1. formatStreams (Combined video + audio)
    for f in data.get('formatStreams', []):
        ext = f.get('container', 'mp4')
        quality = f.get('qualityLabel', '360p')
        payload = f"{f.get('url')}|{title}|{ext}"
        encoded_id = base64.b64encode(payload.encode('utf-8')).decode('utf-8')
        
        video_formats.append({
            'format_id': encoded_id,
            'ext': ext,
            'resolution': f.get('resolution', ''),
            'quality_label': quality,
            'filesize': int(f.get('size', 0)) or 0,
            'type': 'combined',
            'note': f"Direct Stream ({ext.upper()})"
        })
        
    # 2. adaptiveFormats (separate video-only and audio-only)
    for f in data.get('adaptiveFormats', []):
        mime = f.get('type', '')
        ext = f.get('container', 'mp4')
        
        payload = f"{f.get('url')}|{title}|{ext}"
        encoded_id = base64.b64encode(payload.encode('utf-8')).decode('utf-8')
        
        if 'audio/' in mime:
            quality = f.get('audioQuality', 'High Quality')
            bitrate = int(f.get('bitrate', 0)) // 1000
            audio_formats.append({
                'format_id': encoded_id,
                'ext': ext,
                'quality_label': f"{bitrate}kbps" if bitrate else quality,
                'filesize': int(f.get('size', 0)) or 0,
                'type': 'audio',
                'note': f"Audio only ({ext.upper()})"
            })
        elif 'video/' in mime:
            quality = f.get('qualityLabel', '360p')
            video_formats.append({
                'format_id': encoded_id,
                'ext': ext,
                'resolution': f.get('resolution', ''),
                'quality_label': quality,
                'filesize': int(f.get('size', 0)) or 0,
                'type': 'combined',
                'note': "Direct Video"
            })
            
    # Sort video formats
    def get_height(x):
        label = x['quality_label']
        m = re.search(r'(\d+)', label)
        return int(m.group(1)) if m else 0
    video_formats.sort(key=get_height, reverse=True)
    
    return {
        'title': title,
        'author': author,
        'thumbnail': thumbnail,
        'duration': duration,
        'duration_formatted': format_duration(duration),
        'views': views,
        'views_formatted': format_views(views),
        'description': description,
        'video_formats': video_formats,
        'audio_formats': audio_formats,
        'url': url
    }

# Mapper to translate Piped JSON payload to TubeFlow Ultimate UI schema
def parse_piped_info(data, url):
    title = data.get('title', 'Unknown Video')
    author = data.get('uploader', 'Unknown Creator')
    thumbnail = data.get('thumbnailUrl', '')
    duration = data.get('duration', 0)
    views = data.get('views', 0)
    description = data.get('description', '')[:300] + '...'
    
    video_formats = []
    audio_formats = []
    
    # Process Piped videoStreams
    for f in data.get('videoStreams', []):
        mime = f.get('mimeType', '')
        ext = 'mp4' if 'video/mp4' in mime else 'webm'
        quality = f.get('quality', '360p')
        
        payload = f"{f.get('url')}|{title}|{ext}"
        encoded_id = base64.b64encode(payload.encode('utf-8')).decode('utf-8')
        
        video_formats.append({
            'format_id': encoded_id,
            'ext': ext,
            'resolution': quality,
            'quality_label': quality,
            'filesize': int(f.get('bitrate', 0) * duration // 8) or 0,
            'type': 'combined',
            'note': "Direct Video"
        })
        
    # Process Piped audioStreams
    for f in data.get('audioStreams', []):
        mime = f.get('mimeType', '')
        ext = 'm4a' if 'audio/mp4' in mime else 'webm'
        quality = f.get('quality', 'High Quality')
        bitrate = int(f.get('bitrate', 0)) // 1000
        
        payload = f"{f.get('url')}|{title}|{ext}"
        encoded_id = base64.b64encode(payload.encode('utf-8')).decode('utf-8')
        
        audio_formats.append({
            'format_id': encoded_id,
            'ext': ext,
            'quality_label': f"{bitrate}kbps" if bitrate else quality,
            'filesize': int(f.get('bitrate', 0) * duration // 8) or 0,
            'type': 'audio',
            'note': f"Audio only ({ext.upper()})"
        })
        
    def get_height(x):
        label = x['quality_label']
        m = re.search(r'(\d+)', label)
        return int(m.group(1)) if m else 0
    video_formats.sort(key=get_height, reverse=True)
    
    return {
        'title': title,
        'author': author,
        'thumbnail': thumbnail,
        'duration': duration,
        'duration_formatted': format_duration(duration),
        'views': views,
        'views_formatted': format_views(views),
        'description': description,
        'video_formats': video_formats,
        'audio_formats': audio_formats,
        'url': url
    }

# Background worker for direct CDN stream downloads via requests (100% bypasses yt-dlp blocks!)
def direct_stream_download_worker(direct_url, task_id, title, ext):
    try:
        temp_dir = tempfile.gettempdir()
        final_filepath = os.path.join(temp_dir, f"tubeflow_{task_id}.{ext}")
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive'
        }
        if curl_requests:
            response = curl_requests.get(direct_url, headers=headers, stream=True, impersonate="chrome", timeout=20)
        else:
            response = requests.get(direct_url, headers=headers, stream=True, timeout=20)
        response.raise_for_status()
        
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        with open(final_filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=1024 * 1024): # 1MB chunks
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    percent = 0
                    if total_size > 0:
                        percent = round((downloaded / total_size) * 100, 1)
                    
                    with tasks_lock:
                        if task_id in DOWNLOAD_TASKS:
                            DOWNLOAD_TASKS[task_id].update({
                                'status': 'downloading',
                                'percent': percent,
                                'speed': 'High Speed',
                                'eta': 'calculating...',
                                'msg': f"Downloading direct CDN stream: {percent}% completed"
                            })
                            
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
        print(f"TubeFlow Direct Downloader Error: {str(e)}")
        with tasks_lock:
            if task_id in DOWNLOAD_TASKS:
                DOWNLOAD_TASKS[task_id].update({
                    'status': 'error',
                    'msg': f"Download failed: {str(e)}"
                })

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

@app.route('/api/proxy-image')
def proxy_image():
    url = request.args.get('url', '').strip()
    if not url:
        return "URL is required", 400
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.pinterest.com/'
        }
        r = requests.get(url, headers=headers, timeout=12)
        r.raise_for_status()
        content_type = r.headers.get('Content-Type', 'image/jpeg')
        return Response(r.content, content_type=content_type)
    except Exception as e:
        return f"Error proxying image: {str(e)}", 500

@app.route('/api/proxy-oembed')
def proxy_oembed():
    url = request.args.get('url', '').strip()
    if not url:
        return jsonify({'error': 'URL is required'}), 400
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        r = requests.get(url, headers=headers, timeout=12)
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/debug-logs')
def get_debug_logs():
    try:
        logs = ""
        if os.path.exists('bgutil.log'):
            with open('bgutil.log', 'r') as f:
                logs = f.read()
        else:
            logs = "bgutil.log file not found."
        return Response(logs, mimetype='text/plain')
    except Exception as e:
        return str(e), 500


# ─────────────────────────────────────────────────────────────────────────────
# /api/proxy-stream  –  Direct stream proxy (no yt-dlp, no extraction!)
#   Decodes format_id (base64 of "url|title|ext") and proxies the stream
#   back to the browser. Used for 'combined' formats (pre-merged video+audio).
#   Zero yt-dlp extraction needed → no YouTube IP blocking issues!
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/proxy-stream')
def proxy_stream():
    format_id = request.args.get('format_id', '').strip()
    filename   = request.args.get('filename', 'download.mp4').strip()

    if not format_id:
        return jsonify({'error': 'No format_id provided'}), 400

    try:
        decoded = base64.b64decode(format_id + '==').decode('utf-8', errors='replace')
        # Format: "url|title|ext"
        parts = decoded.split('|')
        stream_url = parts[0]
    except Exception as e:
        return jsonify({'error': f'Could not decode format_id: {e}'}), 400

    if not stream_url or not stream_url.startswith('http'):
        return jsonify({'error': 'Invalid stream URL in format_id'}), 400

    def generate():
        hdrs = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Referer': 'https://www.youtube.com/',
        }
        try:
            r = requests.get(stream_url, headers=hdrs, stream=True, timeout=300)
            for chunk in r.iter_content(chunk_size=65536):
                if chunk:
                    yield chunk
        except Exception as ex:
            print(f'proxy-stream error: {ex}')

    safe_fn = filename.replace('"', "'").replace('\n', '').replace('\r', '')
    resp = Response(stream_with_context(generate()), content_type='video/mp4')
    resp.headers['Content-Disposition'] = f'attachment; filename="{safe_fn}"'
    resp.headers['Cache-Control'] = 'no-cache'
    resp.headers['X-Accel-Buffering'] = 'no'
    return resp


# ─────────────────────────────────────────────────────────────────────────────
# /api/proxy-merge  –  Server-side video+audio merge proxy (no yt-dlp!)
#   Decodes format_id (base64 of "videoUrl||audioUrl|title|ext"), downloads
#   both streams to temp files, merges with ffmpeg, streams result to browser.
#   No yt-dlp extraction at all → no YouTube IP blocking on HuggingFace!
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/proxy-merge')
def proxy_merge():
    format_id = request.args.get('format_id', '').strip()
    filename   = request.args.get('filename', 'download.mp4').strip()

    if not format_id:
        return jsonify({'error': 'No format_id provided'}), 400

    try:
        decoded = base64.b64decode(format_id + '==').decode('utf-8', errors='replace')
        # Format: "videoUrl||audioUrl|title|ext"
        if '||' in decoded:
            video_url, rest = decoded.split('||', 1)
            audio_url = rest.split('|')[0]
        else:
            # Fallback: treat as combined single URL
            video_url = decoded.split('|')[0]
            audio_url = ''
    except Exception as e:
        return jsonify({'error': f'Could not decode format_id: {e}'}), 400

    if not video_url or not video_url.startswith('http'):
        return jsonify({'error': 'Invalid video URL in format_id'}), 400

    # If no audio URL available, fall back to proxy-stream (combined)
    if not audio_url or not audio_url.startswith('http'):
        def generate_single():
            hdrs = {
                'User-Agent': 'Mozilla/5.0',
                'Accept': '*/*',
                'Accept-Encoding': 'identity',
                'Referer': 'https://www.youtube.com/',
            }
            try:
                r = requests.get(video_url, headers=hdrs, stream=True, timeout=300)
                for chunk in r.iter_content(chunk_size=65536):
                    if chunk:
                        yield chunk
            except Exception as ex:
                print(f'proxy-merge single error: {ex}')

        safe_fn = filename.replace('"', "'").replace('\n', '').replace('\r', '')
        resp = Response(stream_with_context(generate_single()), content_type='video/mp4')
        resp.headers['Content-Disposition'] = f'attachment; filename="{safe_fn}"'
        resp.headers['Cache-Control'] = 'no-cache'
        resp.headers['X-Accel-Buffering'] = 'no'
        return resp

    # Download video and audio to temp files, then merge with ffmpeg
    import shutil
    tmp_dir = tempfile.mkdtemp()
    video_path  = os.path.join(tmp_dir, 'video_in.mp4')
    audio_path  = os.path.join(tmp_dir, 'audio_in.audio')  # neutral ext, ffmpeg auto-detects
    output_path = os.path.join(tmp_dir, 'merged_out.mp4')

    def download_file(url, dest):
        hdrs = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Referer': 'https://www.youtube.com/',
            'Origin': 'https://www.youtube.com',
        }
        r = requests.get(url, headers=hdrs, stream=True, timeout=300)
        r.raise_for_status()
        total = 0
        with open(dest, 'wb') as f:
            for chunk in r.iter_content(chunk_size=131072):
                if chunk:
                    f.write(chunk)
                    total += len(chunk)
        if total < 1000:
            raise RuntimeError(f'Downloaded file too small ({total} bytes) – URL may be expired or blocked')
        return total

    try:
        # Download video and audio in parallel
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=2) as pool:
            vfut = pool.submit(download_file, video_url, video_path)
            afut = pool.submit(download_file, audio_url, audio_path)
            video_bytes = vfut.result(timeout=300)
            audio_bytes = afut.result(timeout=300)
        print(f'proxy-merge: downloaded video={video_bytes}B audio={audio_bytes}B')

        def run_ffmpeg(extra_audio_args):
            cmd = [
                'ffmpeg', '-y',
                '-i', video_path,
                '-i', audio_path,
                '-c:v', 'copy',
            ] + extra_audio_args + [
                '-shortest',
                '-movflags', '+faststart',
                output_path
            ]
            r = subprocess.run(cmd, capture_output=True, timeout=300)
            return r

        # Try 1: copy both streams (fastest – works if audio is already AAC)
        result = run_ffmpeg(['-c:a', 'copy'])
        if result.returncode != 0:
            print('ffmpeg copy failed, re-encoding audio to AAC...')
            # Try 2: re-encode audio to AAC (handles opus/webm/vorbis audio)
            result = run_ffmpeg(['-c:a', 'aac', '-b:a', '192k'])

        if result.returncode != 0:
            # Show LAST 800 chars – that's where actual error is (after version header)
            err_tail = result.stderr.decode('utf-8', errors='replace')[-800:]
            raise RuntimeError(f'ffmpeg failed:\n{err_tail}')

        if not os.path.exists(output_path) or os.path.getsize(output_path) < 1000:
            raise RuntimeError('ffmpeg produced empty output file')

        # Stream merged file to browser
        def stream_merged():
            try:
                with open(output_path, 'rb') as f:
                    while True:
                        chunk = f.read(65536)
                        if not chunk:
                            break
                        yield chunk
            finally:
                shutil.rmtree(tmp_dir, ignore_errors=True)

        file_size = os.path.getsize(output_path)
        safe_fn = filename.replace('"', "'").replace('\n', '').replace('\r', '')
        resp = Response(stream_with_context(stream_merged()), content_type='video/mp4')
        resp.headers['Content-Disposition'] = f'attachment; filename="{safe_fn}"'
        resp.headers['Content-Length'] = str(file_size)
        resp.headers['Cache-Control'] = 'no-cache'
        return resp

    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return jsonify({'error': f'Merge failed: {str(e)}'}), 503



# ─────────────────────────────────────────────────────────────────────────────
# /api/ytdlp-stream  –  yt-dlp powered server-side stream proxy
#   Uses yt-dlp to resolve the best combined video+audio URL, then streams
#   it back through our server (same-origin). Browser gets a proper
#   Content-Disposition: attachment response → saves as file directly.
#   No Cobalt, no CORS, no new tabs. Works reliably on HuggingFace!
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/ytdlp-stream')
def ytdlp_stream():
    url = request.args.get('url', '').strip()
    quality = request.args.get('quality', '720p').strip()
    is_audio = request.args.get('audio', 'false').lower() == 'true'
    filename = request.args.get('filename', '').strip() or 'download.mp4'

    if not url:
        return jsonify({'error': 'No URL provided'}), 400

    # Map quality label → yt-dlp format selector
    quality_map = {
        '2160p': '2160', '4k': '2160',
        '1440p': '1440', '1080p': '1080',
        '720p': '720', '480p': '480',
        '360p': '360', '240p': '240', '144p': '144'
    }
    height = quality_map.get(quality.lower(), '720')

    if is_audio:
        # Best audio only
        fmt = 'bestaudio[ext=m4a]/bestaudio/best'
        content_type = 'audio/mp4'
        safe_ext = 'm4a'
    else:
        # Best combined single-file stream at requested height (no merge needed)
        fmt = f'best[height<={height}][ext=mp4]/best[height<={height}]/best[ext=mp4]/best'
        content_type = 'video/mp4'
        safe_ext = 'mp4'

    try:
        ydl_opts = get_ydl_opts({
            'format': fmt,
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        })
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            stream_url = info.get('url')
            ext = info.get('ext', safe_ext)
            video_title = info.get('title', 'download')
            # Sanitize filename
            safe_title = re.sub(r'[\\/*?"<>|]', '', video_title)[:80]
            dl_filename = f"{safe_title}_{quality}.{ext}"
    except Exception as e:
        return jsonify({'error': f'yt-dlp extraction failed: {str(e)}'}), 503

    if not stream_url:
        return jsonify({'error': 'Could not resolve stream URL'}), 503

    def generate_stream():
        stream_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Referer': 'https://www.youtube.com/',
            'Connection': 'keep-alive'
        }
        try:
            r = requests.get(stream_url, headers=stream_headers, stream=True, timeout=300)
            for chunk in r.iter_content(chunk_size=65536):
                if chunk:
                    yield chunk
        except Exception as ex:
            print(f"ytdlp-stream proxy error: {ex}")

    safe_dl_filename = dl_filename.replace('"', "'").replace('\n', '').replace('\r', '')
    resp = Response(
        stream_with_context(generate_stream()),
        content_type=content_type
    )
    resp.headers['Content-Disposition'] = f'attachment; filename="{safe_dl_filename}"'
    resp.headers['Cache-Control'] = 'no-cache'
    resp.headers['X-Accel-Buffering'] = 'no'
    return resp



# ─────────────────────────────────────────────────────────────────────────────
# /api/cobalt-tunnel  –  Server-side Cobalt API caller (no CORS limitations!)
#   Browser cannot POST to Cobalt due to CORS restrictions on many instances.
#   This endpoint calls Cobalt from the server (server IPs are not restricted
#   by Cobalt) and returns the final stream/download URL as JSON.
#   The browser then triggers a native <a download> against that URL.
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/cobalt-tunnel')
def cobalt_tunnel():
    url = request.args.get('url', '').strip()
    quality = request.args.get('quality', '720p').strip()
    is_audio = request.args.get('audio', 'false').lower() == 'true'

    if not url:
        return jsonify({'error': 'No URL provided'}), 400

    # Map quality label → Cobalt videoQuality value
    quality_map = {
        '2160p': '2160', '4k': '2160',
        '1440p': '1440', '1080p': '1080',
        '720p': '720', '480p': '480',
        '360p': '360', '240p': '240', '144p': '144'
    }
    video_quality = quality_map.get(quality.lower(), '720')
    download_mode = 'audio' if is_audio else 'auto'
    audio_format = 'mp3' if is_audio else 'best'

    payload = {
        'url': url,
        'videoQuality': video_quality,
        'audioFormat': audio_format,
        'downloadMode': download_mode,
        'filenameStyle': 'pretty',
        'disableMetadata': False
    }
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    cobalt_instances = [
        'https://co.wuk.sh',
        'https://api.cobalt.tools',
        'https://cobalt.api.ryz.cx',
        'https://cobalt.best',
        'https://cobalt.flxbl.io',
        'https://cobalt.urdh.dev',
        'https://dl.cgm.rs'
    ]

    for instance in cobalt_instances:
        try:
            target = f"{instance}/api/json"
            if curl_requests:
                resp = curl_requests.post(target, headers=headers, json=payload, impersonate="chrome", timeout=8)
            else:
                resp = requests.post(target, headers=headers, json=payload, timeout=8)

            if resp.status_code == 200:
                data = resp.json()
                status = data.get('status', '')
                if status in ('stream', 'redirect', 'tunnel'):
                    dl_url = data.get('url') or data.get('tunnel')
                    filename = data.get('filename', 'download.mp4')
                    return jsonify({'url': dl_url, 'filename': filename, 'instance': instance})
                elif status == 'picker':
                    # Picker = multiple streams (audio+video separate) – take first
                    items = data.get('picker', [])
                    if items:
                        dl_url = items[0].get('url') or items[0].get('tunnel')
                        filename = data.get('filename', 'download.mp4')
                        return jsonify({'url': dl_url, 'filename': filename, 'instance': instance})
        except Exception:
            continue

    return jsonify({'error': 'All Cobalt instances failed. Please try again.'}), 503


# /api/cobalt-stream  –  Full server-side proxy: downloads from Cobalt and streams
#   back to browser via chunked transfer. This solves cross-origin download issues.
#   The browser downloads from OUR server (same origin), not from Cobalt's CDN,
#   so `<a download>` works perfectly, no new tab, audio+video fully merged.
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/cobalt-stream')
def cobalt_stream():
    url = request.args.get('url', '').strip()
    quality = request.args.get('quality', '720p').strip()
    is_audio = request.args.get('audio', 'false').lower() == 'true'
    filename = request.args.get('filename', '').strip() or 'download.mp4'

    if not url:
        return jsonify({'error': 'No URL provided'}), 400

    # Map quality label → Cobalt videoQuality value
    quality_map = {
        '2160p': '2160', '4k': '2160',
        '1440p': '1440', '1080p': '1080',
        '720p': '720', '480p': '480',
        '360p': '360', '240p': '240', '144p': '144'
    }
    video_quality = quality_map.get(quality.lower(), '720')
    download_mode = 'audio' if is_audio else 'auto'
    audio_format = 'mp3' if is_audio else 'best'

    payload = {
        'url': url,
        'videoQuality': video_quality,
        'audioFormat': audio_format,
        'downloadMode': download_mode,
        'filenameStyle': 'pretty',
        'disableMetadata': False
    }
    api_headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    cobalt_instances = [
        'https://co.wuk.sh',
        'https://api.cobalt.tools',
        'https://cobalt.api.ryz.cx',
        'https://cobalt.best',
        'https://cobalt.flxbl.io',
        'https://cobalt.urdh.dev',
        'https://dl.cgm.rs'
    ]

    stream_url = None
    cobalt_filename = filename

    # Step 1: Ask Cobalt for a download URL
    for instance in cobalt_instances:
        try:
            target = f"{instance}/api/json"
            if curl_requests:
                resp = curl_requests.post(target, headers=api_headers, json=payload, impersonate="chrome", timeout=10)
            else:
                resp = requests.post(target, headers=api_headers, json=payload, timeout=10)

            if resp.status_code == 200:
                data = resp.json()
                status = data.get('status', '')
                if status in ('stream', 'redirect', 'tunnel'):
                    stream_url = data.get('url') or data.get('tunnel')
                    cobalt_filename = data.get('filename', filename)
                    break
                elif status == 'picker':
                    items = data.get('picker', [])
                    if items:
                        stream_url = items[0].get('url') or items[0].get('tunnel')
                        cobalt_filename = data.get('filename', filename)
                        break
        except Exception:
            continue

    if not stream_url:
        return jsonify({'error': 'All Cobalt instances failed. Please try again.'}), 503

    # Step 2: Stream the Cobalt URL back to the browser through our server
    # This makes it same-origin → browser saves it as a file (no new tab!)
    def generate_stream():
        stream_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive'
        }
        try:
            if curl_requests:
                r = curl_requests.get(stream_url, headers=stream_headers, impersonate="chrome", stream=True, timeout=300)
            else:
                r = requests.get(stream_url, headers=stream_headers, stream=True, timeout=300)
            for chunk in r.iter_content(chunk_size=65536):
                if chunk:
                    yield chunk
        except Exception as e:
            print(f"cobalt-stream proxy error: {e}")

    # Sanitize filename for Content-Disposition header
    safe_filename = cobalt_filename.replace('"', "'").replace('\n', '').replace('\r', '')
    content_type = 'audio/mpeg' if is_audio else 'video/mp4'

    response = Response(
        stream_with_context(generate_stream()),
        content_type=content_type
    )
    response.headers['Content-Disposition'] = f'attachment; filename="{safe_filename}"'
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response

@app.route('/sw.js')
def service_worker():
    from flask import send_from_directory
    return send_from_directory('.', 'sw.js', mimetype='application/javascript')

@app.route('/manifest.json')
def manifest():
    from flask import send_from_directory
    return send_from_directory('.', 'manifest.json', mimetype='application/json')

@app.route('/')
@app.route('/index.html')
def index():
    return render_template('index.html')

def extract_video_data_server(url):
    info = None
    try:
        ydl_opts = get_ydl_opts({'extract_flat': False})
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        error_msg = f"TubeFlow: Impersonation extraction failed ({str(e)}). Retrying with standard options..."
        print(error_msg)
        try:
            with open("bgutil.log", "a") as log_file:
                log_file.write(f"\n{error_msg}\n")
        except Exception:
            pass
        try:
            fallback_opts = {
                'quiet': True,
                'no_warnings': True,
                'nocheckcertificate': True,
                'extract_flat': False,
                'extractor_args': {
                    'youtube': {
                        'player_client': ['android', 'ios', 'tv', 'creator']
                    },
                    'youtubepot-bgutilhttp': {
                        'base_url': 'http://127.0.0.1:4416'
                    }
                }
            }
            if os.path.exists('cookies.txt'):
                fallback_opts['cookiefile'] = 'cookies.txt'
            with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                info = ydl.extract_info(url, download=False)
        except Exception as e2:
            error_msg2 = f"TubeFlow: Standard fallback extraction failed ({str(e2)})."
            print(error_msg2)
            try:
                with open("bgutil.log", "a") as log_file:
                    log_file.write(f"\n{error_msg2}\n")
            except Exception:
                pass
        
    if not info:
        # Fallback to Invidious, Piped & Cobalt APIs to bypass the datacenter IP bot block!
        print("TubeFlow: yt-dlp blocked. Triggering Invidious/Piped/Cobalt APIs fallback...")
        fallback_res = fetch_youtube_via_fallback_apis(url)
        if fallback_res:
            source = fallback_res['source']
            data = fallback_res['data']
            instance = fallback_res['instance']
            print(f"TubeFlow: Successfully extracted details via fallback {source} instance: {instance}")
            if source == 'invidious':
                parsed_res = parse_invidious_info(data, url)
            elif source == 'cobalt':
                parsed_res = parse_cobalt_info(data, url)
            else:
                parsed_res = parse_piped_info(data, url)
            return parsed_res
        else:
            raise Exception('Could not extract video information. The platform is blocking extraction, or the link is invalid. Please try again.')
        
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
        
        if vcodec == 'none' and acodec == 'none' and (f.get('height') or f.get('width')):
            vcodec = 'mp4'
            acodec = 'aac'
            
        resolution = f.get('resolution')
        height = f.get('height')
        if not resolution and height:
            resolution = f"{f.get('width', 0)}x{height}"
        
        quality_label = f"{height}p" if height else (resolution or "Unknown")
        
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

    # 3. Video-only formats (High Res like 1080p, 1440p)
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

    # Sort video formats
    def get_height(x):
        label = x['quality_label']
        m = re.search(r'(\d+)', label)
        return int(m.group(1)) if m else 0
        
    video_formats.sort(key=get_height, reverse=True)
    
    # Sort audio formats
    def get_audio_bitrate(x):
        label = x['quality_label']
        m = re.search(r'(\d+)', label)
        return int(m.group(1)) if m else 0
    audio_formats.sort(key=get_audio_bitrate, reverse=True)

    return {
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
    }

@app.route('/api/info')
def get_info():
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL is required'}), 400
    
    try:
        data = extract_video_data_server(url)
        return jsonify(data)
        
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
            try:
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
                            'player_client': ['android', 'ios', 'tv', 'creator']
                        },
                        'youtubepot-bgutilhttp': {
                            'base_url': 'http://127.0.0.1:4416'
                        }
                    }
                }
                if os.path.exists('cookies.txt'):
                    fallback_opts['cookiefile'] = 'cookies.txt'
                with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                    ydl.download([url])
            except Exception as dl_err_final:
                print(f"TubeFlow Async: yt-dlp blocked on download ({str(dl_err_final)}). Falling back to Cobalt server-side merge...")
                try:
                    cobalt_res = None
                    for instance in COBALT_INSTANCES:
                        res = query_single_cobalt(instance, url)
                        if res:
                            cobalt_res = res
                            break
                    
                    if cobalt_res:
                        direct_url = cobalt_res['data'].get('url')
                        # Download direct Cobalt stream URL to our temp file
                        headers = {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                        }
                        if curl_requests:
                            response = curl_requests.get(direct_url, headers=headers, stream=True, impersonate="chrome", timeout=20)
                        else:
                            response = requests.get(direct_url, headers=headers, stream=True, timeout=20)
                        response.raise_for_status()
                        
                        temp_dest = os.path.join(temp_dir, f"tubeflow_{task_id}.mp4")
                        total_size = int(response.headers.get('content-length', 0))
                        downloaded = 0
                        
                        with open(temp_dest, 'wb') as f_out:
                            for chunk in response.iter_content(chunk_size=1024 * 1024):
                                if chunk:
                                    f_out.write(chunk)
                                    downloaded += len(chunk)
                                    percent = round((downloaded / total_size) * 100, 1) if total_size > 0 else 50
                                    with tasks_lock:
                                        if task_id in DOWNLOAD_TASKS:
                                            DOWNLOAD_TASKS[task_id].update({
                                                'status': 'downloading',
                                                'percent': percent,
                                                'msg': f"Downloading via server-side bypass: {percent}% completed"
                                            })
                    else:
                        raise Exception("Bypass servers are currently rate-limited. Please try again.")
                except Exception as fallback_err:
                    raise Exception(f"Bypass Failed: {str(fallback_err)}")
            
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
                            'player_client': ['android', 'ios', 'tv', 'creator']
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

def universal_server_download_worker(url, format_id, task_id, quality_label, format_type):
    try:
        temp_dir = tempfile.gettempdir()
        is_youtube = "youtube.com" in url or "youtu.be" in url
        is_merge = (format_type == 'merge')
        
        # Check if the format ID is a Cobalt-specific type
        is_cobalt_format = False
        try:
            if format_id:
                decoded_fid = base64.b64decode(format_id.encode('utf-8')).decode('utf-8')
                if 'cobalt' in decoded_fid:
                    is_cobalt_format = True
        except Exception:
            pass

        is_audio = (format_type == 'audio' or quality_label == 'Audio')

        # 1. Primary High-Speed Bypass: Request unblocked public Cobalt API directly
        # Always try Cobalt bypass first for YouTube, Cobalt-specific formats, or universal links!
        if is_youtube or is_cobalt_format or not is_youtube:
            with tasks_lock:
                DOWNLOAD_TASKS[task_id].update({
                    'status': 'downloading',
                    'percent': 10,
                    'msg': 'Requesting unblocked high-speed bypass node...'
                })
            try:
                cobalt_res = None
                
                # Fetch concurrently using thread pool
                def check_instance(instance):
                    return query_single_cobalt(instance, url, quality_label, is_audio)
                
                with ThreadPoolExecutor(max_workers=len(COBALT_INSTANCES)) as executor:
                    futures = [executor.submit(check_instance, inst) for inst in COBALT_INSTANCES]
                    for future in as_completed(futures, timeout=8.0):
                        try:
                            res = future.result()
                            if res:
                                cobalt_res = res
                                break
                        except Exception:
                            pass
                
                if cobalt_res:
                    cobalt_data = cobalt_res['data']
                    direct_url = cobalt_data.get('url') or cobalt_data.get('tunnel')
                    if not direct_url and cobalt_data.get('status') == 'picker':
                        items = cobalt_data.get('picker', [])
                        if items:
                            direct_url = items[0].get('url') or items[0].get('tunnel')
                    title = cobalt_data.get('filename') or "video"
                    if title.endswith('.mp4') or title.endswith('.webm') or title.endswith('.mkv') or title.endswith('.mp3') or title.endswith('.m4a'):
                        title = title.rsplit('.', 1)[0]
                        
                    with tasks_lock:
                        DOWNLOAD_TASKS[task_id].update({
                            'status': 'downloading',
                            'percent': 25,
                            'msg': 'Bypass secure connection established! Streaming bytes...'
                        })
                        
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                    }
                    if curl_requests:
                        response = curl_requests.get(direct_url, headers=headers, stream=True, impersonate="chrome", timeout=30)
                    else:
                        response = requests.get(direct_url, headers=headers, stream=True, timeout=30)
                    response.raise_for_status()
                    
                    ext = 'mp3' if is_audio else 'mp4'
                    final_filepath = os.path.join(temp_dir, f"tubeflow_{task_id}.{ext}")
                    total_size = int(response.headers.get('content-length', 0))
                    downloaded = 0
                    
                    with open(final_filepath, 'wb') as f_out:
                        for chunk in response.iter_content(chunk_size=1024 * 1024):
                            if chunk:
                                f_out.write(chunk)
                                downloaded += len(chunk)
                                percent = round((downloaded / total_size) * 100, 1) if total_size > 0 else 50
                                mapped_pct = 25 + int(percent * 0.7)
                                with tasks_lock:
                                    DOWNLOAD_TASKS[task_id].update({
                                        'status': 'downloading',
                                        'percent': mapped_pct,
                                        'msg': f"Downloading via bypass node: {percent}% completed"
                                    })
                                    
                    safe_title = sanitize_filename(title)
                    filename = f"{safe_title}.{ext}"
                    
                    with tasks_lock:
                        DOWNLOAD_TASKS[task_id].update({
                            'status': 'completed',
                            'percent': 100,
                            'filepath': final_filepath,
                            'filename': filename,
                            'msg': "Download complete! Ready to save."
                        })
                    return
            except Exception as e:
                print(f"TubeFlow Async: Primary Cobalt bypass failed ({str(e)}), falling back to standard...")
                
        # 2. Secondary Fallback: Extract and resolve on server using server-IP authorized streams
        with tasks_lock:
            DOWNLOAD_TASKS[task_id].update({
                'status': 'downloading',
                'percent': 20,
                'msg': 'Resolving server-side secure streams...'
            })
            
        server_data = extract_video_data_server(url)
        title = server_data.get('title', 'video')
        
        selected_format = None
        target_list = server_data.get('audio_formats' if format_type == 'audio' else 'video_formats', [])
        
        # Match by requested quality label
        for f in target_list:
            if f.get('quality_label') == quality_label:
                selected_format = f
                break
                
        if not selected_format and target_list:
            selected_format = target_list[0]
            
        if not selected_format:
            raise Exception(f"Format quality {quality_label} not found on server")
            
        server_format_id = selected_format.get('format_id')
        ext = selected_format.get('ext', 'mp4')
        is_merge = (selected_format.get('type') == 'merge')
        
        # Check if the resolved format is base64 encoded direct stream payload
        is_server_direct = False
        server_direct_url = ""
        try:
            decoded = base64.b64decode(server_format_id.encode('utf-8')).decode('utf-8')
            if '|' in decoded and (decoded.startswith('http://') or decoded.startswith('https://')):
                parts = decoded.split('|')
                server_direct_url = parts[0]
                is_server_direct = True
        except Exception:
            pass
            
        if is_server_direct:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
            if curl_requests:
                response = curl_requests.get(server_direct_url, headers=headers, stream=True, impersonate="chrome", timeout=25)
            else:
                response = requests.get(server_direct_url, headers=headers, stream=True, timeout=25)
            response.raise_for_status()
            
            final_filepath = os.path.join(temp_dir, f"tubeflow_{task_id}.{ext}")
            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0
            
            with open(final_filepath, 'wb') as f_out:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f_out.write(chunk)
                        downloaded += len(chunk)
                        percent = round((downloaded / total_size) * 100, 1) if total_size > 0 else 50
                        mapped_pct = 30 + int(percent * 0.65)
                        with tasks_lock:
                            DOWNLOAD_TASKS[task_id].update({
                                'status': 'downloading',
                                'percent': mapped_pct,
                                'msg': f"Downloading secure stream: {percent}% completed"
                            })
                            
            safe_title = sanitize_filename(title)
            filename = f"{safe_title}.{ext}"
            
            with tasks_lock:
                DOWNLOAD_TASKS[task_id].update({
                    'status': 'completed',
                    'percent': 100,
                    'filepath': final_filepath,
                    'filename': filename,
                    'msg': "Download complete! Ready to save."
                })
        else:
            async_download_worker(url, server_format_id, task_id, title, is_merge)
            
    except Exception as e:
        print(f"TubeFlow Universal Async Error: {str(e)}")
        with tasks_lock:
            if task_id in DOWNLOAD_TASKS:
                DOWNLOAD_TASKS[task_id].update({
                    'status': 'error',
                    'msg': f"Bypass Failed: {str(e)}"
                })

# API 1: Start background download task
@app.route('/api/download/start')
def start_async_download():
    url = request.args.get('url')
    format_id = request.args.get('url_format_id') or request.args.get('format_id')
    quality_label = request.args.get('quality_label')
    format_type = request.args.get('format_type')
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
        
    is_youtube = "youtube.com" in url or "youtu.be" in url
    is_direct = False
    direct_url = ""
    title = "video"
    ext = "mp4"
    
    # We only use direct client URLs for non-YouTube platforms where CDN links aren't IP-locked!
    if not is_youtube and format_id:
        try:
            decoded = base64.b64decode(format_id.encode('utf-8')).decode('utf-8')
            if '|' in decoded and (decoded.startswith('http://') or decoded.startswith('https://')):
                parts = decoded.split('|')
                direct_url = parts[0]
                title = parts[1]
                ext = parts[2]
                is_direct = True
        except Exception:
            pass
            
    if is_direct:
        task_id = str(uuid.uuid4())
        with tasks_lock:
            DOWNLOAD_TASKS[task_id] = {
                'status': 'starting',
                'percent': 0,
                'speed': '0 KB/s',
                'eta': 'calculating...',
                'msg': 'Initializing direct CDN downloader thread...',
                'filepath': '',
                'filename': '',
                'created_at': time.time()
            }
            
        thread = threading.Thread(
            target=direct_stream_download_worker,
            args=(direct_url, task_id, title, ext),
            daemon=True
        )
        thread.start()
        return jsonify({'task_id': task_id, 'title': title})
        
    # Standard server bypass download: runs entirely in the background thread for instant response!
    task_id = str(uuid.uuid4())
    with tasks_lock:
        DOWNLOAD_TASKS[task_id] = {
            'status': 'starting',
            'percent': 0,
            'speed': '0 KB/s',
            'eta': 'calculating...',
            'msg': 'Initializing secure server bypass connection...',
            'filepath': '',
            'filename': '',
            'created_at': time.time()
        }
        
    thread = threading.Thread(
        target=universal_server_download_worker,
        args=(url, format_id, task_id, quality_label, format_type),
        daemon=True
    )
    thread.start()
    
    return jsonify({'task_id': task_id, 'title': 'Processing Media'})

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

# Free Virtual SMS Receiver endpoints using sms24.me
@app.route('/api/sms/countries')
def get_sms_countries():
    try:
        from bs4 import BeautifulSoup
        url = "https://sms24.me/en/countries"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
        if curl_requests:
            r = curl_requests.get(url, headers=headers, impersonate="chrome", timeout=10)
        else:
            r = requests.get(url, headers=headers, timeout=10)
        if r.status_code != 200:
            return jsonify({'error': f'Failed to fetch countries: HTTP {r.status_code}'}), 502
            
        soup = BeautifulSoup(r.text, 'html.parser')
        links = soup.find_all('a', href=True)
        countries = []
        for l in links:
            href = l['href']
            if "/en/countries/" in href:
                code = href.split("/en/countries/")[-1].strip("/")
                if not code:
                    continue
                h3_tag = l.find('h3')
                name = h3_tag.get_text().strip() if h3_tag else ""
                
                span_flag = l.find('span')
                flag = span_flag.get_text().strip() if span_flag else ""
                
                # Check for active number count
                spans = l.find_all('span')
                count = ""
                if len(spans) > 1:
                    count = spans[1].get_text().strip()
                
                countries.append({
                    'code': code,
                    'name': name,
                    'flag': flag,
                    'count': count
                })
        
        # Deduplicate
        unique_countries = []
        seen = set()
        for c in countries:
            if c['code'] not in seen:
                seen.add(c['code'])
                unique_countries.append(c)
                
        return jsonify(unique_countries)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sms/numbers')
def get_sms_numbers():
    country = request.args.get('country', '').strip().lower()
    if not country:
        return jsonify({'error': 'Country code is required'}), 400
    try:
        from bs4 import BeautifulSoup
        url = f"https://sms24.me/en/countries/{country}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
        if curl_requests:
            r = curl_requests.get(url, headers=headers, impersonate="chrome", timeout=10)
        else:
            r = requests.get(url, headers=headers, timeout=10)
        if r.status_code != 200:
            return jsonify({'error': f'Failed to fetch numbers: HTTP {r.status_code}'}), 502
            
        soup = BeautifulSoup(r.text, 'html.parser')
        links = soup.find_all('a', href=True)
        numbers = []
        for l in links:
            href = l['href']
            if "/en/numbers/" in href:
                num = href.split("/en/numbers/")[-1].strip("/")
                num = num.split("?")[0].split("/")[0]
                if num.isdigit() and len(num) > 6:
                    h3_tag = l.find('h3')
                    c_name = h3_tag.get_text().strip() if h3_tag else ""
                    
                    p_mono = l.find('p', class_=lambda c: c and 'font-mono' in c)
                    number_val = p_mono.get_text().strip() if p_mono else f"+{num}"
                    
                    # Find count tag
                    p_tags = l.find_all('p')
                    sms_count = ""
                    for pt in p_tags:
                        pt_text = pt.get_text().strip()
                        if "SMS" in pt_text:
                            sms_count = pt_text
                            break
                            
                    span_flag = l.find('span')
                    flag = span_flag.get_text().strip() if span_flag else ""
                    
                    numbers.append({
                        'number': num,
                        'display_number': number_val,
                        'country_name': c_name,
                        'sms_count': sms_count,
                        'flag': flag
                    })
                    
        # Deduplicate
        unique_numbers = []
        seen = set()
        for n in numbers:
            if n['number'] not in seen:
                seen.add(n['number'])
                unique_numbers.append(n)
                
        return jsonify(unique_numbers)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sms/inbox')
def get_sms_inbox():
    number = request.args.get('number', '').strip()
    if not number or not number.isdigit():
        return jsonify({'error': 'Valid number is required'}), 400
    try:
        from bs4 import BeautifulSoup
        url = f"https://sms24.me/en/numbers/{number}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
        if curl_requests:
            r = curl_requests.get(url, headers=headers, impersonate="chrome", timeout=10)
        else:
            r = requests.get(url, headers=headers, timeout=10)
        if r.status_code != 200:
            return jsonify({'error': f'Failed to fetch messages: HTTP {r.status_code}'}), 502
            
        soup = BeautifulSoup(r.text, 'html.parser')
        articles = soup.find_all('article')
        messages = []
        for art in articles:
            sender_a = art.find('a', href=True)
            sender = sender_a.get_text().strip() if sender_a else "Unknown"
            if sender.startswith("From:"):
                sender = sender.replace("From:", "").strip()
                
            time_tag = art.find('time')
            timestamp = time_tag.get_text().strip() if time_tag else "Unknown time"
            
            p_tag = art.find('p')
            message_text = p_tag.get_text().strip() if p_tag else ""
            
            messages.append({
                'sender': sender,
                'time': timestamp,
                'text': message_text
            })
            
        return jsonify(messages)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Stateless proxy route for Temp Mail (1secmail & Maildrop.cc hybrid)
@app.route('/api/mail')
def api_mail_proxy():
    action = request.args.get('action')
    if not action:
        return jsonify({'error': 'Action is required'}), 400
        
    domain = request.args.get('domain', '')
    
    # Route to Maildrop.cc if domain is maildrop.cc
    if domain.lower() == 'maildrop.cc':
        graphql_url = 'https://api.maildrop.cc/graphql'
        headers = {
            'content-type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
        
        if action == 'gen':
            import random
            import string
            fake_emails = []
            for _ in range(5):
                prefix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
                fake_emails.append(f"{prefix}@maildrop.cc")
            return jsonify(fake_emails)
            
        elif action == 'getMessages':
            login = request.args.get('login')
            if not login:
                return jsonify({'error': 'Missing login parameter'}), 400
            
            query = """
            query {
              inbox(mailbox: "%s") {
                id
                mailfrom
                subject
                date
              }
            }
            """ % login.replace('"', '\\"')
            
            try:
                if curl_requests:
                    r = curl_requests.post(graphql_url, json={"query": query}, headers=headers, impersonate="chrome", timeout=12)
                else:
                    r = requests.post(graphql_url, json={"query": query}, headers=headers, timeout=12)
                r.raise_for_status()
                data = r.json()
                inbox = data.get('data', {}).get('inbox', []) or []
                mapped = []
                for msg in inbox:
                    dt_str = msg.get('date', '')
                    if 'T' in dt_str:
                        dt_str = dt_str.replace('T', ' ').split('.')[0]
                    mapped.append({
                        "id": msg.get('id'),
                        "from": msg.get('mailfrom'),
                        "subject": msg.get('subject'),
                        "date": dt_str
                    })
                return jsonify(mapped)
            except Exception as e:
                return jsonify({'error': str(e)}), 500
                
        elif action == 'readMessage':
            login = request.args.get('login')
            msg_id = request.args.get('id')
            if not login or not msg_id:
                return jsonify({'error': 'Missing login or id parameters'}), 400
                
            query = """
            query {
              message(mailbox: "%s", id: "%s") {
                id
                headerfrom
                subject
                date
                html
              }
            }
            """ % (login.replace('"', '\\"'), msg_id.replace('"', '\\"'))
            
            try:
                if curl_requests:
                    r = curl_requests.post(graphql_url, json={"query": query}, headers=headers, impersonate="chrome", timeout=12)
                else:
                    r = requests.post(graphql_url, json={"query": query}, headers=headers, timeout=12)
                r.raise_for_status()
                data = r.json()
                maildrop_msg = data.get('data', {}).get('message', {})
                if not maildrop_msg:
                    return jsonify({'error': 'Message not found'}), 404
                    
                dt_str = maildrop_msg.get('date', '')
                if 'T' in dt_str:
                    dt_str = dt_str.replace('T', ' ').split('.')[0]
                
                html_content = maildrop_msg.get('html', '')
                mapped_msg = {
                    "id": maildrop_msg.get('id'),
                    "from": maildrop_msg.get('headerfrom'),
                    "subject": maildrop_msg.get('subject'),
                    "date": dt_str,
                    "body": html_content,
                    "textBody": html_content,
                    "htmlBody": html_content
                }
                return jsonify(mapped_msg)
            except Exception as e:
                return jsonify({'error': str(e)}), 500
        else:
            return jsonify({'error': 'Invalid action'}), 400
            
    # Default to 1secmail
    target_url = 'https://www.1secmail.com/api/v1/'
    
    if action == 'gen':
        target_url += '?action=genEmailAddresses&count=5'
    elif action == 'getMessages':
        login = request.args.get('login')
        domain = request.args.get('domain')
        if not login or not domain:
            return jsonify({'error': 'Missing login or domain parameters'}), 400
        target_url += f"?action=getMessages&login={urllib.parse.quote(login)}&domain={urllib.parse.quote(domain)}"
    elif action == 'readMessage':
        login = request.args.get('login')
        domain = request.args.get('domain')
        msg_id = request.args.get('id')
        if not login or not domain or not msg_id:
            return jsonify({'error': 'Missing login, domain or id parameters'}), 400
        target_url += f"?action=readMessage&login={urllib.parse.quote(login)}&domain={urllib.parse.quote(domain)}&id={urllib.parse.quote(msg_id)}"
    else:
        return jsonify({'error': 'Invalid action'}), 400
        
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
        if curl_requests:
            r = curl_requests.get(target_url, headers=headers, impersonate="chrome", timeout=12)
        else:
            r = requests.get(target_url, headers=headers, timeout=12)
            
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# API Mail.tm Proxy Route to bypass direct ISP blocking of Mail.tm (CORS-enabled frontend proxy)
@app.route('/api/mail/tm/<path:subpath>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def mail_tm_proxy(subpath):
    target_url = f"https://api.mail.tm/{subpath}"
    if request.query_string:
        target_url += f"?{request.query_string.decode('utf-8')}"
        
    headers = {}
    if 'Authorization' in request.headers:
        headers['Authorization'] = request.headers['Authorization']
    headers['Content-Type'] = 'application/json'
    headers['Accept'] = 'application/json'
    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    
    data = request.get_data()
    method = request.method.upper()
    
    try:
        if curl_requests:
            if method == 'GET':
                r = curl_requests.get(target_url, headers=headers, impersonate="chrome", timeout=15)
            elif method == 'POST':
                r = curl_requests.post(target_url, headers=headers, data=data, impersonate="chrome", timeout=15)
            elif method == 'DELETE':
                r = curl_requests.delete(target_url, headers=headers, impersonate="chrome", timeout=15)
            else:
                r = curl_requests.request(method, target_url, headers=headers, data=data, impersonate="chrome", timeout=15)
        else:
            r = requests.request(method, target_url, headers=headers, data=data, timeout=15)
            
        try:
            return jsonify(r.json()), r.status_code
        except Exception:
            return r.text, r.status_code
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Enable CORS for cross-origin frontend hosting environments (like GitHub Pages)
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    return response

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
