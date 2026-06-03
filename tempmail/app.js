// ==========================================
// STATE MANAGEMENT & CONSTANTS
// ==========================================
const API_BASE = '/api/mail';

const state = {
  accounts: [],        // Array of { address, username, domain, createdAt }
  activeAccount: null, // Current active account object
  messages: [],        // Messages list for the active account
  selectedMessage: null,
  domains: ['1secmail.com', '1secmail.org', '1secmail.net', 'maildrop.cc'],
  pollingInterval: null,
  isPolling: false
};

// ==========================================
// CYBERPUNK CONSOLE LOGGER (FUTURISTIC LOGS!)
// ==========================================
function writeConsoleLog(text) {
  const consoleEl = document.getElementById('consoleLogText');
  if (!consoleEl) return;

  // Simulate cyberpunk console typing effect
  let i = 0;
  consoleEl.textContent = '';
  
  function typeChar() {
    if (i < text.length) {
      consoleEl.textContent += text.charAt(i);
      i++;
      setTimeout(typeChar, 18);
    }
  }
  
  typeChar();
}

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
    
    // Futuristic high-tech glass chime: Double-chime in high scale
    osc.type = 'sine';
    osc.frequency.setValueAtTime(783.99, now);     // G5
    osc.frequency.setValueAtTime(1046.50, now + 0.08); // C6
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    
    osc.start(now);
    osc.stop(now + 0.45);
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
    const detectedCode = matches[0];
    otpValue.textContent = detectedCode;
    otpBanner.style.display = 'flex';
    
    // Write console log alert
    writeConsoleLog(`> WARNING: UNCRYPTED CREDENTIAL IDENTIFIED // ACCESS_KEY: ${detectedCode} // READY TO EXPORT.`);
    
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
// API REST ACTIONS (STATELESS 1SECMAIL PROXY CLIENT)
// ==========================================

// Safe JSON parser helper
async function safeParseJSON(response) {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch (e) {
    console.warn('[Parser] Failed to parse JSON response safely:', e);
    return {};
  }
}

// Create new 1secmail account (stateless creation)
async function createAccount(prefix = '', domain = '') {
  writeConsoleLog(`> INITIALIZING SPAWN STREAM ON NODE-12...`);
  
  try {
    const selectDomain = domain || state.domains[0];
    let address = '';
    let username = '';

    if (prefix) {
      username = prefix.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      address = `${username}@${selectDomain}`;
    } else {
      // Use 1secmail stateless generator proxy
      const res = await fetch(`${API_BASE}?action=gen`);
      if (!res.ok) throw new Error('Proxy server failed to generate email addresses');
      
      const addresses = await safeParseJSON(res);
      if (addresses && addresses.length > 0) {
        address = addresses[0];
        const parts = address.split('@');
        username = parts[0];
        domain = parts[1];
      } else {
        username = generateRandomPrefix();
        address = `${username}@${selectDomain}`;
      }
    }

    const cleanDomain = domain || selectDomain;
    const newAcc = { address, username, domain: cleanDomain, createdAt: new Date().toISOString() };
    
    state.accounts.unshift(newAcc);
    saveAccountsToCache();
    setActiveAccount(newAcc);
    
    writeConsoleLog(`> NODE ONLINE // ADDRESS: ${address} // STREAM CHANNEL ESTABLISHED.`);
    showToast(`Created email: ${address}`);
    return newAcc;
  } catch (err) {
    showToast(err.message, 'error');
    console.error(err);
    writeConsoleLog(`> ERROR: NODE SPIN FAIL // LOG: ${err.message}`);
  }
}

// Fetch messages list
async function fetchInbox(isBackground = false) {
  if (!state.activeAccount) return;
  
  if (!isBackground) {
    writeConsoleLog(`> STREAM SYNC IN PROCESS // CHECKING DATA PACKETS ON ${state.activeAccount.address}...`);
  }

  try {
    const res = await fetch(`${API_BASE}?action=getMessages&login=${encodeURIComponent(state.activeAccount.username)}&domain=${encodeURIComponent(state.activeAccount.domain)}`);

    if (!res.ok) throw new Error('Stream sync failed');

    const serverMails = await safeParseJSON(res) || [];
    
    // Check if new emails arrived (Trigger chime synth!)
    if (isBackground && serverMails.length > state.messages.length) {
      playNotificationChime();
      const diff = serverMails.length - state.messages.length;
      showToast(`Received ${diff} new email(s)!`);
      writeConsoleLog(`> STREAM INGEST // RECEIVED ${diff} NEW DATA PACKET(S).`);
    } else if (!isBackground) {
      writeConsoleLog(`> SYNC SUCCESS // ${serverMails.length} INCOMING PACKETS DETECTED.`);
    }

    state.messages = serverMails;
    renderInboxList();
  } catch (err) {
    console.error('Polling failed:', err);
    writeConsoleLog(`> ERROR // POLLING STREAM UNRELIABLE // LINK LOSS.`);
  }
}

// Fetch single message details
async function fetchMessageDetails(msgId) {
  if (!state.activeAccount) return;

  writeConsoleLog(`> DECRYPTING PACKET STREAM ID: ${msgId}...`);

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
    const res = await fetch(`${API_BASE}?action=readMessage&login=${encodeURIComponent(state.activeAccount.username)}&domain=${encodeURIComponent(state.activeAccount.domain)}&id=${encodeURIComponent(msgId)}`);

    if (!res.ok) throw new Error('Packet decryption crashed');

    const mailData = await safeParseJSON(res);
    
    // Standardize 1secmail layout response structure to match the viewer
    state.selectedMessage = {
      id: mailData.id,
      from: { address: mailData.from, name: parseSenderName(mailData.from) },
      to: state.activeAccount.address,
      subject: mailData.subject || '(No Subject)',
      text: mailData.textBody || '',
      html: [mailData.htmlBody || mailData.textBody || ''],
      date: mailData.date,
      createdAt: mailData.date
    };

    // Update read state in UI
    const localMail = state.messages.find(m => m.id === msgId);
    if (localMail) localMail.seen = true;
    renderInboxList();

    renderMessageBody();
    writeConsoleLog(`> DECRYPTION COMPLETE // PACKET PARSED SUCCESSFULLY // HTML ENGINE ENGAGED.`);
  } catch (err) {
    showToast(err.message, 'error');
    writeConsoleLog(`> DECRYPT ERROR: PACKET CORRUPTED // LOG: ${err.message}`);
  }
}

// Simulated local mock email injector (Since Vercel is a static page host)
function injectSimulatedEmail(payload) {
  if (!state.activeAccount) return;

  // Create message in 1secmail structure
  const mockMsg = {
    id: 'mock_' + Math.random().toString(36).substring(2, 11),
    from: { address: payload.fromAddress, name: payload.fromName || 'Sender' },
    to: state.activeAccount.address,
    subject: payload.subject,
    text: payload.text,
    html: [payload.html || payload.text],
    createdAt: new Date().toISOString(),
    seen: false
  };

  playNotificationChime();
  state.messages.unshift(mockMsg);
  renderInboxList();
  
  writeConsoleLog(`> INJECT SUCCESS // MOCK PACKET FLOODED ON ${state.activeAccount.address}.`);
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
        <div class="empty-icon"><i data-lucide="shield-alert"></i></div>
        <h3>INBOX VOID</h3>
        <p class="monospace-hint">> WAITING FOR INCOMING DATA TRANSMISSIONS ON PORT 443...</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = state.messages.map(mail => {
    const isSelected = state.selectedMessage && state.selectedMessage.id === mail.id;
    const isUnread = !mail.seen;
    const dateStr = mail.date || formatDateTime(new Date());

    return `
      <div class="mail-item ${isSelected ? 'active' : ''} ${isUnread ? 'unread' : ''}" onclick="selectMail('${mail.id}')">
        <div class="mail-item-header">
          <span class="mail-sender-name">${escapeHTML(mail.from.name || mail.from.address || mail.from)}</span>
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
  document.getElementById('viewDate').textContent = msg.createdAt || msg.date;
  document.getElementById('viewSenderName').textContent = msg.from.name || 'Transmitter';
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

  document.getElementById('historyCount').textContent = `${state.accounts.length} NODES`;
  document.getElementById('accountCountBadge').textContent = state.accounts.length;

  if (state.accounts.length === 0) {
    container.innerHTML = `<p class="form-hint" style="text-align: center; padding: 20px 0;">No active nodes created yet.</p>`;
    return;
  }

  container.innerHTML = state.accounts.map(acc => {
    const isActive = state.activeAccount && state.activeAccount.address === acc.address;
    const dateStr = new Date(acc.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return `
      <div class="history-card ${isActive ? 'active' : ''}">
        <div class="history-card-info" onclick="switchActiveEmail('${acc.address}')">
          <span class="history-email">${acc.address}</span>
          <span class="history-date">Spawned on ${dateStr}</span>
        </div>
        <div class="history-actions-row">
          <button class="icon-btn tooltip" data-tooltip="Copy Node Address" onclick="copyAddressToClipboard('${acc.address}')">
            <i data-lucide="copy"></i>
          </button>
          <button class="icon-btn tooltip" data-tooltip="Decommission Node" style="color: var(--neon-hot-pink)" onclick="deleteAccountFromCache('${acc.address}')">
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

// Open active decrypted email content in a new browser tab/window (styled in cyberpunk theme)
function openEmailInNewTab() {
  if (!state.selectedMessage) {
    showToast('No email packet selected', 'error');
    return;
  }
  const msg = state.selectedMessage;
  const textBody = msg.text || '';
  const htmlBody = (msg.html && msg.html.length > 0) ? msg.html[0] : '';
  const cleanHtml = htmlBody || textBody.replace(/\n/g, '<br>');
  const senderStr = msg.from ? (msg.from.name ? `${msg.from.name} <${msg.from.address}>` : msg.from.address) : 'Unknown';
  
  const newWindow = window.open();
  if (newWindow) {
    newWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${msg.subject || 'Decrypted Packet'}</title>
          <style>
              body {
                  font-family: monospace;
                  background-color: #060913;
                  color: #00ffcc;
                  padding: 30px 15px;
                  margin: 0;
                  line-height: 1.6;
              }
              .container {
                  max-width: 700px;
                  margin: 0 auto;
                  border: 1px solid #00ffcc;
                  box-shadow: 0 0 15px rgba(0, 255, 204, 0.2);
                  padding: 25px;
                  background-color: #0a0f1d;
                  border-radius: 8px;
              }
              .header {
                  border-bottom: 1px dashed #00ffcc;
                  margin-bottom: 25px;
                  padding-bottom: 20px;
              }
              .title {
                  font-size: 20px;
                  font-weight: bold;
                  color: #ff0055;
                  margin: 0 0 10px 0;
                  text-shadow: 0 0 5px rgba(255, 0, 85, 0.5);
              }
              .meta {
                  font-size: 13px;
                  color: #8899ac;
                  line-height: 1.8;
              }
              .body {
                  color: #e2e8f0;
                  background: #0d1527;
                  padding: 20px;
                  border: 1px solid #1f2d4d;
                  border-radius: 4px;
                  word-break: break-word;
              }
              a { color: #00ffcc; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <div class="title">> ${msg.subject || '(No Subject)'}</div>
                  <div class="meta">
                      <strong>SOURCE TRANSMITTER:</strong> ${senderStr}<br>
                      <strong>TIMESTAMP RECEIPT:</strong> ${msg.date || ''}
                  </div>
              </div>
              <div class="body">
                  ${cleanHtml}
              </div>
          </div>
      </body>
      </html>
    `);
    newWindow.document.close();
  } else {
    showToast('Popup blocker active. Please allow popups.', 'error');
  }
}

function switchActiveEmail(address) {
  const targetAcc = state.accounts.find(a => a.address === address);
  if (targetAcc) {
    setActiveAccount(targetAcc);
    showToast(`Switched stream to: ${address}`);
    writeConsoleLog(`> STREAM TERMINAL LINK BOUND TO: ${address}.`);
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
  if (confirm(`Are you sure you want to decommission node: ${address}? You will lose all messages in this stream.`)) {
    state.accounts = state.accounts.filter(a => a.address !== address);
    saveAccountsToCache();
    
    if (state.activeAccount && state.activeAccount.address === address) {
      setActiveAccount(state.accounts.length > 0 ? state.accounts[0] : null);
    } else {
      renderAccountHistory();
    }
    
    showToast('Node decommissioned');
    writeConsoleLog(`> NODE ${address} DECOMMISSIONED AND DETACHED.`);
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
  localStorage.setItem('tempmail_accounts_v3_1secmail', JSON.stringify(state.accounts));
}

function loadAccountsFromCache() {
  const cached = localStorage.getItem('tempmail_accounts_v3_1secmail');
  if (cached) {
    try {
      state.accounts = JSON.parse(cached);
    } catch (e) {
      state.accounts = [];
    }
  }
}

// Generate random username prefixes
function generateRandomPrefix() {
  const words = ['swift', 'hyper', 'neon', 'glitch', 'retro', 'cyber', 'cosmic', 'sonic', 'nexus', 'pixel', 'rider', 'wave', 'ghost', 'shadow', 'matrix'];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000); // 4-digit unique
  return `${w1}.${w2}${num}`;
}

// Parse sender names from email address
function parseSenderName(senderStr) {
  if (!senderStr) return 'Sender';
  const match = senderStr.match(/^(.*?)\s*<([^>]+)>/);
  if (match) return match[1].replace(/['"]/g, '').trim();
  const atIdx = senderStr.indexOf('@');
  return atIdx !== -1 ? senderStr.substring(0, atIdx) : senderStr;
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

  // 2. Set Active account or auto generate initial temp email instantly
  if (state.accounts.length > 0) {
    setActiveAccount(state.accounts[0]);
  } else {
    // Generate initial account to welcome the user instantly!
    await createAccount();
  }

  // 3. Hydrate Lucide SVG icons
  lucide.createIcons();

  // 4. Drawer overlay triggers
  document.getElementById('openHistoryBtn').onclick = () => openDrawer('history');
  document.getElementById('closeHistoryBtn').onclick = () => closeDrawer('history');
  document.getElementById('historyOverlay').onclick = () => closeDrawer('history');

  document.getElementById('openMailerBtn').onclick = () => openDrawer('mailer');
  document.getElementById('closeMailerBtn').onclick = () => closeDrawer('mailer');
  document.getElementById('mailerOverlay').onclick = () => closeDrawer('mailer');

  // 5. Action: Generate New Email Address
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
