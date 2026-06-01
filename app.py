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
    'https://co.wuk.sh',
    'https://api.cobalt.tools',
    'https://cobalt.api.ryz.cx',
    'https://cobalt.best',
    'https://cobalt.moe',
    'https://co.eepy.today',
    'https://api.kuko.rip'
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

def query_single_cobalt(instance, url):
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
    
    payloads = [
        # Level 1: Strict v7 payload
        {
            'url': url,
            'videoQuality': '720'
        },
        # Level 2: Strict v6 payload
        {
            'url': url,
            'vQuality': '720'
        },
        # Level 3: Minimal universal payload
        {
            'url': url
        }
    ]
    
    for path in ["/api/json", ""]:
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

@app.route('/')
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
            raise Exception('Could not extract video information. YouTube is actively blocking this server IP. Please try again.')
        
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
        
        # 1. Primary High-Speed Bypass: Request unblocked public Cobalt API directly
        if is_youtube:
            with tasks_lock:
                DOWNLOAD_TASKS[task_id].update({
                    'status': 'downloading',
                    'percent': 10,
                    'msg': 'Requesting unblocked high-speed bypass node...'
                })
            try:
                cobalt_res = None
                for instance in COBALT_INSTANCES:
                    res = query_single_cobalt(instance, url)
                    if res:
                        cobalt_res = res
                        break
                
                if cobalt_res:
                    direct_url = cobalt_res['data'].get('url')
                    title = cobalt_res['data'].get('filename') or "video"
                    if title.endswith('.mp4') or title.endswith('.webm') or title.endswith('.mkv'):
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
                    
                    final_filepath = os.path.join(temp_dir, f"tubeflow_{task_id}.mp4")
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
                    filename = f"{safe_title}.mp4"
                    
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
