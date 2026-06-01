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
    
    const targets = [
        { type: 'invidious', url: `https://invidious.projectsegfau.lt/api/v1/videos/${videoId}` },
        { type: 'invidious', url: `https://invidious.no-logs.com/api/v1/videos/${videoId}` },
        { type: 'invidious', url: `https://inv.tux.im/api/v1/videos/${videoId}` },
        { type: 'invidious', url: `https://yewtu.be/api/v1/videos/${videoId}` },
        { type: 'piped', url: `https://pipedapi.colbyland.org/streams/${videoId}` },
        { type: 'piped', url: `https://pipedapi.kavin.rocks/streams/${videoId}` },
        { type: 'piped', url: `https://pipedapi.ram.icu/streams/${videoId}` }
    ];
    
    try {
        const regRes = await fetch("https://api.invidious.io/instances.json?sort_by=type,health");
        if (regRes.ok) {
            const regData = await regRes.json();
            let count = 0;
            for (let item of regData) {
                const domain = item[0];
                const details = item[1];
                if (details.type === 'https' && details.api !== false && count < 5) {
                    const uri = details.uri || `https://${domain}`;
                    targets.push({ type: 'invidious', url: `${uri}/api/v1/videos/${videoId}` });
                    count++;
                }
            }
        }
    } catch (_) {}
    
    return new Promise((resolve, reject) => {
        let completed = 0;
        let errors = [];
        const controllers = [];
        
        targets.forEach(target => {
            const controller = new AbortController();
            controllers.push(controller);
            
            fetch(target.url, { signal: controller.signal })
                .then(async res => {
                    if (res.ok) {
                        const json = await res.json();
                        controllers.forEach(c => c.abort());
                        
                        try {
                            const parsed = target.type === 'invidious' 
                                ? parseInvidiousClientSide(json, url)
                                : parsePipedClientSide(json, url);
                            resolve(parsed);
                        } catch (err) {
                            reject(err);
                        }
                    } else {
                        throw new Error(`HTTP ${res.status}`);
                    }
                })
                .catch(err => {
                    if (err.name !== 'AbortError') {
                        errors.push(err);
                        completed++;
                        if (completed >= targets.length) {
                            reject(new Error("All client-side extraction nodes failed."));
                        }
                    }
                });
        });
        
        setTimeout(() => {
            controllers.forEach(c => c.abort());
            reject(new Error("Client-side extraction timed out."));
        }, 7000);
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
    let isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    
    if (isYouTube) {
        showStatus('Bypassing YouTube server blocks via unblockable client-side routing...', 'loading');
        try {
            data = await extractYouTubeClientSide(url);
        } catch (clientErr) {
            console.warn("Client-side extraction failed, falling back to server:", clientErr);
        }
    }
    
    if (!data) {
        showStatus('Connecting to platform and extracting media details... This takes a few seconds.', 'loading');
        try {
            const response = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
            data = await response.json();
            
            if (!response.ok || data.error) {
                throw new Error(data.error || 'Failed to extract video information from this link');
            }
        } catch (error) {
            console.error(error);
            showStatus(`Error: ${error.message || 'Something went wrong. Please check your link or network connection.'}`, 'error');
            setLoading(false);
            return;
        }
    }
    
    currentVideo = data;
    displayResults(data);
    saveToHistory(data);
    showStatus('Media successfully analyzed!', 'success');
    
    // Smooth scroll to results
    setTimeout(() => {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    setLoading(false);
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
        'https://api.cobalt.tools',
        'https://cobalt.api.ryz.cx',
        'https://cobalt.best',
        'https://cobalt.moe'
    ];
    
    let quality = '720';
    const q = qualityLabel.toLowerCase();
    if (q.includes('2160') || q.includes('4k')) quality = '2160';
    else if (q.includes('1440') || q.includes('2k')) quality = '1440';
    else if (q.includes('1080')) quality = '1080';
    else if (q.includes('720')) quality = '720';
    else if (q.includes('480')) quality = '480';
    else if (q.includes('360')) quality = '360';
    
    const payload = {
        url: videoUrl,
        vQuality: quality,
        isAudioOnly: isAudio,
        filenamePattern: 'classic'
    };
    
    for (let instance of instances) {
        for (let path of ["/api/json", ""]) {
            try {
                const response = await fetch(`${instance}${path}`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                if (response.ok) {
                    const json = await response.json();
                    if (json && json.url && ['stream', 'redirect', 'tunnel'].includes(json.status)) {
                        return json.url;
                    }
                }
            } catch (_) {}
        }
    }
    throw new Error("SaaS merge servers are currently busy. Please try a standard 'Direct' resolution.");
}

// Trigger Asynchronous progress-monitored download
async function triggerDownload(formatId, ext, qualityLabel, formatType) {
    if (!currentVideo) return;
    
    // Clear any existing active download intervals
    if (activeDownloadInterval) {
        clearInterval(activeDownloadInterval);
        activeDownloadInterval = null;
    }
    
    const url = currentVideo.url;
    const title = currentVideo.title;
    const downloadFilename = `${title.replace(/[\\/*?:"<>|]/g, '')}_${qualityLabel}.${ext}`;
    
    const isCombined = formatType === 'combined' || qualityLabel === 'Audio';
    const isMerge = formatType === 'merge';
    
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
    
    // 1. Direct Browser-Side Download for combined formats (With Sound natively, in Same Tab!)
    if (isCombined) {
        progressStatus.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin font-accent"></i> Streaming file bytes directly in same tab...`;
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
            }
        } catch (err) {
            console.warn("Client-side direct download failed, falling back to secure server-side download:", err);
            startServerSideDownload(formatId, ext, qualityLabel, false, downloadFilename);
            return;
        }
    }
    
    // 2. High-Resolution Video + Audio Merge (Bypasses server block entirely via Client-Side Cobalt Merger!)
    if (isMerge) {
        progressStatus.innerHTML = `<i class="fa-solid fa-compact-disc fa-spin font-accent"></i> Merging high-definition video+audio tracks (100% bypass)...`;
        try {
            // Fetch pre-merged stream URL from Cobalt's dynamic API
            const mergedUrl = await getCobaltMergedLink(url, qualityLabel);
            
            progressFill.style.width = '60%';
            progressPercent.textContent = 'Streaming';
            progressStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin font-accent"></i> Streaming merged HD file bytes directly in same tab...`;
            
            // Download merged file via CORS proxy
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(mergedUrl)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error("CORS Proxy failed to stream merged file");
            
            progressFill.style.width = '85%';
            progressPercent.textContent = 'Assembling';
            progressStatus.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin font-accent"></i> Finalizing high-definition MP4 file with sound...`;
            
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
            progressStatus.innerHTML = `<span style="color: var(--success)"><i class="fa-solid fa-circle-check"></i> HD Download completed successfully with sound!</span>`;
            showStatus('High-Definition download completed successfully!', 'success');
            toggleDownloadButtons(true);
            
            setTimeout(() => {
                progressSection.classList.add('hidden');
            }, 5000);
            return;
        } catch (err) {
            console.warn("Client-side HD merge failed, falling back to secure server-side download & merge:", err);
            startServerSideDownload(formatId, ext, qualityLabel, true, downloadFilename);
            return;
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
    
    // We request `/api/download/start?url=...&format_id=...`
    const startUrl = `/api/download/start?url=${encodeURIComponent(url)}&format_id=${encodeURIComponent(formatId)}`;
    
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
