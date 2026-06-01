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
    
    // Process formatStreams
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
            note: `Direct Stream (${ext.toUpperCase()})`
        });
    });
    
    // Process adaptiveFormats
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
            
            video_formats.push({
                format_id: encoded_id,
                ext: ext,
                resolution: f.resolution || '',
                quality_label: quality,
                filesize: size,
                type: 'combined',
                note: 'Direct Video'
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
            // Check Piped bitrate fallback estimation
            const apiBitrate = parseInt(f.bitrate || 0);
            if (apiBitrate > 10000) {
                size = Math.floor((apiBitrate * duration) / 8);
            } else {
                size = estimateSize(quality, duration);
            }
        }
        
        video_formats.push({
            format_id: encoded_id,
            ext: ext,
            resolution: quality,
            quality_label: quality,
            filesize: size,
            type: 'combined',
            note: 'Direct Video'
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
                <button type="button" class="btn-download format-dl-btn" title="Download ${f.quality_label}" onclick="triggerDownload('${f.format_id}', '${f.ext}', '${f.quality_label}')">
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
                <button type="button" class="btn-download format-dl-btn" title="Download Audio" onclick="triggerDownload('${f.format_id}', '${f.ext}', 'Audio')">
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

// Trigger Asynchronous progress-monitored download
async function triggerDownload(formatId, ext, qualityLabel) {
    if (!currentVideo) return;
    
    // Check if it is a combined direct stream URL to download directly in the browser!
    try {
        const decoded = atob(formatId);
        if (decoded.includes('|') && !formatId.includes('merge')) {
            const parts = decoded.split('|');
            const directUrl = parts[0];
            const title = parts[1] || 'video';
            const ext = parts[2] || 'mp4';
            if (directUrl.startsWith('http://') || directUrl.startsWith('https://')) {
                const link = document.createElement('a');
                link.href = directUrl;
                link.target = '_blank';
                link.download = `${title.replace(/[\\/*?:"<>|]/g, '')}_${qualityLabel}.${ext}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showStatus('Download started directly in browser at full speed!', 'success');
                return;
            }
        }
    } catch (_) {}
    
    // Clear any existing active download intervals
    if (activeDownloadInterval) {
        clearInterval(activeDownloadInterval);
        activeDownloadInterval = null;
    }
    
    const url = currentVideo.url;
    const title = currentVideo.title;
    const downloadFilename = `${title.replace(/[\\/*?:"<>|]/g, '')}_${qualityLabel}.${ext}`;
    
    // Initialize & Show Progress Bar Card
    progressSection.classList.remove('hidden');
    progressSection.scrollIntoView({ behavior: 'smooth', block: 'end' });
    
    const progressFill = document.getElementById('progress-bar-fill');
    const progressPercent = document.getElementById('progress-percent');
    const progressStatus = document.getElementById('progress-status');
    const progressFileLabel = document.getElementById('progress-filename');
    
    progressFileLabel.textContent = downloadFilename;
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin font-accent"></i> Initializing download task on server...`;
    
    // Lock buttons
    toggleDownloadButtons(false);
    
    try {
        // Step 1: Start Asynchronous Download Task on Backend
        const startResponse = await fetch(`/api/download/start?url=${encodeURIComponent(url)}&format_id=${formatId}`);
        const startData = await startResponse.json();
        
        if (!startResponse.ok || startData.error) {
            throw new Error(startData.error || 'Failed to start download task.');
        }
        
        const taskId = startData.task_id;
        
        // Step 2: Establish real-time polling to query download progress
        activeDownloadInterval = setInterval(async () => {
            try {
                const progResponse = await fetch(`/api/download/progress?task_id=${taskId}`);
                if (!progResponse.ok) return; // Silent retry
                
                const progData = await progResponse.json();
                
                if (progData.status === 'downloading') {
                    // Update progress fill bar
                    progressFill.classList.remove('pulsing-fill');
                    progressFill.style.width = `${progData.percent}%`;
                    progressPercent.textContent = `${progData.percent}%`;
                    
                    // Display download speeds & ETA
                    progressStatus.innerHTML = `<i class="fa-solid fa-download fa-bounce font-accent"></i> Downloading: ${progData.percent}% &bull; Speed: ${progData.speed} &bull; ETA: ${progData.eta}`;
                    
                } else if (progData.status === 'merging') {
                    // High-quality merge postprocessing in progress
                    progressFill.style.width = '95%';
                    progressFill.classList.add('pulsing-fill');
                    progressPercent.textContent = '95%';
                    progressStatus.innerHTML = `<i class="fa-solid fa-compact-disc fa-spin font-accent"></i> ${progData.msg}`;
                    
                } else if (progData.status === 'completed') {
                    // Download and merging is fully completed on server!
                    clearInterval(activeDownloadInterval);
                    activeDownloadInterval = null;
                    
                    progressFill.style.width = '100%';
                    progressFill.classList.remove('pulsing-fill');
                    progressPercent.textContent = '100%';
                    progressStatus.innerHTML = `<span style="color: var(--success)"><i class="fa-solid fa-circle-check"></i> Server assembly complete! Saving file natively...</span>`;
                    
                    // Unlock buttons
                    toggleDownloadButtons(true);
                    
                    // Step 3: Trigger direct instant file download via hidden iframe
                    let downloadIframe = document.getElementById('download-iframe');
                    if (!downloadIframe) {
                        downloadIframe = document.createElement('iframe');
                        downloadIframe.id = 'download-iframe';
                        downloadIframe.style.display = 'none';
                        document.body.appendChild(downloadIframe);
                    }
                    downloadIframe.src = `/api/download/get?task_id=${taskId}`;
                    
                    // Hide progress card after 6 seconds
                    setTimeout(() => {
                        progressSection.classList.add('hidden');
                    }, 6000);
                    
                } else if (progData.status === 'error') {
                    // Thread crashed
                    clearInterval(activeDownloadInterval);
                    activeDownloadInterval = null;
                    throw new Error(progData.msg || 'An error occurred during server download worker execution.');
                }
                
            } catch (pollErr) {
                console.error('Polling error:', pollErr);
            }
        }, 800); // Poll every 800ms
        
    } catch (error) {
        console.error(error);
        progressPercent.textContent = 'Failed';
        progressStatus.innerHTML = `<span style="color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${error.message || 'Server task failed.'}</span>`;
        toggleDownloadButtons(true);
        
        setTimeout(() => {
            progressSection.classList.add('hidden');
        }, 8000);
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
