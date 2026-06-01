// State Variables
let currentVideo = null;
let activeTab = 'video';
let activePlatform = 'youtube';
let activeDownloadInterval = null;

// DOM Elements
const bodyEl = document.body;
const urlInput = document.getElementById('youtube-url');
const fetchForm = document.getElementById('fetch-form');
const fetchBtn = document.getElementById('fetch-btn');
const clearBtn = document.getElementById('clear-btn');
const statusMessage = document.getElementById('status-message');
const resultsSection = document.getElementById('results-section');
const progressSection = document.getElementById('progress-section');
const dynamicInputIcon = document.getElementById('dynamic-input-icon');
const activePlatformBadge = document.getElementById('active-platform-badge');
const downloaderCardTitle = document.getElementById('downloader-card-title');
const downloaderCardDesc = document.getElementById('downloader-card-desc');

// Platform configs supporting YouTube, Instagram, TikTok, Facebook and Universal site groups
const platformConfigs = {
    youtube: {
        themeClass: 'theme-youtube',
        placeholder: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        iconClass: 'fa-brands fa-youtube',
        badgeText: 'YouTube Mode',
        cardTitle: 'Paste YouTube Link',
        cardDesc: 'Enter a YouTube URL to extract standard MP4 resolutions, adaptive HD video formats, and high-fidelity audios.'
    },
    instagram: {
        themeClass: 'theme-instagram',
        placeholder: 'https://www.instagram.com/reel/C8a9XyPJz3b/',
        iconClass: 'fa-brands fa-instagram',
        badgeText: 'Instagram Mode',
        cardTitle: 'Paste Instagram Reel Link',
        cardDesc: 'Enter an Instagram video, reel, or IGTV URL to extract and download high-quality MP4 media.'
    },
    tiktok: {
        themeClass: 'theme-tiktok',
        placeholder: 'https://www.tiktok.com/@khaby.lame/video/70367375231/',
        iconClass: 'fa-brands fa-tiktok',
        badgeText: 'TikTok Mode',
        cardTitle: 'Paste TikTok Video Link',
        cardDesc: 'Enter a TikTok video link to instantly fetch and download high-definition TikTok streams.'
    },
    facebook: {
        themeClass: 'theme-facebook',
        placeholder: 'https://www.facebook.com/watch/?v=1234567890',
        iconClass: 'fa-brands fa-facebook',
        badgeText: 'Facebook Mode',
        cardTitle: 'Paste Facebook Video Link',
        cardDesc: 'Paste a Facebook Video, Live, or Watch URL to fetch and download high-speed MP4 media.'
    },
    universal: {
        themeClass: 'theme-universal',
        placeholder: 'Paste link here (Twitter, Reddit, Vimeo, Twitch, DailyMotion...)',
        iconClass: 'fa-solid fa-globe',
        badgeText: 'Universal Mode',
        cardTitle: 'Universal All Video Downloader',
        cardDesc: 'TubeFlow extracts high-speed video streams from Twitter (X), Reddit, Twitch, Vimeo, DailyMotion, and 1,000+ supported sites.'
    }
};

// Event Listeners
urlInput.addEventListener('input', () => {
    const val = urlInput.value.trim();
    if (val !== '') {
        clearBtn.style.display = 'block';
        detectAndSwitchPlatform(val); // Auto theme-morphing on paste
    } else {
        clearBtn.style.display = 'none';
    }
});

clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearBtn.style.display = 'none';
    urlInput.focus();
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    selectPlatform('youtube');
    renderHistory();
});

// Dynamic Platform Selector
function selectPlatform(platform, element = null) {
    activePlatform = platform;
    
    // Manage tab buttons styling
    const tabs = document.querySelectorAll('.platform-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    if (element) {
        element.classList.add('active');
    } else {
        // Fallback: match by class prefix
        const prefix = platform === 'youtube' ? 'btn-yt' : 
                       (platform === 'instagram' ? 'btn-ig' : 
                       (platform === 'tiktok' ? 'btn-tt' : 
                       (platform === 'facebook' ? 'btn-fb' : 'btn-uni')));
        const activeTabButton = document.querySelector(`.${prefix}`);
        if (activeTabButton) activeTabButton.classList.add('active');
    }
    
    // Apply theme shifting class on body
    const cfg = platformConfigs[platform];
    bodyEl.className = cfg.themeClass;
    
    // Update Input UI dynamically
    urlInput.placeholder = cfg.placeholder;
    dynamicInputIcon.className = `${cfg.iconClass} input-icon`;
    activePlatformBadge.textContent = cfg.badgeText;
    downloaderCardTitle.textContent = cfg.cardTitle;
    downloaderCardDesc.textContent = cfg.cardDesc;
}

// Auto Platform-Morphing on URL entry
function detectAndSwitchPlatform(url) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        if (activePlatform !== 'youtube') selectPlatform('youtube');
    } else if (url.includes('instagram.com')) {
        if (activePlatform !== 'instagram') selectPlatform('instagram');
    } else if (url.includes('tiktok.com')) {
        if (activePlatform !== 'tiktok') selectPlatform('tiktok');
    } else if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.gg')) {
        if (activePlatform !== 'facebook') selectPlatform('facebook');
    } else if (isValidUrl(url)) {
        // Any other valid URL triggers the glowing Rainbow Universal Mode!
        if (activePlatform !== 'universal') selectPlatform('universal');
    }
}

// General URL validator supporting dynamic sites
function isValidUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

// Extract 11-char YouTube ID in Javascript
function getYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Smart Filesize Estimator for dynamic resolutions
function estimateSize(quality, duration, isAudio = false) {
    if (!duration || duration <= 0) return 0;
    if (isAudio) {
        const q = (quality || '').toLowerCase();
        let bytesPerSec = 24000; // ~192kbps (Default)
        if (q.includes('320')) bytesPerSec = 40000;
        else if (q.includes('256')) bytesPerSec = 32000;
        else if (q.includes('128')) bytesPerSec = 16000;
        else if (q.includes('64')) bytesPerSec = 8000;
        return bytesPerSec * duration;
    }
    const q = (quality || '').toLowerCase();
    let bytesPerSec = 100000; // ~800kbps (Default)
    if (q.includes('2160') || q.includes('4k')) bytesPerSec = 2200000; // ~2.2 MB/s
    else if (q.includes('1440') || q.includes('2k')) bytesPerSec = 1200000; // ~1.2 MB/s
    else if (q.includes('1080')) bytesPerSec = 550000; // ~550 KB/s
    else if (q.includes('720')) bytesPerSec = 300000; // ~300 KB/s
    else if (q.includes('480')) bytesPerSec = 150000; // ~150 KB/s
    else if (q.includes('360')) bytesPerSec = 80000;  // ~80 KB/s
    else if (q.includes('240')) bytesPerSec = 40000;
    return bytesPerSec * duration;
}

// Client-Side Invidious payload mapper
function parseInvidiousClientSide(data, url) {
    const title = data.title || 'Unknown Video';
    const author = data.author || 'Unknown Creator';
    
    let thumbnail = "";
    const thumbnails = data.videoThumbnails || [];
    if (thumbnails.length > 0) {
        thumbnails.sort((a, b) => (b.width || 0) - (a.width || 0));
        thumbnail = thumbnails[0].url || '';
    }
    
    const duration = data.lengthSeconds || 0;
    const views = data.viewCount || 0;
    const description = (data.description || '').substring(0, 300) + '...';
    
    const video_formats = [];
    const audio_formats = [];
    
    // Process formatStreams (Combined video + audio - with sound!)
    (data.formatStreams || []).forEach(f => {
        const ext = f.container || 'mp4';
        const quality = f.qualityLabel || '360p';
        const payload = `${f.url}|${title}|${ext}`;
        const encoded_id = btoa(unescape(encodeURIComponent(payload)));
        
        let size = parseInt(f.size) || 0;
        if (!size || size < 50000) {
            size = estimateSize(quality, duration);
        }
        
        video_formats.push({
            format_id: encoded_id,
            ext: ext,
            resolution: f.resolution || '',
            quality_label: quality,
            filesize: size,
            type: 'combined',
            note: 'Video + Audio (Direct)'
        });
    });
    
    // Process adaptiveFormats (Separate video-only and audio-only)
    (data.adaptiveFormats || []).forEach(f => {
        const mime = f.type || '';
        const ext = f.container || 'mp4';
        const payload = `${f.url}|${title}|${ext}`;
        const encoded_id = btoa(unescape(encodeURIComponent(payload)));
        
        if (mime.includes('audio/')) {
            const quality = f.audioQuality || 'High Quality';
            const bitrate = Math.floor(parseInt(f.bitrate || 0) / 1000);
            
            let size = parseInt(f.size) || 0;
            if (!size || size < 10000) {
                size = estimateSize(quality, duration, true);
            }
            
            audio_formats.push({
                format_id: encoded_id,
                ext: ext,
                quality_label: bitrate ? `${bitrate}kbps` : quality,
                filesize: size,
                type: 'audio',
                note: `Audio only (${ext.toUpperCase()})`
            });
        } else if (mime.includes('video/')) {
            const quality = f.qualityLabel || '360p';
            
            let size = parseInt(f.size) || 0;
            if (!size || size < 50000) {
                size = estimateSize(quality, duration);
            }
            
            // This is video-only! We treat it as a merge format so the server merges it with audio
            video_formats.push({
                format_id: encoded_id,
                ext: 'mp4',
                resolution: f.resolution || '',
                quality_label: quality,
                filesize: size,
                type: 'merge',
                note: 'Video + Audio (HQ Merge)'
            });
        }
    });
    
    video_formats.sort((a, b) => {
        const ha = parseInt(a.quality_label) || 0;
        const hb = parseInt(b.quality_label) || 0;
        return hb - ha;
    });
    
    return {
        title,
        author,
        thumbnail,
        duration,
        duration_formatted: formatDurationClientSide(duration),
        views,
        views_formatted: formatViewsClientSide(views),
        description,
        video_formats,
        audio_formats,
        url
    };
}

// Client-Side Piped payload mapper
function parsePipedClientSide(data, url) {
    const title = data.title || 'Unknown Video';
    const author = data.uploader || 'Unknown Creator';
    const thumbnail = data.thumbnailUrl || '';
    const duration = data.duration || 0;
    const views = data.views || 0;
    const description = (data.description || '').substring(0, 300) + '...';
    
    const video_formats = [];
    const audio_formats = [];
    
    (data.videoStreams || []).forEach(f => {
        const mime = f.mimeType || '';
        const ext = mime.includes('video/mp4') ? 'mp4' : 'webm';
        const quality = f.quality || '360p';
        const payload = `${f.url}|${title}|${ext}`;
        const encoded_id = btoa(unescape(encodeURIComponent(payload)));
        
        let size = parseInt(f.size) || 0;
        if (!size || size < 50000) {
            const apiBitrate = parseInt(f.bitrate || 0);
            if (apiBitrate > 10000) {
                size = Math.floor((apiBitrate * duration) / 8);
            } else {
                size = estimateSize(quality, duration);
            }
        }
        
        const isVideoOnly = f.videoOnly === true;
        
        video_formats.push({
            format_id: encoded_id,
            ext: isVideoOnly ? 'mp4' : ext,
            resolution: quality,
            quality_label: quality,
            filesize: size,
            type: isVideoOnly ? 'merge' : 'combined',
            note: isVideoOnly ? 'Video + Audio (HQ Merge)' : 'Video + Audio (Direct)'
        });
    });
    
    (data.audioStreams || []).forEach(f => {
        const mime = f.mimeType || '';
        const ext = mime.includes('audio/mp4') ? 'm4a' : 'webm';
        const quality = f.quality || 'High Quality';
        const bitrate = Math.floor(parseInt(f.bitrate || 0) / 1000);
        const payload = `${f.url}|${title}|${ext}`;
        const encoded_id = btoa(unescape(encodeURIComponent(payload)));
        
        let size = parseInt(f.size) || 0;
        if (!size || size < 10000) {
            const apiBitrate = parseInt(f.bitrate || 0);
            if (apiBitrate > 5000) {
                size = Math.floor((apiBitrate * duration) / 8);
            } else {
                size = estimateSize(quality, duration, true);
            }
        }
        
        audio_formats.push({
            format_id: encoded_id,
            ext: ext,
            quality_label: bitrate ? `${bitrate}kbps` : quality,
            filesize: size,
            type: 'audio',
            note: `Audio only (${ext.toUpperCase()})`
        });
    });
    
    video_formats.sort((a, b) => {
        const ha = parseInt(a.quality_label) || 0;
        const hb = parseInt(b.quality_label) || 0;
        return hb - ha;
    });
    
    return {
        title,
        author,
        thumbnail,
        duration,
        duration_formatted: formatDurationClientSide(duration),
        views,
        views_formatted: formatViewsClientSide(views),
        description,
        video_formats,
        audio_formats,
        url
    };
}

// Client-Side format helpers
function formatDurationClientSide(seconds) {
    if (!seconds) return "0:00";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatViewsClientSide(views) {
    if (!views) return "0 views";
    const num = parseInt(views);
    if (num >= 1e9) return (num / 1e9).toFixed(1) + "B views";
    if (num >= 1e6) return (num / 1e6).toFixed(1) + "M views";
    if (num >= 1e3) return (num / 1e3).toFixed(1) + "K views";
    return num + " views";
}

async function extractYouTubeClientSide(url) {
    const videoId = getYouTubeId(url);
    if (!videoId) throw new Error("Could not extract Video ID");
    
    // Invidious and Piped have native CORS headers - direct fetch works!
    // DO NOT wrap in corsproxy - it breaks AbortController signal chaining
    const targets = [
        { type: 'invidious', url: `https://invidious.projectsegfau.lt/api/v1/videos/${videoId}` },
        { type: 'invidious', url: `https://invidious.no-logs.com/api/v1/videos/${videoId}` },
        { type: 'invidious', url: `https://inv.tux.im/api/v1/videos/${videoId}` },
        { type: 'invidious', url: `https://yewtu.be/api/v1/videos/${videoId}` },
        { type: 'invidious', url: `https://invidious.privacyredirect.com/api/v1/videos/${videoId}` },
        { type: 'piped', url: `https://pipedapi.colbyland.org/streams/${videoId}` },
        { type: 'piped', url: `https://pipedapi.kavin.rocks/streams/${videoId}` },
        { type: 'piped', url: `https://pipedapi.ram.icu/streams/${videoId}` },
        { type: 'piped', url: `https://piped-api.garudalinux.org/streams/${videoId}` }
    ];
    
    // Add more live instances from the registry (no proxy needed - CORS open)
    try {
        const regRes = await fetch("https://api.invidious.io/instances.json?sort_by=type,health",
            { signal: AbortSignal.timeout(3000) });
        if (regRes.ok) {
            const regData = await regRes.json();
            let count = 0;
            for (let item of regData) {
                const details = item[1];
                if (details.type === 'https' && details.api !== false && count < 6) {
                    const uri = details.uri || `https://${item[0]}`;
                    targets.push({ type: 'invidious', url: `${uri}/api/v1/videos/${videoId}` });
                    count++;
                }
            }
        }
    } catch (_) {}
    
    return new Promise((resolve, reject) => {
        let completed = 0;
        let resolved = false;
        const controllers = [];
        
        targets.forEach(target => {
            const controller = new AbortController();
            controllers.push(controller);
            
            // Direct fetch - Invidious/Piped support CORS natively
            fetch(target.url, { signal: controller.signal })
                .then(async res => {
                    if (resolved) return;
                    if (res.ok) {
                        const json = await res.json();
                        if (resolved) return;
                        resolved = true;
                        controllers.forEach(c => c.abort());
                        try {
                            const parsed = target.type === 'invidious'
                                ? parseInvidiousClientSide(json, url)
                                : parsePipedClientSide(json, url);
                            resolve(parsed);
                        } catch (parseErr) {
                            reject(parseErr);
                        }
                    } else {
                        throw new Error(`HTTP ${res.status}`);
                    }
                })
                .catch(err => {
                    if (err.name === 'AbortError') return;
                    completed++;
                    if (!resolved && completed >= targets.length) {
                        // All Invidious/Piped failed - try Cobalt as last resort
                        getCobaltMergedLink(url, '720p')
                            .then(cobaltData => {
                                if (resolved) return;
                                resolved = true;
                                let title = cobaltData.filename || 'Extracted Video';
                                if (title.endsWith('.mp4') || title.endsWith('.webm') || title.endsWith('.mkv')) {
                                    title = title.substring(0, title.lastIndexOf('.'));
                                }
                                resolve(buildCobaltResult(url, title, cobaltData.url));
                            })
                            .catch(cobaltErr => {
                                if (!resolved) reject(new Error("All extraction nodes failed."));
                            });
                    }
                });
        });
        
        // 12 second timeout (was 7s - too short for slow nodes)
        setTimeout(() => {
            if (!resolved) {
                controllers.forEach(c => c.abort());
                reject(new Error("Extraction timed out."));
            }
        }, 12000);
    });
}

// Fetch Video Metadata (Supports client-side unblockable YouTube extraction!)
async function handleFetch(urlToFetch = null) {
    const url = urlToFetch || urlInput.value.trim();
    if (!url) {
        showStatus('Please enter a media link.', 'error');
        return;
    }
    
    if (!isValidUrl(url)) {
        showStatus('Please enter a valid HTTP/HTTPS link (e.g. https://...).', 'error');
        return;
    }

    // Set Loading State
    showStatus('Connecting and bypassing blockages... Please wait.', 'loading');
    setLoading(true);
    resultsSection.classList.add('hidden');
    progressSection.classList.add('hidden');
    
    if (activeDownloadInterval) {
        clearInterval(activeDownloadInterval);
        activeDownloadInterval = null;
    }
    
    let data = null;
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

    // =========================================================
    // STEP 1: Browser-side Invidious/Piped (YouTube only)
    //   - These APIs have native CORS support (no proxy needed)
    //   - User's IP is never blocked by Google
    //   - This is what originally worked 100%!
    // =========================================================
    if (isYouTube) {
        showStatus('Bypassing YouTube via browser-side Invidious/Piped nodes...', 'loading');
        try {
            data = await extractYouTubeClientSide(url);
        } catch (clientErr) {
            console.warn("Invidious/Piped extraction failed, trying Cobalt...", clientErr);
        }
    }

    // =========================================================
    // STEP 2: Cobalt bypass (works for ALL platforms)
    // =========================================================
    if (!data) {
        showStatus('Activating Cobalt bypass extraction engine...', 'loading');
        try {
            const cobaltData = await getCobaltMergedLink(url, '720p');
            let title = cobaltData.filename || 'Extracted Video';
            if (title.endsWith('.mp4') || title.endsWith('.webm') || title.endsWith('.mkv')) {
                title = title.substring(0, title.lastIndexOf('.'));
            }
            data = buildCobaltResult(url, title, cobaltData.url);
        } catch (cobaltErr) {
            console.warn("Cobalt extraction failed, trying server...", cobaltErr);
        }
    }

    // =========================================================
    // STEP 3: Server /api/info (absolute last resort)
    // =========================================================
    if (!data) {
        showStatus('Trying server extraction...', 'loading');
        try {
            const response = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
            const serverData = await response.json();
            if (!response.ok || serverData.error) {
                throw new Error(serverData.error || 'Server extraction failed');
            }
            data = serverData;
        } catch (serverErr) {
            console.error("All extraction methods failed:", serverErr);
            showStatus(`Extraction failed on all nodes. Please try again.`, 'error');
            setLoading(false);
            return;
        }
    }

    currentVideo = data;
    displayResults(data);
    saveToHistory(data);
    showStatus('✅ Media successfully extracted!', 'success');
    
    // Smooth scroll to results
    setTimeout(() => {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    setLoading(false);
}

// Helper: Build a standard result object from a Cobalt bypass URL
function buildCobaltResult(url, title, cobaltUrl) {
    return {
        title: title,
        author: "TubeFlow Bypass Engine",
        thumbnail: `https://i.ytimg.com/vi/${getYouTubeId(url) || 'default'}/maxresdefault.jpg`,
        duration: 0,
        duration_formatted: "Direct Stream",
        views: 0,
        views_formatted: "—",
        description: "Extracted and bypassed successfully via Cobalt unblocked server pool.",
        video_formats: [
            {
                format_id: btoa(unescape(encodeURIComponent(`${cobaltUrl}|${title}|mp4`))),
                ext: 'mp4',
                resolution: '1080p',
                quality_label: '1080p',
                filesize: 0,
                type: 'combined',
                note: '🔥 Full HD 1080p (Cobalt Bypass)'
            },
            {
                format_id: btoa(unescape(encodeURIComponent(`${cobaltUrl}|${title}|mp4`))),
                ext: 'mp4',
                resolution: '720p',
                quality_label: '720p',
                filesize: 0,
                type: 'combined',
                note: '⚡ HD 720p (Cobalt Bypass)'
            }
        ],
        audio_formats: [
            {
                format_id: btoa(unescape(encodeURIComponent(`${cobaltUrl}|${title}|mp3`))),
                ext: 'mp3',
                quality_label: '320kbps',
                filesize: 0,
                type: 'audio',
                note: '🎵 High-Quality MP3 (Cobalt Bypass)'
            }
        ],
        url: url
    };
}

// Render Loading Spinner state
function setLoading(isLoading) {
    const btnText = fetchBtn.querySelector('.btn-text');
    const btnLoader = fetchBtn.querySelector('.btn-loader');
    
    if (isLoading) {
        fetchBtn.disabled = true;
        urlInput.disabled = true;
        btnText.classList.add('hidden');
        btnLoader.classList.remove('hidden');
    } else {
        fetchBtn.disabled = false;
        urlInput.disabled = false;
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
    }
}

// Show Alert Messages
function showStatus(message, type) {
    statusMessage.className = `status-msg ${type}`;
    
    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if (type === 'error') {
        icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
    } else if (type === 'success') {
        icon = '<i class="fa-solid fa-circle-check"></i>';
    } else if (type === 'loading') {
        icon = '<i class="fa-solid fa-circle-notch fa-spin font-accent"></i>';
    }
    
    statusMessage.innerHTML = `${icon} <span>${message}</span>`;
    statusMessage.classList.remove('hidden');
}

// Render Results to DOM
function displayResults(video) {
    // Fill basic metadata
    document.getElementById('video-thumbnail').src = video.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=640';
    
    // Manage aspect-ratio layout and hide duration badge if duration is unknown (e.g. some live streams/FB reels)
    const durationBadge = document.getElementById('video-duration');
    if (video.duration && video.duration > 0) {
        durationBadge.textContent = video.duration_formatted;
        durationBadge.style.display = 'block';
    } else {
        durationBadge.style.display = 'none';
    }
    
    document.getElementById('video-title').textContent = video.title;
    document.getElementById('video-author').textContent = video.author;
    document.getElementById('video-views').textContent = video.views_formatted;
    document.getElementById('video-desc').textContent = video.description || 'No description available.';
    
    // Inject formats
    renderFormats(video);
    
    // Un-hide results
    resultsSection.classList.remove('hidden');
    
    // Default to Video tab
    switchTab('video');
}

// Helper to format file sizes
function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return 'Unknown Size';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Populate formats lists
function renderFormats(video) {
    const videoList = document.getElementById('video-formats-list');
    const audioList = document.getElementById('audio-formats-list');
    
    videoList.innerHTML = '';
    audioList.innerHTML = '';
    
    // Render Video Formats
    if (video.video_formats && video.video_formats.length > 0) {
        video.video_formats.forEach(f => {
            const isHigh = f.quality_label.includes('1080p') || f.quality_label.includes('720p') || f.quality_label.includes('HD');
            const isMerge = f.type === 'merge';
            
            let badgeClass = 'format-badge';
            if (isHigh) badgeClass += ' high-quality';
            if (isMerge) badgeClass += ' no-audio'; // Amber label for merges
            
            const card = document.createElement('div');
            card.className = 'format-card';
            card.innerHTML = `
                <div class="format-info-left">
                    <span class="${badgeClass}">${f.quality_label}</span>
                    <div class="format-meta-details">
                        <span class="format-label-title">${f.note}</span>
                        <span class="format-subtext">${formatBytes(f.filesize)} &bull; File extension: .${f.ext}</span>
                    </div>
                </div>
                <button type="button" class="btn-download format-dl-btn" title="Download ${f.quality_label}" onclick="triggerDownload('${f.format_id}', '${f.ext}', '${f.quality_label}', '${f.type}')">
                    <i class="fa-solid fa-arrow-down"></i>
                </button>
            `;
            videoList.appendChild(card);
        });
    } else {
        videoList.innerHTML = '<p class="pane-help">No video formats found.</p>';
    }
    
    // Render Audio Formats
    if (video.audio_formats && video.audio_formats.length > 0) {
        video.audio_formats.forEach(f => {
            const card = document.createElement('div');
            card.className = 'format-card';
            card.innerHTML = `
                <div class="format-info-left">
                    <span class="format-badge high-quality"><i class="fa-solid fa-music"></i> ${f.quality_label}</span>
                    <div class="format-meta-details">
                        <span class="format-label-title">${f.note}</span>
                        <span class="format-subtext">${formatBytes(f.filesize)} &bull; File extension: .${f.ext}</span>
                    </div>
                </div>
                <button type="button" class="btn-download format-dl-btn" title="Download Audio" onclick="triggerDownload('${f.format_id}', '${f.ext}', 'Audio', '${f.type}')">
                    <i class="fa-solid fa-arrow-down"></i>
                </button>
            `;
            audioList.appendChild(card);
        });
    } else {
        audioList.innerHTML = '<p class="pane-help">No audio formats found.</p>';
    }
}

// Switch between video and audio tabs
function switchTab(tab) {
    activeTab = tab;
    
    const tabVideo = document.getElementById('tab-video');
    const tabAudio = document.getElementById('tab-audio');
    const paneVideo = document.getElementById('pane-video');
    const paneAudio = document.getElementById('pane-audio');
    
    if (tab === 'video') {
        tabVideo.classList.add('active');
        tabAudio.classList.remove('active');
        paneVideo.classList.add('active');
        paneAudio.classList.remove('active');
    } else {
        tabVideo.classList.remove('active');
        tabAudio.classList.add('active');
        paneVideo.classList.remove('active');
        paneAudio.classList.add('active');
    }
}

// Toggle format download buttons enabled state
function toggleDownloadButtons(enabled) {
    const buttons = document.querySelectorAll('.format-dl-btn');
    buttons.forEach(btn => {
        btn.disabled = !enabled;
        if (!enabled) {
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    });
}
// Client-Side high-resolution video + audio merger using public Cobalt APIs
async function getCobaltMergedLink(videoUrl, qualityLabel, isAudio = false) {
    const instances = [
        'https://co.wuk.sh',
        'https://api.cobalt.tools',
        'https://cobalt.api.ryz.cx',
        'https://cobalt.best',
        'https://cobalt.moe',
        'https://co.eepy.today',
        'https://api.kuko.rip'
    ];
    
    let q = '720';
    const qLower = (qualityLabel || '').toLowerCase();
    if (qLower.includes('2160') || qLower.includes('4k')) q = '2160';
    else if (qLower.includes('1440') || qLower.includes('2k')) q = '1440';
    else if (qLower.includes('1080')) q = '1080';
    else if (qLower.includes('720')) q = '720';
    else if (qLower.includes('480')) q = '480';
    else if (qLower.includes('360')) q = '360';
    
    // We try 3 levels of payloads to bypass strict JSON schema validators (v7 vs v6 vs minimal)!
    const payloads = [
        // Level 1: Strict Cobalt v7 payload (clean)
        {
            url: videoUrl,
            isAudioOnly: isAudio,
            videoQuality: q,
            audioFormat: isAudio ? 'mp3' : undefined
        },
        // Level 2: Strict Cobalt v6 payload (clean)
        {
            url: videoUrl,
            isAudioOnly: isAudio,
            vQuality: q
        },
        // Level 3: Minimal universal payload (100% accepted by all versions)
        {
            url: videoUrl
        }
    ];
    
    for (let instance of instances) {
        for (let path of ["/api/json", ""]) {
            for (let payload of payloads) {
                // Filter undefined values
                const cleanPayload = {};
                for (let [k, v] of Object.entries(payload)) {
                    if (v !== undefined) cleanPayload[k] = v;
                }
                
                try {
                    const response = await fetch(`${instance}${path}`, {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(cleanPayload)
                    });
                    if (response.ok) {
                        const json = await response.json();
                        if (json && json.url && ['stream', 'redirect', 'tunnel'].includes(json.status)) {
                            return {
                                url: json.url,
                                filename: json.filename || 'Extracted Video'
                            };
                        }
                    }
                } catch (_) {}
            }
        }
    }
    throw new Error("SaaS merge servers are currently busy. Please try a standard 'Direct' resolution.");
}

// Trigger Asynchronous progress-monitored download (100% Serverless, Client-Side!)
async function triggerDownload(formatId, ext, qualityLabel, formatType) {
    if (!currentVideo) return;
    
    const url = currentVideo.url;
    const title = currentVideo.title;
    const downloadFilename = `${title.replace(/[\\/*?:"<>|]/g, '')}_${qualityLabel}.${ext}`;
    
    const isAudio = formatType === 'audio' || qualityLabel === 'Audio';
    
    // Set Loading state
    showStatus('Processing download... Please wait.', 'loading');
    
    // Show Progress Bar Card
    progressSection.classList.remove('hidden');
    progressSection.scrollIntoView({ behavior: 'smooth', block: 'end' });
    
    const progressFill = document.getElementById('progress-bar-fill');
    const progressPercent = document.getElementById('progress-percent');
    const progressStatus = document.getElementById('progress-status');
    const progressFileLabel = document.getElementById('progress-filename');
    
    progressFileLabel.textContent = downloadFilename;
    progressFill.style.width = '30%';
    progressFill.classList.add('pulsing-fill');
    progressPercent.textContent = 'Buffering';
    
    // Lock buttons
    toggleDownloadButtons(false);
    
    // 1. Try Cobalt first (100% serverless, fast, direct same-tab download)
    progressStatus.innerHTML = `<i class="fa-solid fa-compact-disc fa-spin font-accent"></i> Bypassing blocks and establishing high-speed download stream...`;
    try {
        const cobaltData = await getCobaltMergedLink(url, qualityLabel, isAudio);
        const downloadUrl = cobaltData.url;
        
        progressFill.style.width = '100%';
        progressFill.classList.remove('pulsing-fill');
        progressPercent.textContent = '100%';
        progressStatus.innerHTML = `<span style="color: var(--success)"><i class="fa-solid fa-circle-check"></i> High-speed download stream ready! Starting...</span>`;
        
        // Trigger native download in the same tab
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = downloadFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showStatus('Download started successfully!', 'success');
        toggleDownloadButtons(true);
        
        setTimeout(() => {
            progressSection.classList.add('hidden');
        }, 5000);
        return;
        
    } catch (cobaltErr) {
        console.warn("High-speed Cobalt download failed, trying browser-side fallback...", cobaltErr);
        
        // 2. Fallback to direct download via CORS Proxy
        progressStatus.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin font-accent"></i> Cobalt busy. Trying browser-side proxy download...`;
        try {
            const decoded = atob(formatId);
            if (decoded.includes('|')) {
                const parts = decoded.split('|');
                const directUrl = parts[0];
                
                const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(directUrl)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error("CORS Proxy failed to fetch");
                
                progressFill.style.width = '70%';
                progressPercent.textContent = 'Saving';
                progressStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin font-accent"></i> Assembling file bytes...`;
                
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = downloadFilename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(blobUrl);
                
                progressFill.style.width = '100%';
                progressFill.classList.remove('pulsing-fill');
                progressPercent.textContent = '100%';
                progressStatus.innerHTML = `<span style="color: var(--success)"><i class="fa-solid fa-circle-check"></i> Download completed successfully!</span>`;
                showStatus('Download completed successfully!', 'success');
                toggleDownloadButtons(true);
                
                setTimeout(() => {
                    progressSection.classList.add('hidden');
                }, 5000);
                return;
            } else {
                throw new Error("Invalid format ID");
            }
        } catch (proxyErr) {
            console.warn("CORS proxy download failed, trying final alternative direct download...", proxyErr);
            
            // 3. Last resort fallback: open direct stream link (might open in new tab if blocked by CORS)
            try {
                const decoded = atob(formatId);
                if (decoded.includes('|')) {
                    const directUrl = decoded.split('|')[0];
                    
                    const link = document.createElement('a');
                    link.href = directUrl;
                    link.download = downloadFilename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    progressFill.style.width = '100%';
                    progressFill.classList.remove('pulsing-fill');
                    progressPercent.textContent = '100%';
                    progressStatus.innerHTML = `<span style="color: var(--success)"><i class="fa-solid fa-circle-check"></i> Download triggered! (Alternative stream)</span>`;
                    showStatus('Download triggered!', 'success');
                    toggleDownloadButtons(true);
                    
                    setTimeout(() => {
                        progressSection.classList.add('hidden');
                    }, 5000);
                    return;
                }
            } catch (_) {}
            
            // If all failed
            progressPercent.textContent = 'Failed';
            progressStatus.innerHTML = `<span style="color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Download failed. Please try a different resolution or format.</span>`;
            toggleDownloadButtons(true);
        }
    }
}

// Secure Server-Side download & merge manager with realtime progress polling
function startServerSideDownload(formatId, ext, qualityLabel, isMerge, downloadFilename) {
    const url = currentVideo.url;
    const progressFill = document.getElementById('progress-bar-fill');
    const progressPercent = document.getElementById('progress-percent');
    const progressStatus = document.getElementById('progress-status');
    
    progressStatus.innerHTML = `<i class="fa-solid fa-server fa-spin font-accent"></i> Initializing secure server bypass connection...`;
    
    const formatType = isMerge ? 'merge' : 'combined';
    const startUrl = `/api/download/start?url=${encodeURIComponent(url)}&format_id=${encodeURIComponent(formatId)}&quality_label=${encodeURIComponent(qualityLabel)}&format_type=${encodeURIComponent(formatType)}`;
    
    fetch(startUrl)
        .then(res => {
            if (!res.ok) throw new Error("Server bypass connection could not be established");
            return res.json();
        })
        .then(data => {
            if (data.error) throw new Error(data.error);
            const taskId = data.task_id;
            
            activeDownloadInterval = setInterval(() => {
                fetch(`/api/download/progress?task_id=${taskId}`)
                    .then(res => {
                        if (!res.ok) throw new Error("Progress connection lost");
                        return res.json();
                    })
                    .then(progress => {
                        if (progress.status === 'starting') {
                            progressFill.style.width = '10%';
                            progressPercent.textContent = '10%';
                            progressStatus.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin font-accent"></i> ${progress.msg || 'Connecting...'}`;
                        } else if (progress.status === 'downloading') {
                            const pct = progress.percent || 0;
                            const mappedPct = Math.min(80, Math.round(pct * 0.8));
                            progressFill.style.width = `${mappedPct}%`;
                            progressPercent.textContent = `${pct}%`;
                            progressStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin font-accent"></i> ${progress.msg || 'Streaming file...'}`;
                        } else if (progress.status === 'merging') {
                            progressFill.style.width = '90%';
                            progressPercent.textContent = '95%';
                            progressStatus.innerHTML = `<i class="fa-solid fa-compact-disc fa-spin font-accent"></i> Merging high-definition tracks with FFmpeg on server...`;
                        } else if (progress.status === 'completed') {
                            clearInterval(activeDownloadInterval);
                            activeDownloadInterval = null;
                            
                            progressFill.style.width = '100%';
                            progressPercent.textContent = '100%';
                            progressStatus.innerHTML = `<span style="color: var(--success)"><i class="fa-solid fa-circle-check"></i> Processing complete! Delivering file in same tab...</span>`;
                            
                            const downloadUrl = `/api/download/get?task_id=${taskId}`;
                            
                            const link = document.createElement('a');
                            link.href = downloadUrl;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            
                            showStatus('Download completed successfully!', 'success');
                            toggleDownloadButtons(true);
                            
                            setTimeout(() => {
                                progressSection.classList.add('hidden');
                            }, 8000);
                        } else if (progress.status === 'error') {
                            clearInterval(activeDownloadInterval);
                            activeDownloadInterval = null;
                            throw new Error(progress.msg || "An error occurred on the download server.");
                        }
                    })
                    .catch(err => {
                        clearInterval(activeDownloadInterval);
                        activeDownloadInterval = null;
                        handleDownloadFailure(err.message || "Bypass connection interrupted.");
                    });
            }, 1000);
        })
        .catch(err => {
            handleDownloadFailure(err.message || "Bypass routing failed.");
        });
        
    function handleDownloadFailure(errorMsg) {
        console.error("Server-side download error:", errorMsg);
        progressPercent.textContent = 'Failed';
        progressStatus.innerHTML = `<span style="color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Bypass Failed: ${errorMsg}<br>Please select a standard <b>Direct (Combined)</b> format for instant download.</span>`;
        toggleDownloadButtons(true);
    }
}

// LocalStorage Search History Manager
function getHistory() {
    const history = localStorage.getItem('tubeflow_history');
    return history ? JSON.parse(history) : [];
}

function saveToHistory(video) {
    let history = getHistory();
    // Exclude duplicates
    history = history.filter(item => item.url !== video.url);
    // Insert at front
    history.unshift({
        url: video.url,
        title: video.title,
        author: video.author,
        thumbnail: video.thumbnail,
        views_formatted: video.views_formatted,
        duration_formatted: video.duration_formatted,
        timestamp: Date.now()
    });
    
    // Cap history to 6 items
    if (history.length > 6) {
        history.pop();
    }
    
    localStorage.setItem('tubeflow_history', JSON.stringify(history));
    renderHistory();
}

function deleteHistoryItem(url, event) {
    event.stopPropagation(); // Avoid triggering card click
    let history = getHistory();
    history = history.filter(item => item.url !== url);
    localStorage.setItem('tubeflow_history', JSON.stringify(history));
    renderHistory();
}

function clearHistory() {
    localStorage.removeItem('tubeflow_history');
    renderHistory();
}

function renderHistory() {
    const historyContainer = document.getElementById('history-container');
    const clearBtn = document.getElementById('clear-history-btn');
    const history = getHistory();
    
    if (history.length === 0) {
        clearBtn.classList.add('hidden');
        historyContainer.innerHTML = `
            <div class="history-empty">
                <i class="fa-solid fa-search history-empty-icon"></i>
                <p>No recent downloads or searches yet. Paste a link from YouTube, Instagram or TikTok above to start.</p>
            </div>
        `;
        return;
    }
    
    clearBtn.classList.remove('hidden');
    historyContainer.innerHTML = '';
    
    history.forEach(video => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.onclick = () => {
            urlInput.value = video.url;
            handleFetch(video.url);
        };
        
        card.innerHTML = `
            <div class="history-info-left">
                <img class="history-thumb" src="${video.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=120'}" alt="Thumb">
                <div class="history-metadata">
                    <span class="history-video-title">${video.title}</span>
                    <span class="history-video-author">${video.author} &bull; ${video.views_formatted} &bull; ${video.duration_formatted}</span>
                </div>
            </div>
            <div class="history-action-right">
                <button type="button" class="btn-history-action" title="Fetch video again">
                    <i class="fa-solid fa-rotate-left"></i>
                </button>
                <button type="button" class="btn-history-action delete-hist" title="Remove from list" onclick="deleteHistoryItem('${video.url}', event)">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        
        historyContainer.appendChild(card);
    });
}
