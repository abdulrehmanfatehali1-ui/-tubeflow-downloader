// ==========================================
// STATE MANAGEMENT & CONSTANTS
// ==========================================
const API_BASE = 'https://api.mail.tm';

const state = {
  accounts: [],        // Array of { address, password, token, createdAt }
  activeAccount: null, // Current active account object
  messages: [],        // Messages list for the active account
  selectedMessage: null,
  domains: ['mail.tm'],
  pollingInterval: null,
  isPolling: false
};

// ==========================================
// AUDIO SYNTH NOTIFICATION CHIME
// ==========================================
function playNotificationChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    // Futuristic glass chime synth: Double-chime in high scale
    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, now);     // E5
    osc.frequency.setValueAtTime(987.77, now + 0.1); // B5
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    
    osc.start(now);
    osc.stop(now + 0.5);
  } catch (err) {
    console.warn('[Audio] Synth play blocked or unsupported:', err);
  }
}

// ==========================================
// DOM TOAST UTILITIES
// ==========================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = type === 'success' ? 'check-circle' : 'alert-circle';
  toast.innerHTML = `
    <i data-lucide="${icon}" class="toast-icon"></i>
    <div class="toast-content">${message}</div>
  `;
  
  container.appendChild(toast);
  lucide.createIcons(); // Hydrate Lucide SVG in toast
  
  // Slide out after 3.5 seconds
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 3500);
}

// ==========================================
// INTELLIGENT OTP AUTO-DETECTOR ENGINE
// ==========================================
function scanForOTP(message) {
  const otpBanner = document.getElementById('otpBanner');
  const otpValue = document.getElementById('otpValue');
  if (!otpBanner || !otpValue) return;

  otpBanner.style.display = 'none';

  // Extract from Subject or Text Body
  const contentToScan = `${message.subject} \n ${message.text}`;
  
  // Regex combinations:
  // Matches standard 4-8 digit codes surrounded by word boundaries
  const otpRegex = /\b(\d{4,8})\b/g;
  
  // Validation keywords indicating code transmission
  const keywords = ['otp', 'code', 'verification', 'verify', 'confirm', 'security', 'one-time', 'access', 'passcode', 'activation', 'pin', 'verifikasi', 'sandi'];
  
  const contentLower = contentToScan.toLowerCase();
  const hasKeyword = keywords.some(k => contentLower.includes(k));
  
  if (!hasKeyword) return; // Stop scan if no keywords are present

  let match;
  const matches = [];
  while ((match = otpRegex.exec(contentToScan)) !== null) {
    const code = match[1];
    
    // Ignore common years in standard headers
    if (code === '2024' || code === '2025' || code === '2026') continue;
    matches.push(code);
  }

  if (matches.length > 0) {
    // Show the first candidate found
    const detectedCode = matches[0];
    otpValue.textContent = detectedCode;
    otpBanner.style.display = 'flex';
    
    // Auto-update copy trigger
    const copyBtn = document.getElementById('otpCopyBtn');
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(detectedCode)
        .then(() => showToast(`Copied OTP: ${detectedCode}`))
        .catch(() => showToast('Failed to copy to clipboard', 'error'));
    };
  }
}

// ==========================================
// API REST ACTIONS (MAIL.TM CLIENT INTERFACE)
// ==========================================

// Fetch config domains from Mail.tm
async function fetchConfig() {
  try {
    const res = await fetch(`${API_BASE}/domains`);
    if (res.ok) {
      const data = await res.json();
      const list = data['hydra:member'] || [];
      // Get all active domains
      state.domains = list.filter(d => d.isActive).map(d => d.domain);
      if (state.domains.length === 0) state.domains = ['mail.tm'];
      
      // Update Domain Selector options in drawer
      const domainSelect = document.getElementById('domainSelect');
      if (domainSelect) {
        domainSelect.innerHTML = state.domains.map(d => `<option value="${d}">${d}</option>`).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load Mail.tm domains:', err);
  }
}

// Create new Mail.tm account and obtain JWT token
async function createAccount(prefix = '', domain = '') {
  try {
    const selectDomain = domain || state.domains[0];
    const cleanPrefix = prefix ? prefix.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') : generateRandomPrefix();
    const address = `${cleanPrefix}@${selectDomain}`;
    const password = Math.random().toString(36).substring(2, 12); // secure random pass

    // 1. Create Account
    const res = await fetch(`${API_BASE}/accounts`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ address, password })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData['hydra:description'] || errData.message || 'Failed to create email');
    }

    // 1.5. Resilient Auth Pipeline: Wait for propagation & retry if database lags
    let token = '';
    let loginAttempts = 4;
    let delayMs = 1500;

    for (let i = 0; i < loginAttempts; i++) {
      try {
        const tokenRes = await fetch(`${API_BASE}/token`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ address, password })
        });

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          token = tokenData.token;
          break; // Authenticated successfully!
        }
        
        // If it's the last attempt, parse the specific error message and throw
        if (i === loginAttempts - 1) {
          let errMsg = 'Failed to authenticate session token';
          try {
            const errData = await tokenRes.json();
            errMsg = errData['hydra:description'] || errData.message || errMsg;
          } catch (e) {}
          throw new Error(errMsg);
        }
      } catch (err) {
        if (i === loginAttempts - 1) throw err;
      }

      // Lags detected - Wait and retry with backoff
      console.warn(`[Auth] Database sync lag detected. Retrying token in ${delayMs}ms (Attempt ${i + 1}/${loginAttempts})...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs += 1000; // Exponential backoff
    }

    const newAcc = { address, password, token, createdAt: new Date().toISOString() };
    state.accounts.unshift(newAcc);
    saveAccountsToCache();
    setActiveAccount(newAcc);
    
    showToast(`Created email: ${address}`);
    return newAcc;
  } catch (err) {
    showToast(err.message, 'error');
    console.error(err);
  }
}

// Fetch messages for active email
async function fetchInbox(isBackground = false) {
  if (!state.activeAccount) return;
  
  try {
    const res = await fetch(`${API_BASE}/messages`, {
      headers: {
        'Authorization': `Bearer ${state.activeAccount.token}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) throw new Error('Failed to fetch messages');

    const data = await res.json();
    const serverMails = data['hydra:member'] || [];
    
    // Check if new emails arrived (Trigger chime synth!)
    if (isBackground && serverMails.length > state.messages.length) {
      playNotificationChime();
      
      // Calculate how many new mails
      const diff = serverMails.length - state.messages.length;
      showToast(`Received ${diff} new email(s)!`);
    }

    state.messages = serverMails;
    renderInboxList();
  } catch (err) {
    console.error('Polling failed:', err);
  }
}

// Fetch single message details
async function fetchMessageDetails(msgId) {
  if (!state.activeAccount) return;

  // Check if it's a simulated mock email (local only)
  if (msgId.startsWith('mock_')) {
    const mockMail = state.messages.find(m => m.id === msgId);
    if (mockMail) {
      mockMail.seen = true;
      state.selectedMessage = mockMail;
      renderInboxList();
      renderMessageBody();
    }
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/messages/${msgId}`, {
      headers: {
        'Authorization': `Bearer ${state.activeAccount.token}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) throw new Error('Failed to load email details');

    const mailData = await res.json();
    state.selectedMessage = mailData;

    // Update read state in UI
    const localMail = state.messages.find(m => m.id === msgId);
    if (localMail) localMail.seen = true;
    renderInboxList();

    renderMessageBody();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Simulated local mock email injector (Since Vercel is a static page host)
function injectSimulatedEmail(payload) {
  if (!state.activeAccount) return;

  // Create message in Mail.tm structure
  const mockMsg = {
    id: 'mock_' + Math.random().toString(36).substring(2, 11),
    from: { address: payload.fromAddress, name: payload.fromName || 'Sender' },
    to: [{ address: state.activeAccount.address }],
    subject: payload.subject,
    text: payload.text,
    html: [payload.html || payload.text],
    createdAt: new Date().toISOString(),
    seen: false
  };

  playNotificationChime();
  state.messages.unshift(mockMsg);
  renderInboxList();
  
  showToast('Simulated email injected locally!');
  closeDrawer('mailer');
}

// ==========================================
// DOM RENDERING ACTIONS
// ==========================================

function renderInboxList() {
  const container = document.getElementById('inboxList');
  if (!container) return;

  if (state.messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="inbox"></i></div>
        <h3>Your Inbox is Empty</h3>
        <p>Real emails sent to your temporary address will appear here in real-time.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = state.messages.map(mail => {
    const isSelected = state.selectedMessage && state.selectedMessage.id === mail.id;
    const isUnread = !mail.seen;
    const dateStr = formatDateTime(mail.createdAt || mail.date);

    return `
      <div class="mail-item ${isSelected ? 'active' : ''} ${isUnread ? 'unread' : ''}" onclick="selectMail('${mail.id}')">
        <div class="mail-item-header">
          <span class="mail-sender-name">${escapeHTML(mail.from.name || mail.from.address)}</span>
          <span class="mail-time">${dateStr}</span>
        </div>
        <div class="mail-subject">${escapeHTML(mail.subject)}</div>
        <div class="mail-preview">${escapeHTML((mail.intro || mail.text || '').substring(0, 100))}...</div>
      </div>
    `;
  }).join('');
}

function renderMessageBody() {
  const msg = state.selectedMessage;
  if (!msg) return;

  document.getElementById('messageViewer').style.display = 'flex';
  const emptyState = document.querySelector('.select-mail-state');
  if (emptyState) emptyState.style.display = 'none';

  // Fill in Header metadata
  document.getElementById('viewSubject').textContent = msg.subject;
  document.getElementById('viewDate').textContent = formatDateTime(msg.createdAt || msg.date);
  document.getElementById('viewSenderName').textContent = msg.from.name || 'Sender';
  document.getElementById('viewSenderAddress').textContent = `<${msg.from.address}>`;

  // Update Avatar Letter
  const firstLetter = (msg.from.name || msg.from.address || 'S')[0].toUpperCase();
  document.getElementById('senderAvatar').textContent = firstLetter;

  // Scan and render OTP banner if verification code exists!
  scanForOTP({
    subject: msg.subject,
    text: msg.text || (msg.html ? msg.html[0] : '')
  });

  // Setup Iframe HTML body
  const htmlFrame = document.getElementById('htmlFrame');
  if (htmlFrame) {
    const doc = htmlFrame.contentDocument || htmlFrame.contentWindow.document;
    doc.open();
    
    let htmlContent = '';
    if (msg.html && msg.html.length > 0) {
      htmlContent = msg.html[0];
    } else {
      htmlContent = msg.text;
    }
    
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              font-size: 14px;
              line-height: 1.6;
              color: #222;
              margin: 16px;
              word-break: break-word;
            }
            img { max-width: 100%; height: auto; }
          </style>
        </head>
        <body>${htmlContent}</body>
      </html>
    `);
    doc.close();
  }

  // Setup Plain text body representation
  const textFrame = document.getElementById('textFrame');
  if (textFrame) {
    textFrame.textContent = msg.text || '';
  }

  // Auto reset active tab to HTML
  switchViewerTab('rich');
  lucide.createIcons();
}

function renderAccountHistory() {
  const container = document.getElementById('accountHistoryList');
  if (!container) return;

  document.getElementById('historyCount').textContent = `${state.accounts.length} Active`;
  document.getElementById('accountCountBadge').textContent = state.accounts.length;

  if (state.accounts.length === 0) {
    container.innerHTML = `<p class="form-hint" style="text-align: center; padding: 20px 0;">No active addresses created yet.</p>`;
    return;
  }

  container.innerHTML = state.accounts.map(acc => {
    const isActive = state.activeAccount && state.activeAccount.address === acc.address;
    const dateStr = new Date(acc.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return `
      <div class="history-card ${isActive ? 'active' : ''}">
        <div class="history-card-info" onclick="switchActiveEmail('${acc.address}')">
          <span class="history-email">${acc.address}</span>
          <span class="history-date">Created on ${dateStr}</span>
        </div>
        <div class="history-actions-row">
          <button class="icon-btn tooltip" data-tooltip="Copy Address" onclick="copyAddressToClipboard('${acc.address}')">
            <i data-lucide="copy"></i>
          </button>
          <button class="icon-btn tooltip" data-tooltip="Delete Account" style="color: var(--accent-rose)" onclick="deleteAccountFromCache('${acc.address}')">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  lucide.createIcons();
}

// ==========================================
// CORE HELPERS & ACTIONS
// ==========================================

function selectMail(msgId) {
  fetchMessageDetails(msgId);
}

function switchActiveEmail(address) {
  const targetAcc = state.accounts.find(a => a.address === address);
  if (targetAcc) {
    setActiveAccount(targetAcc);
    showToast(`Switched inbox to: ${address}`);
    closeDrawer('history');
  }
}

function setActiveAccount(account) {
  state.activeAccount = account;
  state.selectedMessage = null;
  state.messages = [];
  
  // Hide viewer
  document.getElementById('messageViewer').style.display = 'none';
  const emptyState = document.querySelector('.select-mail-state');
  if (emptyState) emptyState.style.display = 'flex';

  if (account) {
    document.getElementById('activeAddressWidget').style.display = 'flex';
    document.getElementById('activeEmailText').textContent = account.address;
    
    // Update input in Mock Mailer locked form
    document.getElementById('mockTo').value = account.address;
    
    // Refresh inbox
    fetchInbox();
    startPolling();
  } else {
    document.getElementById('activeAddressWidget').style.display = 'none';
    stopPolling();
  }

  renderAccountHistory();
}

function copyAddressToClipboard(address) {
  navigator.clipboard.writeText(address)
    .then(() => showToast('Email copied to clipboard!'))
    .catch(() => showToast('Failed to copy', 'error'));
}

function deleteAccountFromCache(address) {
  if (confirm(`Are you sure you want to delete account: ${address}? You will lose all messages in this inbox.`)) {
    state.accounts = state.accounts.filter(a => a.address !== address);
    saveAccountsToCache();
    
    if (state.activeAccount && state.activeAccount.address === address) {
      setActiveAccount(state.accounts.length > 0 ? state.accounts[0] : null);
    } else {
      renderAccountHistory();
    }
    
    showToast('Account removed locally');
  }
}

function startPolling() {
  stopPolling();
  
  const pollStatus = document.querySelector('.polling-status');
  if (pollStatus) pollStatus.style.opacity = '1';

  state.pollingInterval = setInterval(() => {
    fetchInbox(true);
  }, 5000); // Check inbox every 5 seconds
}

function stopPolling() {
  if (state.pollingInterval) {
    clearInterval(state.pollingInterval);
    state.pollingInterval = null;
  }
  
  const pollStatus = document.querySelector('.polling-status');
  if (pollStatus) pollStatus.style.opacity = '0.4';
}

function saveAccountsToCache() {
  localStorage.setItem('tempmail_accounts_v2', JSON.stringify(state.accounts));
}

function loadAccountsFromCache() {
  const cached = localStorage.getItem('tempmail_accounts_v2');
  if (cached) {
    try {
      state.accounts = JSON.parse(cached);
    } catch (e) {
      state.accounts = [];
    }
  }
}

// Generate secure random username prefixes
function generateRandomPrefix() {
  const adjectives = ['swift', 'hyper', 'neon', 'glitch', 'retro', 'cyber', 'cosmic', 'sonic', 'sweet', 'cool'];
  const nouns = ['wolf', 'duck', 'falcon', 'ghost', 'nexus', 'matrix', 'pixel', 'rider', 'shark', 'wave'];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(100 + Math.random() * 900); // 3 digit random

  return `${adj}.${noun}${num}`;
}

// Slide Over Drawer triggers
function openDrawer(id) {
  document.getElementById(`${id}Overlay`).classList.add('active');
  document.getElementById(`${id}Drawer`).classList.add('active');
}

function closeDrawer(id) {
  document.getElementById(`${id}Overlay`).classList.remove('active');
  document.getElementById(`${id}Drawer`).classList.remove('active');
}

// View Tabs HTML / Text
function switchViewerTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });
  
  document.getElementById('paneRich').classList.toggle('active', tab === 'rich');
  document.getElementById('panePlain').classList.toggle('active', tab === 'plain');
}

// Presets mock emails setup
function fillMockPreset(preset) {
  const fromInput = document.getElementById('mockFrom');
  const senderNameInput = document.getElementById('mockSenderName');
  const subjectInput = document.getElementById('mockSubject');
  const bodyTextarea = document.getElementById('mockBody');

  const randomOtp = Math.floor(100000 + Math.random() * 900000); // 6-digit random code

  if (preset === 'google') {
    fromInput.value = 'no-reply@accounts.google.com';
    senderNameInput.value = 'Google Accounts';
    subjectInput.value = `${randomOtp} is your Google verification code`;
    bodyTextarea.value = `
      <div style="font-family: Roboto,Helvetica,Arial,sans-serif; border: 1px solid #e0e0e0; padding: 40px; max-width: 500px; margin: 0 auto; border-radius: 8px;">
        <img src="https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_74x24dp.png" alt="Google" style="margin-bottom: 24px;">
        <h2 style="font-size: 24px; color: #202124; margin-bottom: 16px;">Verify your identity</h2>
        <p style="font-size: 14px; color: #5f6368; line-height: 1.5;">Use the following code to complete your security check. This code will expire in 10 minutes.</p>
        <div style="background-color: #f8f9fa; border-radius: 8px; text-align: center; padding: 20px; margin: 24px 0; font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1a73e8;">
          ${randomOtp}
        </div>
        <p style="font-size: 12px; color: #9aa0a6;">If you did not request this security code, please ignore this email or change your password immediately.</p>
      </div>
    `.trim();
  } else if (preset === 'github') {
    fromInput.value = 'noreply@github.com';
    senderNameInput.value = 'GitHub';
    subjectInput.value = `[GitHub] Please verify your device - Verification Code: ${randomOtp}`;
    bodyTextarea.value = `
      <div style="font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; background-color: #f6f8fa; padding: 48px 24px; color: #24292f;">
        <div style="max-width: 540px; margin: 0 auto; background-color: #ffffff; border: 1px solid #d0d7de; border-radius: 6px; padding: 32px;">
          <h2 style="font-size: 24px; font-weight: 500; margin-bottom: 16px;">Hey @user!</h2>
          <p style="font-size: 14px; margin-bottom: 24px;">A sign-in attempt was detected on your account. Please enter the security verification code below to authorize access.</p>
          <div style="font-size: 36px; font-weight: 600; text-align: center; padding: 16px; background-color: #f6f8fa; border-radius: 6px; border: 1px dashed #afb8c1; color: #24292f; margin: 24px 0; letter-spacing: 2px;">
            ${randomOtp}
          </div>
          <p style="font-size: 12px; color: #57606a; margin-top: 32px;">This code is valid for 10 minutes. If this was not you, protect your account.</p>
        </div>
      </div>
    `.trim();
  } else if (preset === 'netflix') {
    fromInput.value = 'info@netflix.com';
    senderNameInput.value = 'Netflix Support';
    subjectInput.value = `Your Netflix Temporary Access Code: ${randomOtp}`;
    bodyTextarea.value = `
      <div style="background-color: #000; font-family: Helvetica,Arial,sans-serif; color: #fff; padding: 50px 20px; text-align: center;">
        <div style="max-width: 480px; margin: 0 auto; background-color: #141414; padding: 30px; border-radius: 4px; border-top: 4px solid #e50914;">
          <h1 style="color: #e50914; font-size: 30px; margin-bottom: 24px; font-weight: bold;">NETFLIX</h1>
          <p style="font-size: 16px; color: #cccccc; margin-bottom: 30px; text-align: left; line-height: 1.5;">Hi Customer,<br><br>We received a request to access your Netflix account. Use this code to authorize access to your streaming profile:</p>
          <div style="font-size: 38px; font-weight: 800; color: #ffffff; background-color: #222222; padding: 15px; border-radius: 4px; display: inline-block; margin: 10px 0 30px 0; padding-left: 30px; padding-right: 30px; letter-spacing: 5px;">
            ${randomOtp}
          </div>
          <p style="font-size: 12px; color: #8c8c8c; text-align: left; line-height: 1.4;">This code is valid for only 15 minutes. For security, never share this code with anyone. Netflix representatives will never ask for this code.</p>
        </div>
      </div>
    `.trim();
  }

  showToast(`Loaded ${preset.toUpperCase()} mock preset!`);
}

// Utility Formatting helpers
function formatDateTime(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + ', ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return isoString;
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================
// EVENTS REGISTER & INIT
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initial Load Cache
  loadAccountsFromCache();

  // 2. Fetch Mail.tm domains configuration list
  await fetchConfig();

  // 3. Set Active account or auto generate initial temp email instantly
  if (state.accounts.length > 0) {
    setActiveAccount(state.accounts[0]);
  } else {
    // Generate initial account to welcome the user instantly!
    await createAccount();
  }

  // 4. Hydrate Lucide SVG icons
  lucide.createIcons();

  // 5. Drawer overlay triggers
  document.getElementById('openHistoryBtn').onclick = () => openDrawer('history');
  document.getElementById('closeHistoryBtn').onclick = () => closeDrawer('history');
  document.getElementById('historyOverlay').onclick = () => closeDrawer('history');

  document.getElementById('openMailerBtn').onclick = () => openDrawer('mailer');
  document.getElementById('closeMailerBtn').onclick = () => closeDrawer('mailer');
  document.getElementById('mailerOverlay').onclick = () => closeDrawer('mailer');

  // 6. Action: Generate New Email Address
  document.getElementById('generateEmailBtn').onclick = async () => {
    const prefixInput = document.getElementById('customPrefixInput');
    const domainSelect = document.getElementById('domainSelect');
    
    const newAcc = await createAccount(prefixInput.value, domainSelect.value);
    if (newAcc) {
      prefixInput.value = '';
    }
  };

  // Action: Randomize Prefix Generator Helper
  document.getElementById('randomizePrefixBtn').onclick = () => {
    const randomPrefix = generateRandomPrefix();
    document.getElementById('customPrefixInput').value = randomPrefix;
    showToast(`Prefix generated: ${randomPrefix}`);
  };

  // Action: Refresh manually
  document.getElementById('refreshBtn').onclick = () => {
    if (state.activeAccount) {
      fetchInbox();
      showToast('Inbox refreshed');
      
      // Add animate class to rotate manually
      const icon = document.querySelector('#refreshBtn i');
      if (icon) {
        icon.style.transform = 'rotate(360deg)';
        icon.style.transition = 'transform 0.5s ease-in-out';
        setTimeout(() => {
          icon.style.transform = 'none';
          icon.style.transition = 'none';
        }, 500);
      }
    }
  };

  // Action: Copy active email widget
  document.getElementById('copyEmailBtn').onclick = () => {
    if (state.activeAccount) {
      copyAddressToClipboard(state.activeAccount.address);
    }
  };

  // Action: Viewer Tab Toggles
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      const tabName = btn.getAttribute('data-tab');
      switchViewerTab(tabName);
    };
  });

  // Action: Preset triggers fill
  document.getElementById('presetGoogle').onclick = () => fillMockPreset('google');
  document.getElementById('presetGithub').onclick = () => fillMockPreset('github');
  document.getElementById('presetNetflix').onclick = () => fillMockPreset('netflix');

  // Action: Submit Mock Mailer
  document.getElementById('mockMailerForm').onsubmit = (e) => {
    e.preventDefault();
    
    const fromVal = document.getElementById('mockFrom').value;
    const nameVal = document.getElementById('mockSenderName').value;
    const subjectVal = document.getElementById('mockSubject').value;
    const bodyVal = document.getElementById('mockBody').value;

    injectSimulatedEmail({
      fromAddress: fromVal,
      fromName: nameVal,
      subject: subjectVal,
      text: bodyVal.replace(/<[^>]+>/g, ' '),
      html: bodyVal
    });
  };
});
