// Determine API base URL depending on hosting environment to enable static site decoders fallback (like GitHub Pages)
const API_BASE_URL = (
    window.location.hostname.includes('hf.space') || 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === ''
) ? '' : 'https://abdulrehmanfatehali1-tubeflow-downloader.hf.space';

// State Variables
let currentVideo = null;
let activeTab = 'video';
let activePlatform = 'youtube';
let activeDownloadInterval = null;

// Firebase Configuration & Initialization
const firebaseConfig = {
  apiKey: "AIzaSyA1d7MGsCymo-G1Bgxo2BLAovrQ3_dQHwo",
  authDomain: "best-d2cc5.firebaseapp.com",
  databaseURL: "https://best-d2cc5-default-rtdb.firebaseio.com",
  projectId: "best-d2cc5",
  storageBucket: "best-d2cc5.firebasestorage.app",
  messagingSenderId: "303128753531",
  appId: "1:303128753531:web:679e6f2f9265789188b9de"
};

let dbRef = null;
let currentUser = null;
let firebaseHistory = [];

if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    
    firebase.auth().onAuthStateChanged((user) => {
        currentUser = user;
        const authTriggerBtn = document.getElementById('auth-trigger-btn');
        const userProfileMenu = document.getElementById('user-profile-menu');
        const userAvatar = document.getElementById('user-avatar');
        const userName = document.getElementById('user-name');
        
        if (user) {
            if (authTriggerBtn) authTriggerBtn.classList.add('hidden');
            if (userProfileMenu) userProfileMenu.classList.remove('hidden');
            
            if (userName) userName.textContent = user.displayName || user.email.split('@')[0];
            if (userAvatar) {
                userAvatar.src = user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100';
            }
            
            dbRef = firebase.database().ref(`users/${user.uid}/history`);
            syncHistoryFromDb();
        } else {
            if (authTriggerBtn) authTriggerBtn.classList.remove('hidden');
            if (userProfileMenu) userProfileMenu.classList.add('hidden');
            
            dbRef = null;
            firebaseHistory = [];
            renderHistory();
        }
    });
}

function syncHistoryFromDb() {
    if (!dbRef) return;
    dbRef.once('value').then((snapshot) => {
        const dbData = snapshot.val();
        let list = [];
        if (dbData) {
            if (Array.isArray(dbData)) {
                list = dbData.filter(item => item !== null);
            } else if (typeof dbData === 'object') {
                list = Object.values(dbData);
            }
        }
        
        const localHistory = getLocalHistoryOnly();
        let combined = [...list];
        localHistory.forEach(localItem => {
            if (!combined.some(dbItem => dbItem.url === localItem.url)) {
                combined.unshift(localItem);
            }
        });
        
        if (combined.length > 6) {
            combined = combined.slice(0, 6);
        }
        
        firebaseHistory = combined;
        dbRef.set(firebaseHistory);
        localStorage.setItem('tubeflow_history', JSON.stringify(firebaseHistory));
        renderHistory();
    }).catch(err => {
        console.error("Database sync failed:", err);
    });
}

// Auth UI / Modal Handlers
function openAuthModal() {
    const modal = document.getElementById('auth-modal');
    const errEl = document.getElementById('auth-error-msg');
    if (errEl) errEl.classList.add('hidden');
    if (modal) modal.classList.remove('hidden');
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('hidden');
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginTab = document.getElementById('tab-login-btn');
    const registerTab = document.getElementById('tab-register-btn');
    const errEl = document.getElementById('auth-error-msg');
    
    if (errEl) errEl.classList.add('hidden');
    
    if (tab === 'login') {
        if (loginForm) loginForm.classList.remove('hidden');
        if (registerForm) registerForm.classList.add('hidden');
        if (loginTab) loginTab.classList.add('active');
        if (registerTab) registerTab.classList.remove('active');
    } else {
        if (loginForm) loginForm.classList.add('hidden');
        if (registerForm) registerForm.classList.remove('hidden');
        if (loginTab) loginTab.classList.remove('active');
        if (registerTab) registerTab.classList.add('active');
    }
}

function showAuthError(message) {
    const errEl = document.getElementById('auth-error-msg');
    if (errEl) {
        errEl.querySelector('span').textContent = message;
        errEl.classList.remove('hidden');
    }
}

async function handleEmailLogin() {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-login-submit');
    const origHtml = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Signing In...';
    
    try {
        await firebase.auth().signInWithEmailAndPassword(email, pass);
        closeAuthModal();
    } catch (err) {
        showAuthError(err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
    }
}

async function handleEmailRegister() {
    const email = document.getElementById('register-email').value.trim();
    const pass = document.getElementById('register-password').value;
    const btn = document.getElementById('btn-register-submit');
    const origHtml = btn.innerHTML;
    
    if (pass.length < 6) {
        showAuthError("Password must be at least 6 characters.");
        return;
    }
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Creating...';
    
    try {
        await firebase.auth().createUserWithEmailAndPassword(email, pass);
        closeAuthModal();
    } catch (err) {
        showAuthError(err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
    }
}

async function handleGoogleLogin() {
    const errEl = document.getElementById('auth-error-msg');
    if (errEl) errEl.classList.add('hidden');
    
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await firebase.auth().signInWithPopup(provider);
        closeAuthModal();
    } catch (err) {
        showAuthError(err.message);
    }
}

async function logoutUser() {
    try {
        await firebase.auth().signOut();
    } catch (err) {
        console.error("Sign out failed:", err);
    }
}


// Helper: get proxied thumbnail URL to bypass hotlink protection on Pinterest, Instagram, TikTok, Facebook, etc.
function getProxiedThumbnail(thumbnailUrl) {
    if (!thumbnailUrl) return '';
    if (thumbnailUrl.includes('corsproxy.io') || thumbnailUrl.startsWith('data:') || thumbnailUrl.startsWith('blob:')) {
        return thumbnailUrl;
    }
    if (thumbnailUrl.includes('youtube.com') || thumbnailUrl.includes('youtu.be') || thumbnailUrl.includes('ytimg.com')) {
        return thumbnailUrl;
    }
    // If Flask backend is available, use our own high-speed server image proxy!
    if (isServerSupported()) {
        return `${API_BASE_URL}/api/proxy-image?url=${encodeURIComponent(thumbnailUrl)}`;
    }
    return `https://corsproxy.io/?${encodeURIComponent(thumbnailUrl)}`;
}

// Helper: load thumbnail with sequential robust fallbacks so it never fails
function loadThumbnailWithFallbacks(imgEl, placeholderEl, video) {
    if (!imgEl) return;
    
    // Ensure we start with placeholder loading indicator
    if (placeholderEl) {
        placeholderEl.style.display = 'flex';
        placeholderEl.className = 'thumb-placeholder';
        placeholderEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    }
    imgEl.style.display = 'none';
    
    const fallbacks = [];
    
    // Add primary thumbnail source if available
    if (video.thumbnail && video.thumbnail.trim() !== '') {
        const thumb = video.thumbnail.trim();
        
        // 1. Backend proxy (if server is supported)
        if (isServerSupported()) {
            fallbacks.push(`${API_BASE_URL}/api/proxy-image?url=${encodeURIComponent(thumb)}`);
        }
        
        // 2. High-speed Image Cache Proxy (weserv.nl)
        const cleanThumbUrl = thumb.replace(/^https?:\/\//, '');
        fallbacks.push(`https://images.weserv.nl/?url=${encodeURIComponent(cleanThumbUrl)}`);
        
        // 3. Public CORS proxy 1 (corsproxy.io)
        fallbacks.push(`https://corsproxy.io/?${encodeURIComponent(thumb)}`);
        
        // 4. Public CORS proxy 2 (allorigins.win)
        fallbacks.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(thumb)}`);
        
        // 5. Direct URL
        fallbacks.push(thumb);
    }
    
    // Extract video ID for YouTube platform specific fallbacks
    let ytId = null;
    if (video.url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = video.url.match(regExp);
        if (match && match[2].length === 11) {
            ytId = match[2];
        }
    }
    
    if (ytId) {
        const ytImages = [
            `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`,
            `https://img.youtube.com/vi/${ytId}/sddefault.jpg`,
            `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
            `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`
        ];
        
        for (const ytImg of ytImages) {
            // Push both proxied and direct versions of youtube thumbnails
            if (isServerSupported()) {
                fallbacks.push(`${API_BASE_URL}/api/proxy-image?url=${encodeURIComponent(ytImg)}`);
            }
            fallbacks.push(`https://images.weserv.nl/?url=${encodeURIComponent(ytImg.replace(/^https?:\/\//, ''))}`);
            fallbacks.push(ytImg);
        }
    }
    
    // If we have absolutely no fallbacks, show the platform placeholder immediately
    if (fallbacks.length === 0) {
        showThumbnailPlaceholder();
        return;
    }
    
    let currentIndex = 0;
    
    // Clean up function to run on load/error completion
    function cleanup() {
        imgEl.onload = null;
        imgEl.onerror = null;
    }
    
    imgEl.onload = function() {
        cleanup();
        if (placeholderEl) placeholderEl.style.display = 'none';
        imgEl.style.display = 'block';
    };
    
    imgEl.onerror = function() {
        currentIndex++;
        if (currentIndex < fallbacks.length) {
            console.log(`Thumbnail load failed for index ${currentIndex - 1}, trying fallback: ${fallbacks[currentIndex]}`);
            imgEl.src = fallbacks[currentIndex];
        } else {
            cleanup();
            console.warn("All thumbnail fallbacks failed, showing platform placeholder.");
            showThumbnailPlaceholder();
        }
    };
    
    // Trigger initial load
    imgEl.src = fallbacks[currentIndex];
}

// Download the loaded thumbnail image
async function downloadThumbnail() {
    if (!currentVideo || !currentVideo.thumbnail) {
        showStatus('No thumbnail available to download.', 'error');
        return;
    }
    
    const title = currentVideo.title || 'video';
    const cleanTitle = title.replace(/[\\/*?\"<>|]/g, '_').substring(0, 100);
    const filename = `TubeFlow_Thumbnail_${cleanTitle}.jpg`;
    
    // Track loading state on the button
    const btn = document.getElementById('download-thumbnail-btn');
    if (!btn) return;
    
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Downloading...';
    
    // We try multiple ways to download:
    // Method 1: Flask backend proxy (if supported) with direct download=1 parameter
    if (isServerSupported()) {
        try {
            const dlUrl = `${API_BASE_URL}/api/proxy-image?url=${encodeURIComponent(currentVideo.thumbnail)}&download=1&filename=${encodeURIComponent(filename)}`;
            const link = document.createElement('a');
            link.href = dlUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            btn.disabled = false;
            btn.innerHTML = origHtml;
            return;
        } catch (e) {
            console.error('Backend download failed, trying client side...', e);
        }
    }
    
    // Method 2: Client-side fetch with fallback proxies, convert to Blob, and download
    const proxyChain = [
        `https://images.weserv.nl/?url=${encodeURIComponent(currentVideo.thumbnail.replace(/^https?:\/\//, ''))}`,
        `https://corsproxy.io/?${encodeURIComponent(currentVideo.thumbnail)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(currentVideo.thumbnail)}`,
        currentVideo.thumbnail // direct url as last resort
    ];
    
    let downloaded = false;
    for (const url of proxyChain) {
        try {
            const response = await fetch(url);
            if (!response.ok) continue;
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up blob URL
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
            downloaded = true;
            break;
        } catch (err) {
            console.warn(`Failed downloading thumbnail using proxy: ${url}`, err);
        }
    }
    
    if (!downloaded) {
        // Fallback method 3: Direct window open as absolute last resort
        try {
            window.open(currentVideo.thumbnail, '_blank');
            downloaded = true;
        } catch (err) {
            showStatus('Could not download thumbnail automatically. Right-click the image to save it.', 'error');
        }
    }
    
    btn.disabled = false;
    btn.innerHTML = origHtml;
}


// Helper: fetch Blob with progress tracking
async function fetchWithProgress(url, onProgress) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const contentLength = response.headers.get('content-length');
    if (!contentLength) {
        const blob = await response.blob();
        return blob;
    }
    
    const total = parseInt(contentLength, 10);
    let loaded = 0;
    
    const reader = response.body.getReader();
    const chunks = [];
    
    while(true) {
        const {done, value} = await reader.read();
        if (done) break;
        
        chunks.push(value);
        loaded += value.length;
        
        if (onProgress) {
            const percent = Math.round((loaded / total) * 100);
            onProgress(percent);
        }
    }
    
    return new Blob(chunks);
}

// Helper: display and configure the manual Save button in progress area
function showDownloadSaveButton(url, filename, isError = false) {
    const progressActions = document.getElementById('progress-actions');
    const saveBtn = document.getElementById('progress-download-btn');
    
    if (progressActions && saveBtn) {
        saveBtn.href = url;
        saveBtn.download = filename;
        
        const spanText = saveBtn.querySelector('span');
        const icon = saveBtn.querySelector('i');
        
        if (isError) {
            saveBtn.className = 'btn btn-secondary';
            if (spanText) spanText.textContent = 'Open Stream Link';
            if (icon) icon.className = 'fa-solid fa-up-right-from-square';
            saveBtn.target = '_blank';
            saveBtn.onclick = null;
        } else {
            saveBtn.className = 'btn btn-success btn-dynamic-accent';
            if (spanText) spanText.textContent = 'Save Video to Device';
            if (icon) icon.className = 'fa-solid fa-circle-arrow-down';
            saveBtn.removeAttribute('target');
            saveBtn.onclick = () => {
                setTimeout(() => {
                    const progressSection = document.getElementById('progress-section');
                    if (progressSection) progressSection.classList.add('hidden');
                    progressActions.classList.add('hidden');
                }, 4000);
            };
        }
        
        progressActions.classList.remove('hidden');
    }
}

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
    
    // Bind thumbnail load & error state listeners
    const videoThumbnail = document.getElementById('video-thumbnail');
    const thumbnailPlaceholder = document.getElementById('thumbnail-placeholder');
    if (videoThumbnail) {
        videoThumbnail.addEventListener('load', () => {
            if (thumbnailPlaceholder) thumbnailPlaceholder.style.display = 'none';
            videoThumbnail.style.display = 'block';
        });
        
        videoThumbnail.addEventListener('error', () => {
            showThumbnailPlaceholder();
        });
    }
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
    if (cfg) {
        bodyEl.className = cfg.themeClass;
        
        // Update Input UI dynamically
        urlInput.placeholder = cfg.placeholder;
        dynamicInputIcon.className = `${cfg.iconClass} input-icon`;
        activePlatformBadge.textContent = cfg.badgeText;
        downloaderCardTitle.textContent = cfg.cardTitle;
        downloaderCardDesc.textContent = cfg.cardDesc;
    }
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
    
    // Collect best audio URL from adaptiveFormats for merge encoding
    let bestAudioUrl = '';
    (data.adaptiveFormats || []).forEach(f => {
        const mime = f.type || '';
        if (mime.includes('audio/') && f.url) {
            // Prefer m4a/mp4 audio, take first match
            if (!bestAudioUrl || mime.includes('audio/mp4')) {
                bestAudioUrl = f.url;
            }
        }
    });

    // Process adaptiveFormats (Separate video-only and audio-only)
    (data.adaptiveFormats || []).forEach(f => {
        const mime = f.type || '';
        const ext = f.container || 'mp4';
        
        if (mime.includes('audio/')) {
            const quality = f.audioQuality || 'High Quality';
            const bitrate = Math.floor(parseInt(f.bitrate || 0) / 1000);
            const payload = `${f.url}|${title}|${ext}`;
            const encoded_id = btoa(unescape(encodeURIComponent(payload)));
            
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
            // Encode BOTH video URL and best audio URL → server can merge without yt-dlp!
            // Format: videoUrl||audioUrl|title|ext
            const payload = `${f.url}||${bestAudioUrl}|${title}|${ext}`;
            const encoded_id = btoa(unescape(encodeURIComponent(payload)));
            
            let size = parseInt(f.size) || 0;
            if (!size || size < 50000) {
                size = estimateSize(quality, duration);
            }
            
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
    
    // Collect best audio URL from audioStreams for merge encoding
    let bestAudioUrlPiped = '';
    (data.audioStreams || []).forEach(f => {
        const mime = f.mimeType || '';
        if (f.url) {
            if (!bestAudioUrlPiped || mime.includes('audio/mp4')) {
                bestAudioUrlPiped = f.url;
            }
        }
    });

    (data.videoStreams || []).forEach(f => {
        const mime = f.mimeType || '';
        const ext = mime.includes('video/mp4') ? 'mp4' : 'webm';
        const quality = f.quality || '360p';
        const isVideoOnly = f.videoOnly === true;
        
        let payload;
        if (isVideoOnly) {
            // Encode BOTH video + best audio URL → server merges without yt-dlp!
            payload = `${f.url}||${bestAudioUrlPiped}|${title}|${ext}`;
        } else {
            payload = `${f.url}|${title}|${ext}`;
        }
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
                        fetchClientSideMetadata(url)
                            .then(meta => {
                                if (resolved) return;
                                resolved = true;
                                resolve(buildCobaltResult(url, meta.title, meta.author, meta.thumbnail));
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
    // =========================================================
    if (!data) {
        showStatus('Activating Cobalt bypass extraction engine...', 'loading');
        try {
            const meta = await fetchClientSideMetadata(url);
            data = buildCobaltResult(url, meta.title, meta.author, meta.thumbnail);
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
            const response = await fetch(`${API_BASE_URL}/api/info?url=${encodeURIComponent(url)}`);
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
// Fetch metadata using client-side oEmbed APIs and fallbacks
async function fetchClientSideMetadata(url) {
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    const isTikTok = url.includes('tiktok.com');
    const isPinterest = url.includes('pinterest.com') || url.includes('pin.it');

    let title = 'Extracted Video';
    let author = 'TubeFlow Bypass Engine';
    let thumbnail = '';

    // Helper to expand short URL using corsproxy
    async function expandPinterestUrl(shortUrl) {
        try {
            const corsUrl = `https://corsproxy.io/?${encodeURIComponent(shortUrl)}`;
            const res = await fetch(corsUrl, { method: 'HEAD' });
            if (res.ok && res.url) {
                const idx = res.url.indexOf('?');
                if (idx !== -1) {
                    return decodeURIComponent(res.url.substring(idx + 1));
                }
                return res.url;
            }
        } catch (e) {
            console.warn("Pinterest URL expansion failed:", e);
        }
        return shortUrl;
    }

    // Helper to clean Pinterest URL (removing /sent/ and parameters)
    function cleanPinterestUrl(rawUrl) {
        try {
            const urlObj = new URL(rawUrl);
            if (urlObj.hostname.includes('pinterest.com')) {
                let path = urlObj.pathname;
                // Replace /sent/ or similar trailings
                path = path.replace(/\/sent\/?$/, '/');
                urlObj.pathname = path;
                urlObj.search = '';
                return urlObj.toString();
            }
        } catch (_) {}
        return rawUrl;
    }

    try {
        let oEmbedUrl = '';
        if (isYouTube) {
            oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
        } else if (isTikTok) {
            oEmbedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
        } else if (isPinterest) {
            let targetUrl = url;
            if (url.includes('pin.it') || url.includes('/sent/')) {
                const expanded = await expandPinterestUrl(url);
                targetUrl = cleanPinterestUrl(expanded);
                
                // If redirect expansion failed to retrieve the pin ID, fallback to querying Cobalt to extract the ID from the filename!
                if (!targetUrl.includes('/pin/')) {
                    try {
                        const cobaltRes = await getCobaltMergedLink(url, '720p', false);
                        if (cobaltRes && cobaltRes.filename) {
                            const match = cobaltRes.filename.match(/pinterest_(\d+)/);
                            if (match && match[1]) {
                                targetUrl = `https://www.pinterest.com/pin/${match[1]}/`;
                            }
                        }
                    } catch (e) {
                        console.warn("Cobalt fallback ID extraction failed:", e);
                    }
                }
            }
            oEmbedUrl = `https://corsproxy.io/?https://www.pinterest.com/oembed.json?url=${encodeURIComponent(targetUrl)}`;
        }

        if (oEmbedUrl) {
            let fetchUrl = oEmbedUrl;
            if (isServerSupported()) {
                let rawOEmbedUrl = oEmbedUrl;
                if (oEmbedUrl.includes('corsproxy.io/?')) {
                    rawOEmbedUrl = decodeURIComponent(oEmbedUrl.split('corsproxy.io/?')[1]);
                }
                fetchUrl = `${API_BASE_URL}/api/proxy-oembed?url=${encodeURIComponent(rawOEmbedUrl)}`;
            }
            const res = await fetch(fetchUrl);
            if (res.ok) {
                const json = await res.json();
                title = json.title || title;
                author = json.author_name || json.provider_name || author;
                thumbnail = json.thumbnail_url || json.url || thumbnail;
            }
        }
    } catch (e) {
        console.warn("Client-side oEmbed metadata fetch failed:", e);
    }

    if (title === 'Extracted Video') {
        try {
            const urlObj = new URL(url);
            const pathSegments = urlObj.pathname.split('/');
            let lastSegment = pathSegments.pop() || pathSegments.pop();
            if (lastSegment && lastSegment.length > 3) {
                if (lastSegment.match(/^\d+$/)) {
                    const prevSegment = pathSegments.pop();
                    if (prevSegment && prevSegment.length > 3 && !prevSegment.startsWith('@')) {
                        title = decodeURIComponent(prevSegment).replace(/[-_]/g, ' ');
                    } else {
                        title = `${activePlatform.toUpperCase()} Media ${lastSegment}`;
                    }
                } else {
                    title = decodeURIComponent(lastSegment).replace(/[-_]/g, ' ');
                }
            }
        } catch (_) {}
    }

    return { title, author, thumbnail };
}

// Helper: Build a standard result object from a Cobalt bypass URL
function buildCobaltResult(url, title, author, thumbnail) {
    return {
        title: title,
        author: author || "TubeFlow Bypass Engine",
        thumbnail: thumbnail || '',
        duration: 0,
        duration_formatted: "Direct Stream",
        views: 0,
        views_formatted: "—",
        description: "Extracted and bypassed successfully via Cobalt unblocked server pool.",
        video_formats: [
            {
                format_id: btoa(`cobalt|1080p`),
                ext: 'mp4',
                resolution: '1080p',
                quality_label: '1080p',
                filesize: 0,
                type: 'combined',
                note: '🔥 Full HD 1080p (Cobalt Bypass)'
            },
            {
                format_id: btoa(`cobalt|720p`),
                ext: 'mp4',
                resolution: '720p',
                quality_label: '720p',
                filesize: 0,
                type: 'combined',
                note: '⚡ HD 720p (Cobalt Bypass)'
            },
            {
                format_id: btoa(`cobalt|480p`),
                ext: 'mp4',
                resolution: '480p',
                quality_label: '480p',
                filesize: 0,
                type: 'combined',
                note: '📱 SD 480p (Cobalt Bypass)'
            },
            {
                format_id: btoa(`cobalt|360p`),
                ext: 'mp4',
                resolution: '360p',
                quality_label: '360p',
                filesize: 0,
                type: 'combined',
                note: '📉 Low SD 360p (Cobalt Bypass)'
            }
        ],
        audio_formats: [
            {
                format_id: btoa(`cobalt|audio`),
                ext: 'mp3',
                quality_label: 'Audio',
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
function showThumbnailPlaceholder() {
    const videoThumbnail = document.getElementById('video-thumbnail');
    const thumbnailPlaceholder = document.getElementById('thumbnail-placeholder');
    if (thumbnailPlaceholder) {
        thumbnailPlaceholder.style.display = 'flex';
        let iconClass = 'fa-solid fa-play';
        if (activePlatform === 'youtube') iconClass = 'fa-brands fa-youtube';
        else if (activePlatform === 'instagram') iconClass = 'fa-brands fa-instagram';
        else if (activePlatform === 'tiktok') iconClass = 'fa-brands fa-tiktok';
        else if (activePlatform === 'facebook') iconClass = 'fa-brands fa-facebook';
        else if (activePlatform === 'universal') iconClass = 'fa-solid fa-globe';
        
        thumbnailPlaceholder.className = `thumb-placeholder placeholder-${activePlatform}`;
        thumbnailPlaceholder.innerHTML = `<i class="${iconClass} placeholder-logo"></i>`;
    }
    if (videoThumbnail) videoThumbnail.style.display = 'none';
}

function displayResults(video) {
    // Reset thumbnail loading/placeholder state
    const videoThumbnail = document.getElementById('video-thumbnail');
    const thumbnailPlaceholder = document.getElementById('thumbnail-placeholder');
    if (thumbnailPlaceholder) {
        thumbnailPlaceholder.style.display = 'flex';
        thumbnailPlaceholder.className = 'thumb-placeholder';
        thumbnailPlaceholder.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    }
    if (videoThumbnail) videoThumbnail.style.display = 'none';

    // Setup and load thumbnail with fallback sources
    loadThumbnailWithFallbacks(videoThumbnail, thumbnailPlaceholder, video);
    
    // Hide/show Download Thumbnail button depending on if thumbnail exists
    const dlThumbBtn = document.getElementById('download-thumbnail-btn');
    if (dlThumbBtn) {
        if (video.thumbnail && video.thumbnail.trim() !== '') {
            dlThumbBtn.classList.remove('hidden');
        } else {
            dlThumbBtn.classList.add('hidden');
        }
    }
    
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
    if (!bytes || bytes === 0) return 'Streaming';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Estimate file size for Cobalt bypass formats (no real size known)
function estimateCobaltSize(qualityLabel, isAudio) {
    if (isAudio) return '~4-8 MB';
    const q = (qualityLabel || '').toLowerCase();
    if (q.includes('2160') || q.includes('4k')) return '~800 MB-2 GB';
    if (q.includes('1440') || q.includes('2k')) return '~400-800 MB';
    if (q.includes('1080')) return '~100-400 MB';
    if (q.includes('720')) return '~50-150 MB';
    if (q.includes('480')) return '~20-80 MB';
    if (q.includes('360')) return '~10-50 MB';
    return 'Streaming';
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
        'https://apicobalt.mgytr.top',
        'https://cobaltapi.kittycat.boo',
        'https://dog.kittycat.boo',
        'https://fox.kittycat.boo',
        'https://api.cobalt.liubquanti.click',
        'https://api.cobalt.blackcat.sweeux.org',
        'https://cobaltapi.cjs.nz'
    ];
    
    let q = '1080';
    const qLower = (qualityLabel || '').toLowerCase();
    if (qLower.includes('2160') || qLower.includes('4k')) q = 'max';
    else if (qLower.includes('1440') || qLower.includes('2k')) q = '1440';
    else if (qLower.includes('1080')) q = '1080';
    else if (qLower.includes('720')) q = '720';
    else if (qLower.includes('480')) q = '480';
    else if (qLower.includes('360')) q = '360';
    
    const payload = {
        url: videoUrl,
        videoQuality: q,
        downloadMode: isAudio ? 'audio' : 'auto',
        audioFormat: isAudio ? 'mp3' : 'best',
        audioBitrate: '128',
        filenameStyle: 'basic'
    };
    
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    
    return new Promise((resolve, reject) => {
        let completed = 0;
        let resolved = false;
        const controllers = [];
        
        const targets = [];
        instances.forEach(inst => {
            targets.push({ url: `${inst.replace(/\/$/, '')}/`, payload });
            targets.push({ url: `${inst.replace(/\/$/, '')}/api/json`, payload });
        });
        
        targets.forEach(target => {
            const controller = new AbortController();
            controllers.push(controller);
            
            fetch(target.url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(target.payload),
                signal: controller.signal
            })
            .then(async response => {
                if (resolved) return;
                if (response.ok) {
                    const json = await response.json();
                    if (json && (json.url || json.tunnel || json.status === 'picker' || json.status === 'redirect')) {
                        resolved = true;
                        controllers.forEach(c => c.abort());
                        
                        let dlUrl = json.url || json.tunnel;
                        if (json.status === 'picker' && json.picker && json.picker.length > 0) {
                            dlUrl = json.picker[0].url || json.picker[0].tunnel;
                        }
                        
                        if (dlUrl) {
                            resolve({
                                url: dlUrl,
                                filename: json.filename || 'download'
                            });
                        }
                    }
                }
            })
            .catch(() => {})
            .finally(() => {
                completed++;
                if (completed >= targets.length && !resolved) {
                    reject(new Error("All bypass servers failed."));
                }
            });
        });
        
        // 6 second connection timeout
        setTimeout(() => {
            if (!resolved) {
                controllers.forEach(c => c.abort());
                reject(new Error("Bypass servers connection timeout."));
            }
        }, 6000);
    });
}

// Helper: Checks if there is a running backend server (localhost or HuggingFace Spaces)
function isServerSupported() {
    const hn = window.location.hostname;
    return hn === 'localhost' || hn === '127.0.0.1' || hn.startsWith('192.168.') || hn.includes('huggingface.co') || hn.includes('hf.space') || hn.includes('space.google') || API_BASE_URL !== '';
}

// Trigger Asynchronous progress-monitored download (100% Client-Side Cobalt bypass first, Server-Side fallback)
async function triggerDownload(formatId, ext, qualityLabel, formatType) {
    if (!currentVideo) return;
    
    const url = currentVideo.url;
    const title = currentVideo.title;
    const downloadFilename = `${title.replace(/[\\/*?"<>|]/g, '')}_${qualityLabel}.${ext}`;
    const isAudio = formatType === 'audio' || qualityLabel === 'Audio' || ext === 'mp3' || ext === 'm4a';
    let directStreamUrl = null;

    // Reset manual download button container
    const progressActions = document.getElementById('progress-actions');
    if (progressActions) progressActions.classList.add('hidden');

    // Helper: trigger direct browser download (must throw error if fetch/CORS blocks so we can fall back to server)
    async function triggerBrowserDownload(downloadUrl, filename) {
        if (downloadUrl.startsWith('blob:') || downloadUrl.startsWith('data:')) {
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
        }

        // Fetch with progress reporting!
        const blob = await fetchWithProgress(downloadUrl, (percent) => {
            const mappedPct = 20 + Math.round(percent * 0.7);
            const progressFill = document.getElementById('progress-bar-fill');
            const progressPercent = document.getElementById('progress-percent');
            const progressStatus = document.getElementById('progress-status');
            
            if (progressFill) progressFill.style.width = `${mappedPct}%`;
            if (progressPercent) progressPercent.textContent = `${percent}%`;
            if (progressStatus) progressStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin font-accent"></i> Streaming file to browser memory...`;
        });
        
        const blobUrl = URL.createObjectURL(blob);
        
        // Show manual Save button in the actions area
        showDownloadSaveButton(blobUrl, filename);

        // Also try auto-clicking it
        try {
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.warn("Auto-download trigger failed, user can click manual button:", e);
        }
        
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    }

    // Decode the format ID to check if it's already a direct download URL
    let sourceUrl = null;
    try {
        const decoded = atob(formatId);
        if (decoded.includes('|')) sourceUrl = decoded.split('|')[0];
    } catch (_) {}

    // Check if the source URL is already a direct stream URL (non-Google, e.g. Invidious proxy or direct CDN link)
    const isAlreadyStreamUrl = sourceUrl && (
        !sourceUrl.includes('googlevideo.com') &&
        !sourceUrl.includes('youtube.com') &&
        !sourceUrl.includes('ytimg.com') &&
        sourceUrl.startsWith('http')
    );

    if (isAlreadyStreamUrl) {
        showStatus('Starting instant direct download...', 'success');
        try {
            await triggerBrowserDownload(sourceUrl, downloadFilename);
        } catch (err) {
            console.warn("Direct stream download failed, opening link in new window...", err);
            window.open(sourceUrl, '_blank');
        }
        return;
    }

    // Show progress UI section
    const progressFill = document.getElementById('progress-bar-fill');
    const progressPercent = document.getElementById('progress-percent');
    const progressStatus = document.getElementById('progress-status');
    const progressFilename = document.getElementById('progress-filename');

    showStatus('Processing download... Please wait.', 'loading');
    progressSection.classList.remove('hidden');
    progressSection.scrollIntoView({ behavior: 'smooth', block: 'end' });
    progressFilename.textContent = downloadFilename;
    progressFill.style.width = '20%';
    progressFill.classList.add('pulsing-fill');
    progressPercent.textContent = 'Connecting';
    toggleDownloadButtons(false);

    progressStatus.innerHTML = `<i class="fa-solid fa-bolt fa-spin font-accent"></i> Bypassing blockages via client-side download node...`;

    try {
        // Attempt high-speed client-side Cobalt resolution directly in the browser!
        // This runs on the client's residential IP → 100% immune to server IP blocks!
        const res = await getCobaltMergedLink(url, qualityLabel, isAudio);
        if (res && res.url) {
            directStreamUrl = res.url;
            progressStatus.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin font-accent"></i> Directing download stream...`;
            progressFill.style.width = '60%';
            progressPercent.textContent = '60%';
            
            // Direct anchor click - bypasses CORS restriction entirely using proxy-bypass-stream
            try {
                const finalDlUrl = isServerSupported() 
                    ? `${API_BASE_URL}/api/proxy-bypass-stream?url=${encodeURIComponent(res.url)}&filename=${encodeURIComponent(downloadFilename)}`
                    : res.url;
                    
                const link = document.createElement('a');
                link.href = finalDlUrl;
                link.download = downloadFilename;
                link.target = '_blank';
                link.rel = 'noopener';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                progressFill.style.width = '100%';
                progressFill.classList.remove('pulsing-fill');
                progressPercent.textContent = '100%';
                progressStatus.innerHTML = `<span style="color: var(--success)"><i class="fa-solid fa-circle-check"></i> Bypass successful! Download started.</span>`;
                showStatus('Download started successfully!', 'success');
                
                // Also show manual save button in case browser blocks auto-download
                showDownloadSaveButton(finalDlUrl, downloadFilename, true);
                toggleDownloadButtons(true);
                return;
            } catch (dlErr) {
                console.warn('Direct anchor click failed:', dlErr);
            }
        }
    } catch (err) {
        console.warn("Client-side Cobalt bypass failed. Falling back to server-side pipeline...", err);
    }

    // Fallback: If client-side bypass fails, route to server-side pipeline
    progressStatus.innerHTML = `<i class="fa-solid fa-server fa-spin font-accent"></i> Client bypass failed. Routing to server-side pipeline...`;
    startServerSideDownload(formatId, ext, qualityLabel, formatType, downloadFilename, directStreamUrl);
}

// Secure Server-Side download & merge manager with realtime progress polling
function startServerSideDownload(formatId, ext, qualityLabel, formatTypeOrIsMerge, downloadFilename, directStreamUrl = null) {
    const url = currentVideo.url;
    const progressFill = document.getElementById('progress-bar-fill');
    const progressPercent = document.getElementById('progress-percent');
    const progressStatus = document.getElementById('progress-status');
    const progressFilename = document.getElementById('progress-filename');
    
    // Clear any active polling interval to prevent multiple polling requests
    if (activeDownloadInterval) {
        clearInterval(activeDownloadInterval);
        activeDownloadInterval = null;
    }
    
    // Reset manual download button container
    const progressActions = document.getElementById('progress-actions');
    if (progressActions) progressActions.classList.add('hidden');

    // Display and initialize the progress UI section
    showStatus('Processing download... Please wait.', 'loading');
    progressSection.classList.remove('hidden');
    progressSection.scrollIntoView({ behavior: 'smooth', block: 'end' });
    progressFilename.textContent = downloadFilename;
    progressFill.style.width = '5%';
    progressFill.classList.add('pulsing-fill');
    progressPercent.textContent = 'Connecting';
    toggleDownloadButtons(false);
    
    progressStatus.innerHTML = `<i class="fa-solid fa-server fa-spin font-accent"></i> Initializing secure server bypass connection...`;
    
    // Normalize formatType ('merge', 'combined', 'audio')
    let formatType = 'combined';
    if (formatTypeOrIsMerge === 'merge' || formatTypeOrIsMerge === true) {
        formatType = 'merge';
    } else if (formatTypeOrIsMerge === 'audio') {
        formatType = 'audio';
    } else if (formatTypeOrIsMerge === 'combined') {
        formatType = 'combined';
    }
    
    const startUrl = `${API_BASE_URL}/api/download/start?url=${encodeURIComponent(url)}&format_id=${encodeURIComponent(formatId)}&quality_label=${encodeURIComponent(qualityLabel)}&format_type=${encodeURIComponent(formatType)}`;
    
    fetch(startUrl)
        .then(res => {
            if (!res.ok) throw new Error("Server bypass connection could not be established");
            return res.json();
        })
        .then(data => {
            if (data.error) throw new Error(data.error);
            const taskId = data.task_id;
            
            let pollCount = 0;
    const MAX_POLLS = 120; // 2 minutes max
    
    activeDownloadInterval = setInterval(() => {
        pollCount++;
        if (pollCount >= MAX_POLLS) {
            clearInterval(activeDownloadInterval);
            activeDownloadInterval = null;
            handleDownloadFailure('Download timed out after 2 minutes. Please try again.');
            return;
        }
                fetch(`${API_BASE_URL}/api/download/progress?task_id=${taskId}`)
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
                            progressFill.classList.remove('pulsing-fill');
                            progressPercent.textContent = '100%';
                            progressStatus.innerHTML = `<span style="color: var(--success)"><i class="fa-solid fa-circle-check"></i> Processing complete! Delivering file...</span>`;
                            
                            const downloadUrl = `${API_BASE_URL}/api/download/get?task_id=${taskId}`;
                            
                            // Show save button in the UI
                            showDownloadSaveButton(downloadUrl, downloadFilename);
                            
                            // Trigger auto-download using standard anchor tag click (avoid window.location.href to support sandboxed iframes)
                            const link = document.createElement('a');
                            link.href = downloadUrl;
                            link.download = downloadFilename;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            
                            showStatus('Download completed successfully!', 'success');
                            toggleDownloadButtons(true);
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
        
        let fallbackMsg = '';
        if (directStreamUrl) {
            fallbackMsg = `<br><a href="${directStreamUrl}" target="_blank" style="color: var(--primary-color); text-decoration: underline; font-weight: bold;"><i class="fa-solid fa-up-right-from-square"></i> Open direct stream link in new tab</a>`;
            // Show manual download button as fallback too
            showDownloadSaveButton(directStreamUrl, downloadFilename, true);
        }
        
        progressStatus.innerHTML = `<span style="color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Bypass Failed: ${errorMsg}${fallbackMsg}</span>`;
        toggleDownloadButtons(true);
    }
}

// LocalStorage Search History Manager
function getLocalHistoryOnly() {
    const history = localStorage.getItem('tubeflow_history');
    return history ? JSON.parse(history) : [];
}

function getHistory() {
    if (currentUser) {
        return firebaseHistory;
    }
    return getLocalHistoryOnly();
}

function saveToHistory(video) {
    let history = getHistory();
    history = history.filter(item => item.url !== video.url);
    history.unshift({
        url: video.url,
        title: video.title,
        author: video.author,
        thumbnail: video.thumbnail,
        views_formatted: video.views_formatted,
        duration_formatted: video.duration_formatted,
        timestamp: Date.now()
    });
    
    if (history.length > 6) {
        history.pop();
    }
    
    if (currentUser && dbRef) {
        firebaseHistory = history;
        dbRef.set(firebaseHistory);
    }
    
    localStorage.setItem('tubeflow_history', JSON.stringify(history));
    renderHistory();
}

function deleteHistoryItem(url, event) {
    if (event) event.stopPropagation();
    let history = getHistory();
    history = history.filter(item => item.url !== url);
    
    if (currentUser && dbRef) {
        firebaseHistory = history;
        dbRef.set(firebaseHistory);
    }
    
    localStorage.setItem('tubeflow_history', JSON.stringify(history));
    renderHistory();
}

function clearHistory() {
    if (currentUser && dbRef) {
        firebaseHistory = [];
        dbRef.set(firebaseHistory);
    }
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
                <img class="history-thumb" src="${video.thumbnail ? getProxiedThumbnail(video.thumbnail) : 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=120'}" alt="Thumb">
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

// PWA Installation & Service Worker registration
let deferredPrompt;
const installBtn = document.getElementById('install-app-btn');

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('TubeFlow SW: Registered successfully with scope:', reg.scope))
            .catch(err => console.error('TubeFlow SW: Registration failed:', err));
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) {
        installBtn.classList.remove('hidden');
    }
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`TubeFlow PWA: User choice outcome: ${outcome}`);
        deferredPrompt = null;
        installBtn.classList.add('hidden');
    });
}

window.addEventListener('appinstalled', (evt) => {
    console.log('TubeFlow PWA: Application installed successfully');
    if (installBtn) {
        installBtn.classList.add('hidden');
    }
});

// Virtual SMS Receiver State Variables
let smsCountries = [];
let activeSMSCountry = null;
let activeSMSCountryFlag = '🌐';
let activeSMSNumber = null;
let smsRefreshInterval = null;

// Load all countries from backend
async function loadSMSCountries() {
    const container = document.getElementById('sms-countries-container');
    if (!container) return;
    
    // If already loaded, just render
    if (smsCountries.length > 0) {
        renderSMSCountries();
        return;
    }
    
    container.innerHTML = '<div class="sms-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Fetching countries...</div>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/sms/countries`);
        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}`);
        }
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error('Server returned invalid content format');
        }
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error || 'Failed to load countries');
        }
        smsCountries = data;
        renderSMSCountries();
    } catch (err) {
        container.innerHTML = `<div class="sms-loading" style="color: #fca5a5;"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${err.message}</div>`;
    }
}

// Render the country list in left pane
function renderSMSCountries(filterText = '') {
    const container = document.getElementById('sms-countries-container');
    if (!container) return;
    
    const query = filterText.toLowerCase().trim();
    const filtered = smsCountries.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.code.toLowerCase().includes(query)
    );
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="sms-loading">No countries found.</div>';
        return;
    }
    
    container.innerHTML = filtered.map(c => `
        <div class="sms-country-item" onclick="selectSMSCountry('${c.code}', '${c.name.replace(/'/g, "\\'")}', '${c.flag}')">
            <div class="sms-c-info">
                <span class="sms-c-flag">${c.flag || '🌐'}</span>
                <span class="sms-c-name">${c.name}</span>
            </div>
            <span class="sms-c-count">${c.count || 'Active'}</span>
        </div>
    `).join('');
}

// Search and filter countries
function filterCountries() {
    const searchVal = document.getElementById('sms-country-search').value;
    renderSMSCountries(searchVal);
}

// Select country -> Switch view to numbers list
async function selectSMSCountry(code, name, flag) {
    activeSMSCountry = code;
    activeSMSCountryFlag = flag || '🌐';
    
    document.getElementById('active-country-flag').textContent = flag || '🌐';
    document.getElementById('active-country-name').textContent = name;
    
    const box = document.getElementById('sms-numbers-box');
    const container = document.getElementById('sms-numbers-container');
    const countriesList = document.getElementById('sms-countries-container');
    const searchBox = document.querySelector('.sms-selector-pane .sms-search-box');
    const titleEl = document.querySelector('.sms-selector-pane .sms-pane-title');
    
    if (countriesList) countriesList.classList.add('hidden');
    if (searchBox) searchBox.classList.add('hidden');
    if (titleEl) titleEl.classList.add('hidden');
    if (box) box.classList.remove('hidden');
    
    container.innerHTML = '<div class="sms-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading numbers...</div>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/sms/numbers?country=${code}`);
        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}`);
        }
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error('Server returned invalid content format');
        }
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error || 'Failed to load numbers');
        }
        
        if (data.length === 0) {
            container.innerHTML = '<div class="sms-loading">No active numbers.</div>';
            return;
        }
        
        container.innerHTML = data.map(n => `
            <div class="sms-number-item ${activeSMSNumber === n.number ? 'active' : ''}" id="sms-num-${n.number}" onclick="selectSMSNumber('${n.number}', '${n.display_number}')">
                <span class="sms-n-flag">${activeSMSCountryFlag}</span>
                <span class="sms-n-num">${n.display_number}</span>
                <span class="sms-n-count">${n.sms_count || '0 messages'}</span>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = `<div class="sms-loading" style="color: #fca5a5;"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${err.message}</div>`;
    }
}

// Go back from numbers list to country list
function showCountryList() {
    const box = document.getElementById('sms-numbers-box');
    const countriesList = document.getElementById('sms-countries-container');
    const searchBox = document.querySelector('.sms-selector-pane .sms-search-box');
    const titleEl = document.querySelector('.sms-selector-pane .sms-pane-title');
    
    if (box) box.classList.add('hidden');
    if (countriesList) countriesList.classList.remove('hidden');
    if (searchBox) searchBox.classList.remove('hidden');
    if (titleEl) titleEl.classList.remove('hidden');
}

// Select phone number -> Load message inbox
function selectSMSNumber(number, displayNum) {
    // Clear old active highlight
    if (activeSMSNumber) {
        const oldEl = document.getElementById(`sms-num-${activeSMSNumber}`);
        if (oldEl) oldEl.classList.remove('active');
    }
    
    activeSMSNumber = number;
    const newEl = document.getElementById(`sms-num-${number}`);
    if (newEl) newEl.classList.add('active');
    
    // Switch inbox viewports
    document.getElementById('sms-inbox-placeholder').classList.add('hidden');
    document.getElementById('sms-inbox-content').classList.remove('hidden');
    
    document.getElementById('active-sms-number').textContent = displayNum;
    
    // Fetch inbox messages
    fetchSMSMessages(number);
    
    // Auto-refresh inbox every 10 seconds while this number is active and visible
    if (smsRefreshInterval) clearInterval(smsRefreshInterval);
    smsRefreshInterval = setInterval(() => {
        if (activePlatform === 'sms' && activeSMSNumber === number) {
            fetchSMSMessages(number, true); // silent refresh
        }
    }, 10000);
}

// Load verification messages from backend
async function fetchSMSMessages(number, silent = false) {
    const container = document.getElementById('sms-messages-container');
    const refreshBtn = document.getElementById('sms-refresh-btn');
    
    if (!silent) {
        container.innerHTML = '<div class="sms-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Syncing messages...</div>';
    }
    
    if (refreshBtn) {
        refreshBtn.disabled = true;
        const icon = refreshBtn.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-rotate fa-spin';
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/sms/inbox?number=${number}`);
        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}`);
        }
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error('Server returned invalid content format');
        }
        const data = await response.json();
        if (data.error) {
            throw new Error(data.error || 'Failed to load inbox');
        }
        
        if (data.length === 0) {
            container.innerHTML = '<div class="sms-loading">Inbox is empty. Waiting for SMS...</div>';
        } else {
            container.innerHTML = data.map(m => `
                <div class="sms-bubble">
                    <div class="sms-msg-meta">
                        <span class="sms-msg-sender">From: ${escapeHtml(m.sender)}</span>
                        <span class="sms-msg-time">${escapeHtml(m.time)}</span>
                    </div>
                    <div class="sms-msg-body">${escapeHtml(m.text)}</div>
                </div>
            `).join('');
        }
    } catch (err) {
        if (!silent) {
            container.innerHTML = `<div class="sms-loading" style="color: #fca5a5;"><i class="fa-solid fa-triangle-exclamation"></i> Sync Error: ${err.message}</div>`;
        }
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            const icon = refreshBtn.querySelector('i');
            if (icon) icon.className = 'fa-solid fa-rotate';
        }
    }
}

// Manual Refresh Trigger
function refreshInbox() {
    if (activeSMSNumber) {
        fetchSMSMessages(activeSMSNumber);
    }
}

// Copy active phone number helper
function copyActiveNumber() {
    if (!activeSMSNumber) return;
    
    // Strip everything except plus and digits for copying
    const numText = document.getElementById('active-sms-number').textContent;
    navigator.clipboard.writeText(numText.replace(/\s+/g, '')).then(() => {
        showToastNotification('Phone number copied successfully!');
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// Simple floating notification toast
function showToastNotification(message) {
    let toast = document.getElementById('sms-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sms-toast';
        toast.style.position = 'fixed';
        toast.style.bottom = '2rem';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.background = 'linear-gradient(135deg, #ff6b00, #a855f7)';
        toast.style.color = '#fff';
        toast.style.padding = '0.75rem 1.5rem';
        toast.style.borderRadius = '30px';
        toast.style.fontWeight = 'bold';
        toast.style.fontSize = '0.9rem';
        toast.style.boxShadow = '0 10px 25px rgba(255, 107, 0, 0.4)';
        toast.style.zIndex = '9999';
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.style.opacity = '1';
    
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 2500);
}

// HTML Escaper utility
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

/* ==========================================================================
   10. VERTICAL NAVIGATION SIDEBAR CONSOLE
   ========================================================================== */
let currentMainPanel = 'downloader';

function switchMainPanel(panelId, btnElement) {
    currentMainPanel = panelId;
    
    // Hide all main panels
    const panels = document.querySelectorAll('.main-panel');
    panels.forEach(p => p.classList.remove('active'));
    
    // Show target panel
    const activePanel = document.getElementById(`panel-${panelId}`);
    if (activePanel) {
        activePanel.classList.add('active');
    }
    
    // Reset and assign navigation tab highlights
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => tab.classList.remove('active'));
    
    if (btnElement) {
        btnElement.classList.add('active');
    } else {
        const matchingBtn = document.getElementById(`nav-btn-${panelId}`);
        if (matchingBtn) matchingBtn.classList.add('active');
    }
    
    // Switch background moving glows themes dynamically
    if (panelId === 'downloader') {
        const config = platformConfigs[activePlatform];
        if (config) {
            document.body.className = config.themeClass;
        }
    } else if (panelId === 'sms') {
        document.body.className = 'theme-sms';
        loadSMSCountries(); // load countries list if standby
    } else if (panelId === 'mail') {
        document.body.className = 'theme-mail';
        initTempMail(); // load / sync disposable accounts
    }
    
    // Close sidebar slide drawer on narrow mobile views
    const sidebar = document.querySelector('.app-sidebar');
    if (sidebar) {
        sidebar.classList.remove('open');
    }
}

function toggleMobileSidebar() {
    const sidebar = document.querySelector('.app-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

/* ==========================================================================
   11. TEMP MAIL MODULE (DISPOSABLE EMAIL CONTROLLER)
   ========================================================================== */
let mailAccounts = [];
let activeMailAddress = '';
let activeMailMessages = [];
let mailRefreshInterval = null;
let currentMailMessage = null;
let mailDomains = []; // Cached available domains from Mail.tm

// Initialize Temp Mail pane
async function initTempMail() {
    await loadMailDomains();
    loadMailAccounts();
    if (mailAccounts.length === 0) {
        spawnNewEmailAddress();
    } else {
        setActiveEmailAccount(activeMailAddress);
    }
}

// Fetch available domains from Maildrop & 1secmail (maildrop first as 1secmail has 403 issues)
async function loadMailDomains() {
    mailDomains = ['maildrop.cc', '1secmail.com', '1secmail.org', '1secmail.net'];
    const select = document.getElementById('mail-domain-select');
    if (select) {
        select.innerHTML = mailDomains.map(d => `<option value="${d}">${d}</option>`).join('');
    }
}

// LocalStorage caching
function saveMailAccounts() {
    localStorage.setItem('tubeflow_mail_accounts', JSON.stringify(mailAccounts));
    localStorage.setItem('tubeflow_active_mail', activeMailAddress);
}

function loadMailAccounts() {
    try {
        const stored = localStorage.getItem('tubeflow_mail_accounts');
        const active = localStorage.getItem('tubeflow_active_mail');
        if (stored) {
            mailAccounts = JSON.parse(stored);
        }
        
        // Filter out legacy Mail.tm accounts (containing @wshu.net or having password/token/id fields)
        mailAccounts = mailAccounts.filter(acc => acc.email && !acc.email.includes('wshu.net') && !acc.token);
        
        if (active && mailAccounts.some(acc => acc.email === active)) {
            activeMailAddress = active;
        } else if (mailAccounts.length > 0) {
            activeMailAddress = mailAccounts[0].email;
        }
    } catch (e) {
        console.error('Error loading mail from localStorage:', e);
    }
}

// Random prefix generator helper
function randomizeEmailPrefix() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let prefix = 'mail_';
    for (let i = 0; i < 7; i++) {
        prefix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const input = document.getElementById('mail-custom-prefix');
    if (input) input.value = prefix;
}

// Spawn / register a new 1secmail account node (stateless, instant generation)
async function spawnNewEmailAddress() {
    const prefixInput = document.getElementById('mail-custom-prefix');
    const domainSelect = document.getElementById('mail-domain-select');
    
    let login = '';
    const selectedDomain = domainSelect ? domainSelect.value : (mailDomains[0] || '1secmail.com');
    
    const customPrefix = prefixInput ? prefixInput.value.trim().toLowerCase() : '';
    if (customPrefix) {
        login = customPrefix.replace(/[^a-z0-9_.-]/g, '');
        if (!login) {
            alert('Custom prefix must be alphanumeric (letters, numbers, underscores, dots, hyphens)!');
            return;
        }
    } else {
        login = 'temp_' + Math.random().toString(36).substring(2, 10);
    }
    
    const email = `${login}@${selectedDomain}`;
    
    const generateBtn = document.querySelector('.mail-select-row button');
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Spawning';
    }
    
    try {
        addEmailAccountNode(email, login, selectedDomain);
        if (prefixInput) prefixInput.value = '';
    } catch (e) {
        console.error('Error spawning account:', e);
        alert('Failed to spawn temporary email: ' + e.message);
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Generate';
        }
    }
}

// Add account to lists
function addEmailAccountNode(email, login, domain) {
    if (!mailAccounts.some(acc => acc.email === email)) {
        mailAccounts.unshift({ email, login, domain });
        if (mailAccounts.length > 8) {
            mailAccounts.pop(); // limit size
        }
    }
    
    setActiveEmailAccount(email);
    saveMailAccounts();
    renderMailNodes();
}

// Change active mailbox
function setActiveEmailAccount(email) {
    activeMailAddress = email;
    
    const addrEl = document.getElementById('active-email-address-text');
    if (addrEl) addrEl.textContent = email;
    
    const inboxContainer = document.getElementById('mail-inbox-list-container');
    if (inboxContainer) {
        inboxContainer.innerHTML = '<div class="mail-empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i> Syncing incoming stream...</div>';
    }
    
    closeMailViewer();
    renderMailNodes();
    
    const mockTo = document.getElementById('mock-mail-to');
    if (mockTo) mockTo.value = email;
    
    refreshEmailInbox();
    startMailPolling();
}

// Background polling manager
function startMailPolling() {
    if (mailRefreshInterval) clearInterval(mailRefreshInterval);
    mailRefreshInterval = setInterval(() => {
        if (currentMainPanel === 'mail' && activeMailAddress) {
            refreshEmailInbox(true); // silent check
        }
    }, 5000);
}

// Render active accounts list
function renderMailNodes() {
    const container = document.getElementById('mail-nodes-list-container');
    const badge = document.getElementById('mail-node-count-badge');
    if (!container) return;
    
    if (badge) {
        badge.textContent = `${mailAccounts.length} Node${mailAccounts.length !== 1 ? 's' : ''}`;
    }
    
    if (mailAccounts.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 1rem 0;">No active nodes.</div>';
        return;
    }
    
    container.innerHTML = mailAccounts.map(acc => `
        <div class="mail-node-item ${acc.email === activeMailAddress ? 'active' : ''}" onclick="setActiveEmailAccount('${acc.email}')">
            <span title="${acc.email}">${acc.email}</span>
            <button onclick="event.stopPropagation(); deleteMailAccount('${acc.email}')" title="Delete account">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `).join('');
}

// Delete mailbox account
function deleteMailAccount(email) {
    // Clear mocks for this account
    localStorage.removeItem(`tubeflow_mock_mails_${email}`);
    
    mailAccounts = mailAccounts.filter(acc => acc.email !== email);
    
    if (activeMailAddress === email) {
        if (mailAccounts.length > 0) {
            setActiveEmailAccount(mailAccounts[0].email);
        } else {
            activeMailAddress = '';
            const addrEl = document.getElementById('active-email-address-text');
            if (addrEl) addrEl.textContent = 'Generating address...';
            const listContainer = document.getElementById('mail-nodes-list-container');
            if (listContainer) listContainer.innerHTML = '';
            const countBadge = document.getElementById('mail-node-count-badge');
            if (countBadge) countBadge.textContent = '0 Nodes';
            spawnNewEmailAddress();
            return;
        }
    }
    saveMailAccounts();
    renderMailNodes();
}

// Force Sync / Fetch incoming stream from 1secmail
async function refreshEmailInbox(silent = false) {
    if (!activeMailAddress) return;
    
    const account = mailAccounts.find(acc => acc.email === activeMailAddress);
    if (!account) return;
    
    const listContainer = document.getElementById('mail-inbox-list-container');
    const refreshBtn = document.querySelector('.mail-header-buttons button[onclick="refreshEmailInbox()"]');
    
    if (refreshBtn && !silent) {
        refreshBtn.disabled = true;
        const icon = refreshBtn.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-rotate fa-spin';
    }
    
    try {
        const r = await fetch(`${API_BASE_URL}/api/mail?action=getMessages&login=${encodeURIComponent(account.login)}&domain=${encodeURIComponent(account.domain)}`);
        if (!r.ok) {
            throw new Error(`HTTP Error ${r.status}`);
        }
        const messages = await r.json();
        if (messages.error) {
            throw new Error(messages.error);
        }
        
        activeMailMessages = (messages || []).map(m => {
            return {
                id: m.id,
                from: m.from,
                subject: m.subject,
                date: m.date,
                snippet: ''
            };
        });
        
        // Merge mock injected emails
        const mockKey = `tubeflow_mock_mails_${activeMailAddress}`;
        const mockMails = JSON.parse(localStorage.getItem(mockKey) || '[]');
        
        let combinedMails = [...mockMails, ...activeMailMessages];
        
        // Sort by ID descending
        combinedMails.sort((a, b) => {
            const aId = String(a.id).startsWith('mock_') ? parseInt(String(a.id).split('_')[1], 10) : parseInt(a.id, 10);
            const bId = String(b.id).startsWith('mock_') ? parseInt(String(b.id).split('_')[1], 10) : parseInt(b.id, 10);
            return bId - aId;
        });
        
        renderMailInboxList(combinedMails);
    } catch (e) {
        console.error('Error syncing mail inbox:', e);
        if (!silent && listContainer) {
            listContainer.innerHTML = `<div class="mail-empty-state" style="color: #fca5a5;"><i class="fa-solid fa-triangle-exclamation"></i> Sync Error: ${e.message}</div>`;
        }
    } finally {
        if (refreshBtn && !silent) {
            refreshBtn.disabled = false;
            const icon = refreshBtn.querySelector('i');
            if (icon) icon.className = 'fa-solid fa-rotate';
        }
    }
}

// Render emails inside left inbox panel column
function renderMailInboxList(messages) {
    const container = document.getElementById('mail-inbox-list-container');
    if (!container) return;
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="mail-empty-state">
                <i class="fa-solid fa-envelope-open-text"></i>
                <p>No messages received yet. Waiting for incoming verifications...</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = messages.map(msg => {
        const isActive = currentMailMessage && currentMailMessage.id === msg.id;
        const subject = msg.subject || '(No Subject)';
        const dateStr = msg.date || '';
        const timeOnly = dateStr.includes(' ') ? dateStr.split(' ')[1] : dateStr;
        
        return `
            <div class="mail-card ${isActive ? 'active' : ''}" id="mail-card-${msg.id}" onclick="selectMailMessage('${msg.id}')">
                <div class="mail-card-header">
                    <span class="mail-card-sender" title="${escapeHtml(msg.from)}">${escapeHtml(msg.from.split('<')[0] || msg.from)}</span>
                    <span class="mail-card-time">${escapeHtml(timeOnly)}</span>
                </div>
                <div class="mail-card-subject" title="${escapeHtml(subject)}">${escapeHtml(subject)}</div>
                <div class="mail-card-snippet">Click to decrypt payload...</div>
            </div>
        `;
    }).join('');
}

// Select email message from incoming stream
async function selectMailMessage(id) {
    const cards = document.querySelectorAll('.mail-card');
    cards.forEach(card => card.classList.remove('active'));
    
    const selectedCard = document.getElementById(`mail-card-${id}`);
    if (selectedCard) selectedCard.classList.add('active');
    
    // Show loading state in viewer panel
    document.getElementById('mail-viewer-placeholder').classList.add('hidden');
    document.getElementById('mail-viewer-content').classList.remove('hidden');
    
    const senderNameEl = document.getElementById('mail-msg-sender-name');
    const senderAddrEl = document.getElementById('mail-msg-sender-address');
    const subjectEl = document.getElementById('mail-msg-subject');
    const timeEl = document.getElementById('mail-msg-time');
    
    senderNameEl.textContent = 'Loading...';
    senderAddrEl.textContent = '';
    subjectEl.textContent = 'Fetching email...';
    timeEl.textContent = '';
    
    // Check if mock
    const mockKey = `tubeflow_mock_mails_${activeMailAddress}`;
    const mockMails = JSON.parse(localStorage.getItem(mockKey) || '[]');
    const mockMsg = mockMails.find(m => m.id === id || m.id == id);
    
    let msgDetails = null;
    
    if (mockMsg) {
        msgDetails = mockMsg;
    } else {
        const account = mailAccounts.find(acc => acc.email === activeMailAddress);
        if (!account) return;
        
        try {
            const r = await fetch(`${API_BASE_URL}/api/mail?action=readMessage&login=${encodeURIComponent(account.login)}&domain=${encodeURIComponent(account.domain)}&id=${encodeURIComponent(id)}`);
            if (!r.ok) throw new Error(`HTTP Error ${r.status}`);
            const data = await r.json();
            if (data.error) throw new Error(data.error);
            
            msgDetails = {
                id: data.id,
                from: data.from || '',
                subject: data.subject || '',
                date: data.date || '',
                textBody: data.textBody || data.body || '',
                htmlBody: data.htmlBody || data.body || data.textBody || ''
            };
        } catch (e) {
            console.error('Error fetching email body:', e);
            senderNameEl.textContent = 'Error';
            subjectEl.textContent = 'Failed to fetch email';
            senderAddrEl.textContent = e.message;
            return;
        }
    }
    
    currentMailMessage = msgDetails;
    
    const fromStr = msgDetails.from || '';
    const namePart = fromStr.includes('<') ? fromStr.split('<')[0].trim() : fromStr.split('@')[0];
    const addrPart = fromStr.includes('<') ? fromStr.split('<')[1].replace('>', '').trim() : fromStr;
    
    senderNameEl.textContent = namePart || 'Sender';
    senderAddrEl.textContent = addrPart;
    subjectEl.textContent = msgDetails.subject || '(No Subject)';
    
    const dateStr = msgDetails.date || '';
    const timeOnly = dateStr.includes(' ') ? dateStr.split(' ')[1] : dateStr;
    timeEl.textContent = timeOnly;
    
    const avatarEl = document.getElementById('mail-sender-avatar-letter');
    if (avatarEl) avatarEl.textContent = (namePart.charAt(0) || 'S').toUpperCase();
    
    const textBody = msgDetails.textBody || '';
    const htmlBody = msgDetails.htmlBody || '';
    
    // Detect OTP first
    detectAndDisplayOTP(msgDetails.subject + ' ' + textBody + ' ' + htmlBody);
    
    // Auto open email body in new tab
    openEmailInNewTab();
}

// Switch between Rich HTML render and Plain decrypt text tabs
function switchMailViewTab(tab) {
    const richBtn = document.getElementById('mail-view-tab-rich');
    const plainBtn = document.getElementById('mail-view-tab-plain');
    const bodyPaneRich = document.getElementById('mail-body-pane-rich');
    const bodyPanePlain = document.getElementById('mail-body-pane-plain');
    
    if (tab === 'rich') {
        if (richBtn) richBtn.classList.add('active');
        if (plainBtn) plainBtn.classList.remove('active');
        if (bodyPaneRich) bodyPaneRich.classList.add('active');
        if (bodyPanePlain) bodyPanePlain.classList.remove('active');
    } else {
        if (richBtn) richBtn.classList.remove('active');
        if (plainBtn) plainBtn.classList.add('active');
        if (bodyPaneRich) bodyPaneRich.classList.remove('active');
        if (bodyPanePlain) bodyPanePlain.classList.add('active');
    }
}

// Open active decrypted email content in a new browser tab/window
function openEmailInNewTab() {
    if (!currentMailMessage) {
        showToastNotification('Please select an email message first.');
        return;
    }
    const textBody = currentMailMessage.textBody || '';
    const htmlBody = currentMailMessage.htmlBody || '';
    const cleanHtml = htmlBody || textBody.replace(/\n/g, '<br>');
    
    const newWindow = window.open();
    if (newWindow) {
        newWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${currentMailMessage.subject || 'Decrypted Email'}</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        font-size: 16px;
                        color: #1e293b;
                        line-height: 1.6;
                        padding: 30px 15px;
                        margin: 0;
                        background-color: #f8fafc;
                    }
                    .email-container {
                        max-width: 650px;
                        margin: 0 auto;
                        background: #ffffff;
                        padding: 30px;
                        border: 1px solid #e2e8f0;
                        border-radius: 8px;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
                    }
                    .email-header {
                        border-bottom: 1px solid #e2e8f0;
                        margin-bottom: 25px;
                        padding-bottom: 20px;
                    }
                    .email-subject {
                        font-size: 20px;
                        font-weight: 700;
                        color: #0f172a;
                        margin: 0 0 10px 0;
                    }
                    .email-meta {
                        font-size: 14px;
                        color: #64748b;
                        line-height: 1.8;
                    }
                    .email-body {
                        color: #334155;
                        word-break: break-word;
                    }
                    a { color: #10b981; }
                </style>
            </head>
            <body>
                <div class="email-container">
                    <div class="email-header">
                        <h1 class="email-subject">${currentMailMessage.subject || '(No Subject)'}</h1>
                        <div class="email-meta">
                            <strong>From:</strong> ${currentMailMessage.from || 'Unknown'}<br>
                            <strong>Date:</strong> ${currentMailMessage.date || ''}
                        </div>
                    </div>
                    <div class="email-body">
                        ${cleanHtml}
                    </div>
                </div>
            </body>
            </html>
        `);
        newWindow.document.close();
    } else {
        alert('Please allow popups to open the email in a new tab.');
    }
}

// Close message view pane
function closeMailViewer() {
    currentMailMessage = null;
    const viewContent = document.getElementById('mail-viewer-content');
    const viewPlaceholder = document.getElementById('mail-viewer-placeholder');
    const otpBanner = document.getElementById('mail-otp-banner');
    
    if (viewContent) viewContent.classList.add('hidden');
    if (viewPlaceholder) viewPlaceholder.classList.remove('hidden');
    if (otpBanner) otpBanner.classList.add('hidden');
}

// Copy active email address
function copyActiveEmailAddress() {
    if (!activeMailAddress) return;
    navigator.clipboard.writeText(activeMailAddress).then(() => {
        showToastNotification('Email address copied!');
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// Smart Regex Extractor for verifications codes (OTP)
function detectAndDisplayOTP(content) {
    const banner = document.getElementById('mail-otp-banner');
    const codeVal = document.getElementById('mail-otp-code-value');
    const copyBtn = document.getElementById('mail-otp-copy-btn');
    
    if (!banner || !codeVal) return;
    
    banner.classList.add('hidden');
    
    let matchedCode = null;
    
    // Regex 1: look for specific keyword patterns followed by alphanumeric codes
    const keywordRegex = /(?:code|otp|verification|passcode|pin|activation|confirm|security)(?:\s+is|\s*[:=-])?\s*([0-9]{4,8}(?:-[0-9]{3,8})?|[a-z0-9]{6,8})/i;
    const kwMatch = content.match(keywordRegex);
    
    if (kwMatch && kwMatch[1]) {
        matchedCode = kwMatch[1].replace(/[-\s]/g, '').trim();
    } else {
        // Regex 2: Fallback to searching for isolated 6-digit number
        const numberRegex = /\b([0-9]{6})\b/;
        const numMatch = content.match(numberRegex);
        if (numMatch && numMatch[1]) {
            matchedCode = numMatch[1];
        }
    }
    
    if (matchedCode && matchedCode.length >= 4) {
        codeVal.textContent = matchedCode.toUpperCase();
        banner.classList.remove('hidden');
        
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(matchedCode.toUpperCase()).then(() => {
                showToastNotification('Verification code copied!');
            });
        };
    }
}

// Mock Mail Simulator Drawer Handlers
function openMockMailerDrawer() {
    const drawer = document.getElementById('mail-drawer');
    const overlay = document.getElementById('mail-drawer-overlay');
    const mockTo = document.getElementById('mock-mail-to');
    
    if (drawer && overlay) {
        drawer.classList.remove('hidden');
        overlay.classList.remove('hidden');
    }
    
    if (mockTo) {
        mockTo.value = activeMailAddress || 'None (Generate first)';
    }
}

// Close Simulator Drawer
function closeMockMailerDrawer() {
    const drawer = document.getElementById('mail-drawer');
    const overlay = document.getElementById('mail-drawer-overlay');
    if (drawer && overlay) {
        drawer.classList.add('hidden');
        overlay.classList.add('hidden');
    }
}

// Preset loader for Packet Simulator
function loadMockEmailPreset(presetName) {
    const fromEl = document.getElementById('mock-mail-from');
    const nameEl = document.getElementById('mock-mail-sender-name');
    const subjectEl = document.getElementById('mock-mail-subject');
    const bodyEl = document.getElementById('mock-mail-body');
    
    if (!fromEl || !nameEl || !subjectEl || !bodyEl) return;
    
    const code = Math.floor(100000 + Math.random() * 900000);
    
    if (presetName === 'google') {
        fromEl.value = 'security@accounts.google.com';
        nameEl.value = 'Google Accounts';
        subjectEl.value = `${code} is your Google verification code`;
        bodyEl.value = `
<div style="font-family: Roboto,sans-serif; border: 1px solid #e0e0e0; padding: 45px 30px; border-radius: 8px; max-width: 500px; margin: 0 auto; background-color: #ffffff; color: #3c4043;">
    <h2 style="font-size: 24px; font-weight: normal; color: #202124; margin: 0 0 16px 0; text-align: center;">Verify your email</h2>
    <p style="font-size: 14px; color: #5f6368; line-height: 1.5; margin: 0 0 24px 0;">Google has received a request to log in to your account. Use the following credentials code to authorize access:</p>
    <div style="background-color: #f1f3f4; border-radius: 6px; padding: 20px; font-size: 34px; font-weight: bold; text-align: center; letter-spacing: 5px; color: #1a73e8; margin-bottom: 24px;">${code}</div>
    <p style="font-size: 12px; color: #9aa0a6; line-height: 1.5; margin: 0; text-align: center;">This code will expire in 10 minutes. If you did not request this code, please secure your account credentials.</p>
</div>`;
    } else if (presetName === 'github') {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let ghCode = '';
        for (let i = 0; i < 8; i++) ghCode += chars.charAt(Math.floor(Math.random() * chars.length));
        
        fromEl.value = 'noreply@github.com';
        nameEl.value = 'GitHub Device Security';
        subjectEl.value = `[GitHub] Please verify your device - Activation code: ${ghCode}`;
        bodyEl.value = `
<div style="font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; padding: 30px; max-width: 550px; border: 1px solid #d0d7de; border-radius: 6px; margin: 0 auto; color: #24292f; background-color: #ffffff;">
    <h3 style="font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 16px;">Device Activation</h3>
    <p style="line-height: 1.5; font-size: 14px; margin-bottom: 24px;">A new device was logged into your GitHub account. Confirm this browser access by entering the following credentials code:</p>
    <div style="font-size: 30px; font-weight: 700; color: #0969da; letter-spacing: 3px; text-align: center; border: 1px dashed #0969da; padding: 15px; border-radius: 6px; background-color: #f6f8fa; margin-bottom: 24px;">${ghCode}</div>
    <p style="font-size: 12px; color: #57606a; line-height: 1.5;">If this wasn't you, your credentials might be leaked. Change your account password immediately.</p>
</div>`;
    } else if (presetName === 'netflix') {
        fromEl.value = 'info@account.netflix.com';
        nameEl.value = 'Netflix Service';
        subjectEl.value = `Your Netflix verification code: ${code}`;
        bodyEl.value = `
<div style="background-color: #111111; color: #ffffff; padding: 45px 30px; font-family: Helvetica,Arial,sans-serif; max-width: 500px; border-radius: 6px; margin: 0 auto; text-align: center;">
    <h1 style="color: #e50914; font-size: 36px; font-weight: bold; margin: 0 0 25px 0; letter-spacing: 1px;">NETFLIX</h1>
    <h2 style="font-size: 22px; color: #ffffff; margin-bottom: 15px; font-weight: normal;">Confirm playback login</h2>
    <p style="color: #cccccc; font-size: 14px; line-height: 1.5; margin-bottom: 25px;">Enter the following OTP code to authorize streaming on this machine:</p>
    <div style="font-size: 40px; font-weight: bold; color: #ffffff; letter-spacing: 5px; margin-bottom: 30px; text-shadow: 0 0 10px rgba(229, 9, 20, 0.4);">${code}</div>
    <p style="color: #666666; font-size: 12px;">This code is valid for 15 minutes. Enjoy your movies!</p>
</div>`;
    }
}

// Inject mock mail into browser sandbox localStorage inbox
function injectMockMail() {
    if (!activeMailAddress) {
        alert('Please generate a temporary email node first!');
        return;
    }
    
    const fromVal = document.getElementById('mock-mail-from').value.trim();
    const nameVal = document.getElementById('mock-mail-sender-name').value.trim();
    const subjectVal = document.getElementById('mock-mail-subject').value.trim();
    const bodyVal = document.getElementById('mock-mail-body').value.trim();
    
    if (!fromVal || !subjectVal || !bodyVal) {
        alert('Please fill all required packet fields!');
        return;
    }
    
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    // Make ID unique and sortable
    const id = "mock_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    
    const signature = nameVal ? `${nameVal} <${fromVal}>` : fromVal;
    
    const mockMsg = {
        id: id,
        from: signature,
        subject: subjectVal,
        date: timestamp,
        textBody: bodyVal.replace(/<[^>]*>/g, ''), // Plain snippet
        htmlBody: bodyVal
    };
    
    const mockKey = `tubeflow_mock_mails_${activeMailAddress}`;
    const mockMails = JSON.parse(localStorage.getItem(mockKey) || '[]');
    mockMails.unshift(mockMsg);
    localStorage.setItem(mockKey, JSON.stringify(mockMails));
    
    closeMockMailerDrawer();
    
    const form = document.getElementById('mock-mailer-form');
    if (form) form.reset();
    
    refreshEmailInbox();
    showToastNotification('Mock verification packet injected!');
}

