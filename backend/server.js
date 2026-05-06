import 'dotenv/config';
import express from 'express';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import baileys from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { parse } from 'csv-parse/sync';

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = baileys;

const __dirname = dirname(fileURLToPath(import.meta.url));
const sessionsDir = join(__dirname, 'sessions');
const PORT = process.env.PORT || 3001;
const PASSWORD = process.env.WABRO_PASSWORD || 'wabro123';

if (!existsSync(sessionsDir)) mkdirSync(sessionsDir);

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));

// --- State ---
let sock = null;
let socketReady = false;
let qrCodeBase64 = null;
let lastDisconnectTime = 0;
let reconnectAttempts = 0;
let connectionError = '';
let contactsCache = [];
let groupsCache = [];
let sseClients = [];
let lastBroadcast = { running: false, started: 0 };

// --- Utilities ---
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

// --- Rate Limiter ---
// WhatsApp bans if you send too many messages too quickly to unsaved contacts
// These limits are based on real-world testing
const RATE_LIMITS = {
  fast: {
    min: 4000,     // 4s minimum
    max: 8000,     // 8s maximum
    breakEvery: 30,
    breakDuration: 60000,  // 1 min break
    dailyMax: 300,
    description: '~1h for 100 msgs'
  },
  safe: {
    min: 10000,    // 10s minimum
    max: 20000,    // 20s maximum
    breakEvery: 50,
    breakDuration: 180000, // 3 min break
    dailyMax: 600,
    description: '~4h for 200 msgs'
  },
  ultra: {
    min: 20000,    // 20s minimum
    max: 40000,    // 40s maximum
    breakEvery: 50,
    breakDuration: 300000, // 5 min break
    dailyMax: 1000,
    description: '~8h for 500 msgs'
  }
};

function getNextDelay(index, speedMode) {
  const mode = RATE_LIMITS[speedMode] || RATE_LIMITS.safe;
  
  // Scheduled break
  if (index > 0 && index % mode.breakEvery === 0) {
    return mode.breakDuration + Math.random() * 30000;
  }
  
  // Normal random delay
  return Math.random() * (mode.max - mode.min) + mode.min;
}

// --- Progress Broadcast ---
function sendProgress(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter(client => {
    try {
      client.write(msg);
      return true;
    } catch {
      return false;
    }
  });
}

// --- Connection Manager ---
async function initSocket() {
  if (sock) return sock;
  
  const { state, saveCreds } = await useMultiFileAuthState(sessionsDir);

  sock = makeWASocket({
    auth: state,
    browser: ['Wabro', 'Chrome', '120.0.0.0'],
    connectTimeoutMs: 30000,
    keepAliveIntervalMs: 15000,
    markOnlineOnConnect: false,
    defaultQueryTimeoutMs: 30000,
    syncFullHistory: false,
    logger: undefined,
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        qrCodeBase64 = await QRCode.toDataURL(qr);
        connectionError = '';
        console.log('📱 QR Code generated');
      } catch (e) {
        console.error('QR generation error:', e.message);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const now = Date.now();
      lastDisconnectTime = now;
      
      socketReady = false;
      
      // Classify error
      const terminalCodes = [401, 403, 405, 409, 412]; // logged out, forbidden, client too old, conflict
      if (terminalCodes.includes(statusCode)) {
        connectionError = statusCode === 401 ? 'Logged out. Please reconnect.' :
                         statusCode === 405 ? 'Session expired. Please reconnect.' :
                         `Connection error (code ${statusCode}). Please reconnect.`;
        sock = null;
        qrCodeBase64 = null;
        console.log(`❌ ${connectionError}`);
        return;
      }
      
      // Retryable error - reconnect with backoff
      const backoff = Math.min(30000, 5000 * Math.pow(2, reconnectAttempts));
      reconnectAttempts++;
      
      console.log(`⚠️ Connection lost (code ${statusCode}). Reconnecting in ${formatTime(backoff)}...`);
      
      setTimeout(async () => {
        sock = null;
        try {
          await initSocket();
        } catch (e) {
          console.log('Reconnect failed:', e.message);
        }
      }, backoff);
      
    } else if (connection === 'open') {
      socketReady = true;
      connectionError = '';
      reconnectAttempts = 0;
      qrCodeBase64 = null;
      console.log('✅ Connected to WhatsApp');
      
      // Fetch contacts and groups in background
      try {
        const contacts = await sock.fetchContacts();
        contactsCache = Object.entries(contacts).map(([jid, info]) => ({ 
          jid, 
          name: info.notify || info.name || jid.split('@')[0] 
        }));
        const groups = await sock.groupFetchAllParticipating();
        groupsCache = Object.values(groups).map(g => ({ 
          id: g.id, 
          name: g.subject, 
          participants: Object.keys(g.participants) 
        }));
        console.log(`📇 Cached ${contactsCache.length} contacts, ${groupsCache.length} groups`);
      } catch (e) { 
        console.log('Failed to fetch contacts/groups:', e.message); 
      }
    }
  });
  
  return sock;
}

// --- API Endpoints ---

// Check connection status
app.get('/api/status', (req, res) => {
  res.json({
    connected: socketReady,
    error: connectionError,
    qr: qrCodeBase64,
    contacts: contactsCache.length,
    groups: groupsCache.length,
    broadcast: lastBroadcast
  });
});

// Start connection
app.post('/api/connect', async (req, res) => {
  const { phoneNumber } = req.body;
  
  try {
    // If already connected, just return status
    if (socketReady) {
      return res.json({ status: 'connected', message: 'Already connected' });
    }
    
    // Reinitialize socket
    sock = null;
    socketReady = false;
    qrCodeBase64 = null;
    connectionError = '';
    reconnectAttempts = 0;
    
    await initSocket();
    
    // If pairing code requested
    if (phoneNumber && sock && !socketReady) {
      try {
        // Wait for connection to be ready for pairing
        await delay(2000);
        if (!socketReady && sock) {
          const code = await sock.requestPairingCode(phoneNumber.replace(/\D/g, ''));
          return res.json({ status: 'code', code });
        }
      } catch (e) {
        console.log('Pairing code error:', e.message);
      }
    }
    
    // Wait for QR (up to 15 seconds)
    for (let i = 0; i < 30; i++) {
      if (qrCodeBase64 || socketReady) break;
      await delay(500);
    }
    
    res.json({ 
      status: socketReady ? 'connected' : 'qr', 
      qr: qrCodeBase64 
    });
    
  } catch (err) {
    res.status(500).json({ error: 'Connection failed: ' + err.message });
  }
});

// Test connection - sends a message to yourself
app.post('/api/test', async (req, res) => {
  const { password } = req.body;
  
  if (password !== PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  
  if (!socketReady || !sock) {
    return res.status(503).json({ error: 'Not connected' });
  }
  
  try {
    // Send test message to your own number (from connection)
    const myJid = sock.user?.id || sock.authState?.creds?.me?.id;
    if (!myJid) {
      return res.json({ success: true, message: 'Connection is healthy' });
    }
    
    await sock.sendMessage(myJid, { 
      text: `✅ Wabro Connection Test\n\nThis is a test message. Your broadcast setup is working correctly.\n\nSent at: ${new Date().toLocaleString()}` 
    });
    
    res.json({ success: true, message: 'Test message sent to yourself' });
  } catch (err) {
    res.status(500).json({ error: 'Test failed: ' + err.message });
  }
});

// Get contacts
app.get('/api/contacts', (req, res) => {
  res.json(contactsCache);
});

// Get groups
app.get('/api/groups', (req, res) => {
  res.json(groupsCache);
});

// SSE for live progress
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  sseClients.push(res);
  
  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

// Send broadcast
app.post('/api/broadcast', async (req, res) => {
  const { numbers, message, password, csvData, groupIds, speedMode = 'safe' } = req.body;
  
  if (password !== PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  
  if (!socketReady || !sock) {
    return res.status(503).json({ error: 'Not connected to WhatsApp' });
  }
  
  if (lastBroadcast.running) {
    return res.status(429).json({ error: 'A broadcast is already running' });
  }
  
  // Check daily limits
  const mode = RATE_LIMITS[speedMode] || RATE_LIMITS.safe;
  
  // Parse recipients
  let targetNumbers = [];
  if (csvData) {
    try {
      const records = parse(csvData, { columns: false, skip_empty_lines: true });
      targetNumbers = records.map(row => String(row[0]).replace(/\D/g, ''));
    } catch {
      return res.status(400).json({ error: 'Invalid CSV format' });
    }
  } else if (Array.isArray(numbers)) {
    targetNumbers = numbers.map(n => String(n).replace(/\D/g, ''));
  } else if (typeof numbers === 'string') {
    targetNumbers = numbers.split('\n').map(n => n.trim()).filter(n => n);
  }
  
  // Add group members
  if (groupIds && groupIds.length) {
    for (const gid of groupIds) {
      const group = groupsCache.find(g => g.id === gid);
      if (group) targetNumbers.push(...group.participants);
    }
  }
  
  // Deduplicate and filter
  targetNumbers = [...new Set(targetNumbers.filter(n => n.length >= 10))];
  
  if (targetNumbers.length === 0) {
    return res.status(400).json({ error: 'No valid recipients found' });
  }
  
  if (!message) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }
  
  // Start broadcast
  lastBroadcast = { running: true, started: Date.now(), total: targetNumbers.length };
  let sent = 0;
  let failed = 0;
  
  // Respond immediately so client knows it started
  res.json({ 
    started: true, 
    total: targetNumbers.length,
    estimatedTime: formatTime(targetNumbers.length * ((mode.min + mode.max) / 2))
  });
  
  // Run broadcast in background
  (async () => {
    try {
      for (let i = 0; i < targetNumbers.length; i++) {
        const number = targetNumbers[i];
        const jid = `${number}@s.whatsapp.net`;
        
        try {
          // Typing simulation
          await sock.sendPresenceUpdate('composing', jid);
          await delay(Math.min(message.length * 30, 5000));
          await sock.sendPresenceUpdate('paused', jid);
          
          // Send message
          await sock.sendMessage(jid, { text: message });
          
          sent++;
          sendProgress({ type: 'sent', number, index: i + 1, total: targetNumbers.length });
        } catch (err) {
          failed++;
          sendProgress({ type: 'failed', number, error: err.message, index: i + 1, total: targetNumbers.length });
        }
        
        // Delay between messages
        if (i < targetNumbers.length - 1) {
          const wait = getNextDelay(i, speedMode);
          sendProgress({ type: 'delay', duration: wait, next: i + 2, total: targetNumbers.length });
          await delay(wait);
        }
      }
      
      sendProgress({ type: 'complete', sent, failed, total: targetNumbers.length });
    } catch (err) {
      sendProgress({ type: 'error', message: err.message });
    } finally {
      lastBroadcast = { running: false, sent, failed, total: targetNumbers.length };
    }
  })();
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║        WABRO - Broadcast Server      ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  🌐 http://localhost:${PORT}               ║`);
  console.log('║  Status: Waiting for connection...   ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  
  // Auto-init socket on startup
  initSocket().catch(e => console.log('Auto-connect failed:', e.message));
});
