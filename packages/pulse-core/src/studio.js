import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { formatReviewRecords, formatSummaryRecords, parseReviewArgs, summarizeRecords } from './reviewReport.js';
import { isBunAvailable } from './runtime.js';
import { enqueueReply, initializeStorage, listMessages, listReplies, createUser, validateUser, getUserSettings, saveUserSettings, getUserById, enqueueScheduledReply, listScheduledReplies, cancelScheduledReply, claimDueScheduledReplies } from './storage.js';
import { buildAgentContext } from './utils.js';
import { listModels, generateResponse } from './agent.js';
import { routeAgentQuery } from './agentQuery.js';
import { computeInsights } from './insights.js';
import { connectToWhatsApp } from './whatsapp.js';
import { fetchElevenLabs, formatRecordForSpeech, formatBriefingForSpeech, speedToVoiceSettings } from './voice.js';
import pino from 'pino';

let whatsappState = 'disconnected';
let whatsappQr = null;
let whatsappError = null;
let whatsappProcess = null;

let voiceSettings = {
  enabled: false,
  autoReadListings: true,
  autoReadRequirements: true,
  briefingEnabled: false,
  speed: 'normal',
  volume: 1.0,
};

const voiceClients = new Set();

const authTokens = new Map();

function generateToken() {
  return randomBytes(32).toString('hex');
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function broadcastVoiceEvent(event, data) {
  const payload = JSON.stringify({ event, data, timestamp: Date.now() });
  for (const res of voiceClients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch {
      voiceClients.delete(res);
    }
  }
}

async function startWhatsAppListener() {
  if (whatsappProcess) {
    return { success: false, error: 'Already running' };
  }

  whatsappState = 'starting';
  broadcastWhatsAppState();

  try {
    const runtime = isBunAvailable() ? 'bun' : 'node';
    const cmd = runtime === 'bun' ? 'bun' : 'node';
    const args = runtime === 'bun' ? ['src/index.js'] : ['src/index.js'];

    whatsappProcess = spawn(cmd, args, {
      cwd: ROOT_DIR,
      shell: false,
      windowsHide: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    whatsappProcess.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (text.includes('QR:')) {
        const qrMatch = text.match(/QR:([^\n]+)/);
        if (qrMatch) {
          whatsappQr = qrMatch[1];
          whatsappState = 'qr_available';
          broadcastWhatsAppState();
        }
      }
      if (text.includes('connected') || text.includes('listening') || text.includes('PropAI Pulse connected')) {
        whatsappState = 'connected';
        whatsappQr = null;
        broadcastWhatsAppState();
      }
      process.stdout.write(text);
    });

    whatsappProcess.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      process.stderr.write(text);
      if (text.includes('error') || text.includes('Error')) {
        whatsappError = text.slice(0, 200);
      }
    });

    whatsappProcess.on('error', (error) => {
      whatsappState = 'error';
      whatsappError = error.message;
      whatsappProcess = null;
      broadcastWhatsAppState();
    });

    whatsappProcess.on('close', (code) => {
      if (whatsappState === 'connected' || whatsappState === 'starting') {
        whatsappState = 'disconnected';
      }
      whatsappProcess = null;
      broadcastWhatsAppState();
    });

    return { success: true };
  } catch (error) {
    whatsappState = 'error';
    whatsappError = error.message;
    broadcastWhatsAppState();
    return { success: false, error: error.message };
  }
}

const clients = new Set();

function broadcastWhatsAppState() {
  const payload = JSON.stringify({ state: whatsappState, qr: whatsappQr, error: whatsappError });
  for (const res of clients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}

async function handleWhatsAppSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  res.write(`data: ${JSON.stringify({ state: whatsappState, qr: whatsappQr, error: whatsappError })}\n\n`);
  clients.add(res);

  req.on('close', () => {
    clients.delete(res);
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PORT = Number(process.env.STUDIO_PORT || 4317);

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

const COMMANDS = new Set(['pulse summary', 'pulse review', 'pulse errors', 'pulse test']);

function sendJson(res, payload, statusCode = 200) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, body, statusCode = 200, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function parseLimit(url, fallback = 100) {
  const value = Number(url.searchParams.get('limit') || fallback);
  if (!Number.isFinite(value) || value < 1) {
    return fallback;
  }

  return Math.min(Math.floor(value), 500);
}

async function getRecords(url) {
  const status = url.searchParams.has('status') ? url.searchParams.get('status') || null : null;
  return listMessages({
    status,
    limit: parseLimit(url),
  });
}

async function buildDashboardPayload(url) {
  const reviewStatus = url.searchParams.has('status')
    ? url.searchParams.get('status') || null
    : 'needs_review';
  const metricLimit = parseLimit(url, 500);
  const reviewLimit = Math.min(parseLimit(url, 25), 25);
  const replyLimit = Math.min(parseLimit(url, 12), 50);

  const [metricRecords, reviewRecords, replies] = await Promise.all([
    listMessages({ status: null, limit: metricLimit }),
    listMessages({ status: reviewStatus, limit: reviewLimit }),
    listReplies({ status: null, limit: replyLimit }),
  ]);

  return {
    summary: summarizeRecords(metricRecords),
    review: reviewRecords,
    groups: formatGroupSummary(metricRecords),
    replies,
  };
}

async function executeCommand(key) {
  if (key === 'pulse summary') {
    const options = parseReviewArgs(['--all', '--limit', '100']);
    const records = await listMessages({
      status: options.status,
      limit: options.limit,
    });

    return {
      exitCode: 0,
      output: formatSummaryRecords(records, options.format),
    };
  }

  if (key === 'pulse review') {
    const options = parseReviewArgs(['--limit', '25']);
    const records = await listMessages({
      status: options.status,
      limit: options.limit,
    });

    return {
      exitCode: 0,
      output: formatReviewRecords(records, options.format),
    };
  }

  if (key === 'pulse errors') {
    const options = parseReviewArgs(['--status', 'extraction_error', '--limit', '25']);
    const records = await listMessages({
      status: options.status,
      limit: options.limit,
    });

    return {
      exitCode: 0,
      output: formatReviewRecords(records, options.format),
    };
  }

  if (key === 'pulse test') {
    return runCommand(
      isBunAvailable() ? 'bun' : process.platform === 'win32' ? 'npm.cmd' : 'npm',
      isBunAvailable() ? ['test'] : ['test'],
    );
  }

  return {
    exitCode: 1,
    output: 'Unknown command',
  };
}

async function handleApi(req, res, url) {

  // ─── AUTH ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readRequestJson(req);
    const { email, password, name } = body || {};
    if (!email || !password) {
      sendJson(res, { error: 'Email and password required' }, 400);
      return;
    }
    if (password.length < 6) {
      sendJson(res, { error: 'Password must be at least 6 characters' }, 400);
      return;
    }
    const result = await createUser(email, password, name || '');
    if (!result.success) {
      sendJson(res, { error: result.error }, 400);
      return;
    }
    const token = generateToken();
    authTokens.set(hashToken(token), { userId: result.userId.toString(), createdAt: Date.now() });
    sendJson(res, { token, user: { email, name: name || '' } });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readRequestJson(req);
    const { email, password } = body || {};
    if (!email || !password) {
      sendJson(res, { error: 'Email and password required' }, 400);
      return;
    }
    const user = await validateUser(email, password);
    if (!user) {
      sendJson(res, { error: 'Invalid email or password' }, 401);
      return;
    }
    const token = generateToken();
    authTokens.set(hashToken(token), { userId: user.id, createdAt: Date.now() });
    sendJson(res, { token, user: { email: user.email, name: user.name } });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) authTokens.delete(hashToken(token));
    sendJson(res, { success: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      sendJson(res, { authenticated: false });
      return;
    }
    const session = authTokens.get(hashToken(token));
    if (!session) {
      sendJson(res, { authenticated: false });
      return;
    }
    const user = await getUserById(session.userId);
    if (!user) {
      authTokens.delete(hashToken(token));
      sendJson(res, { authenticated: false });
      return;
    }
    sendJson(res, { authenticated: true, user: { email: user.email, name: user.name } });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/settings') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      sendJson(res, { error: 'Unauthorized' }, 401);
      return;
    }
    const session = authTokens.get(hashToken(token));
    if (!session) {
      sendJson(res, { error: 'Invalid token' }, 401);
      return;
    }
    const settings = await getUserSettings(session.userId);
    sendJson(res, settings || {});
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/settings') {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      sendJson(res, { error: 'Unauthorized' }, 401);
      return;
    }
    const session = authTokens.get(hashToken(token));
    if (!session) {
      sendJson(res, { error: 'Invalid token' }, 401);
      return;
    }
    const body = await readRequestJson(req);
    await saveUserSettings(session.userId, body);
    sendJson(res, { success: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/test') {
    const payload = await buildDashboardPayload(url);
    sendJson(res, payload);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/summary') {
    const records = await getRecords(url);
    sendJson(res, summarizeRecords(records));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/review') {
    const status = url.searchParams.has('status')
      ? url.searchParams.get('status') || null
      : 'needs_review';
    const records = await listMessages({
      status,
      limit: parseLimit(url, 25),
    });
    sendJson(res, records);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/groups') {
    const records = await getRecords(url);
    const summary = formatGroupSummary(records);
    sendJson(res, summary);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/listings') {
    const records = await getRecords(url);
    sendJson(res, records);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/agent-context') {
    const records = await getRecords(url);
    const context = buildAgentContext(records);
    sendJson(res, { context });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/models') {
    const models = await listModels();
    sendJson(res, { models });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/whatsapp') {
    sendJson(res, { state: whatsappState, qr: whatsappQr, error: whatsappError });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/whatsapp/connect') {
    const result = await startWhatsAppListener();
    sendJson(res, result, result.success ? 200 : 400);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/whatsapp/events') {
    await handleWhatsAppSSE(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/whatsapp/disconnect') {
    if (whatsappProcess) {
      whatsappProcess.kill();
      whatsappProcess = null;
    }
    whatsappState = 'disconnected';
    whatsappQr = null;
    whatsappError = null;
    broadcastWhatsAppState();
    sendJson(res, { success: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/voice/settings') {
    sendJson(res, voiceSettings);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/voice/settings') {
    const body = await readRequestJson(req);
    voiceSettings = {
      enabled: Boolean(body.enabled),
      autoReadListings: Boolean(body.autoReadListings),
      autoReadRequirements: Boolean(body.autoReadRequirements),
      briefingEnabled: Boolean(body.briefingEnabled),
      speed: ['slow', 'normal', 'fast'].includes(body.speed) ? body.speed : 'normal',
      volume: Number(body.volume) || 1.0,
    };
    sendJson(res, { success: true, settings: voiceSettings });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/voice/briefing') {
    try {
      const records = await listMessages({ limit: 1000 });
      const summary = records.length > 0 ? {
        total: records.length,
        needs_review: records.filter(r => r.status === 'needs_review').length,
      } : { total: 0, needs_review: 0 };
      const text = formatBriefingForSpeech(summary, records);
      const audioBuffer = await fetchElevenLabs(text, speedToVoiceSettings(voiceSettings.speed));
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length,
        'Cache-Control': 'no-cache',
      });
      res.end(audioBuffer);
    } catch (error) {
      sendJson(res, { error: error.message }, 500);
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/voice/speak') {
    const body = await readRequestJson(req);
    const text = String(body.text || '').trim();
    const speed = ['slow', 'normal', 'fast'].includes(body.speed) ? body.speed : 'normal';
    if (!text) {
      sendJson(res, { error: 'text is required' }, 400);
      return;
    }
    try {
      const settings = speedToVoiceSettings(speed);
      const audioBuffer = await fetchElevenLabs(text, settings);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length,
        'Cache-Control': 'no-cache',
      });
      res.end(audioBuffer);
    } catch (error) {
      sendJson(res, { error: error.message }, 500);
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/voice/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ event: 'connected', settings: voiceSettings, timestamp: Date.now() })}\n\n`);
    voiceClients.add(res);
    req.on('close', () => {
      voiceClients.delete(res);
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    const body = await readRequestJson(req);
    const model = String(body.model || '').trim();
    const message = String(body.message || '').trim();
    const context = String(body.context || '').trim();

    if (!model) {
      sendJson(res, { error: 'model is required' }, 400);
      return;
    }

    if (!message) {
      sendJson(res, { error: 'message is required' }, 400);
      return;
    }

    try {
      const response = await generateResponse(model, context, message);
      sendJson(res, { response });
    } catch (error) {
      sendJson(res, { error: error.message }, 500);
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/agent') {
    const body = await readRequestJson(req);
    const query = String(body.query || '').trim();
    if (!query) {
      sendJson(res, { error: 'query is required' }, 400);
      return;
    }
    try {
      const records = await listMessages({ limit: 500 });
      const result = await routeAgentQuery(query, records);
      sendJson(res, { result });
    } catch (error) {
      sendJson(res, { error: error.message }, 500);
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/insights') {
    const timeframe = url.searchParams.get('timeframe') || 'this_week';
    const records = await listMessages({ limit: 1000 });
    const insights = computeInsights(records, timeframe);
    sendJson(res, insights);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/replies') {
    const status = url.searchParams.has('status') ? url.searchParams.get('status') || null : null;
    const replies = await listReplies({
      status,
      limit: parseLimit(url, 25),
    });
    sendJson(res, replies);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/replies') {
    const body = await readRequestJson(req);
    const reply = await enqueueReply({
      groupId: body.groupId,
      groupName: body.groupName,
      sourceMessageId: body.sourceMessageId,
      sourceSenderNumber: body.sourceSenderNumber,
      text: body.text,
    });
    sendJson(res, reply, 201);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/scheduled') {
    const status = url.searchParams.has('status') ? url.searchParams.get('status') || null : null;
    const scheduled = await listScheduledReplies({
      status,
      limit: parseLimit(url, 50),
    });
    sendJson(res, scheduled);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/scheduled') {
    const body = await readRequestJson(req);
    const scheduled = await enqueueScheduledReply({
      groupId: body.groupId,
      groupName: body.groupName,
      text: body.text,
      scheduledFor: body.scheduledFor,
      sourceMessageId: body.sourceMessageId,
    });
    sendJson(res, scheduled, 201);
    return;
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/scheduled/') && url.pathname.endsWith('/cancel')) {
    const scheduledId = url.pathname.split('/')[3];
    const cancelled = await cancelScheduledReply(scheduledId);
    if (!cancelled) {
      sendJson(res, { error: 'Scheduled reply not found' }, 404);
      return;
    }
    sendJson(res, cancelled);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/scheduled/due') {
    const due = await claimDueScheduledReplies();
    sendJson(res, due);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/command') {
    const body = await readRequestJson(req);
    const key = String(body.command || '').trim();

    if (!COMMANDS.has(key)) {
      sendJson(res, { error: 'Unknown command' }, 400);
      return;
    }

    const result = await executeCommand(key);
    sendJson(res, result, result.exitCode === 0 ? 200 : 500);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, { status: 'ok', timestamp: new Date().toISOString() });
    return;
  }

  sendJson(res, { error: 'Not found' }, 404);
}

function formatGroupSummary(records) {
  const groups = new Map();

  for (const record of records) {
    const key = record.group_name || record.group_id || 'unknown';
    const current = groups.get(key) || {
      name: key,
      records: 0,
      entries: 0,
      contacts: 0,
      needs_review: 0,
      errors: 0,
      latest: null,
    };

    current.records += 1;
    current.entries += Array.isArray(record.entries) ? record.entries.length : 0;
    current.contacts += Array.isArray(record.contacts) && record.contacts.length > 0 ? 1 : 0;
    current.needs_review += record.status === 'needs_review' ? 1 : 0;
    current.errors += record.status === 'extraction_error' ? 1 : 0;
    current.latest = !current.latest || String(record.timestamp || '') > current.latest
      ? record.timestamp
      : current.latest;

    groups.set(key, current);
  }

  return [...groups.values()].sort((a, b) => b.records - a.records || a.name.localeCompare(b.name));
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      shell: false,
      windowsHide: true,
    });
    const chunks = [];

    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        output: error.message,
      });
    });
    child.on('close', (exitCode) => {
      resolve({
        exitCode,
        output: Buffer.concat(chunks).toString('utf8'),
      });
    });
  });
}

async function serveStatic(res, urlPath) {
  const normalizedPath = urlPath === '/' ? '/index.html' : urlPath;
  let relativePath = normalizedPath.replace(/^\//, '');
  let filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (normalizedPath.endsWith('/')) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 'Forbidden', 403);
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    const contentType = CONTENT_TYPES.get(path.extname(filePath)) || 'application/octet-stream';
    res.writeHead(200, { 'content-type': contentType });
    res.end(body);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendText(res, 'Not found', 404);
      return;
    }

    throw error;
  }
}

async function serveVendor(res, urlPath) {
  const vendorFiles = new Map([
    ['/vendor/xterm.js', path.join(ROOT_DIR, 'node_modules', '@xterm', 'xterm', 'lib', 'xterm.js')],
    ['/vendor/xterm.css', path.join(ROOT_DIR, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css')],
  ]);
  const filePath = vendorFiles.get(urlPath);

  if (!filePath) {
    sendText(res, 'Not found', 404);
    return;
  }

  const body = await fs.readFile(filePath);
  const contentType = CONTENT_TYPES.get(path.extname(filePath)) || 'application/octet-stream';
  res.writeHead(200, { 'content-type': contentType });
  res.end(body);
}

await initializeStorage();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    if (url.pathname.startsWith('/vendor/')) {
      await serveVendor(res, url.pathname);
      return;
    }

    if (url.pathname === '/' || url.pathname === '') {
      const pwaPath = path.resolve(ROOT_DIR, 'public', 'pwa', 'index.html');
      try {
        const body = await fs.readFile(pwaPath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(body);
      } catch (error) {
        if (error.code === 'ENOENT') {
          sendText(res, 'Not found', 404);
          return;
        }
        throw error;
      }
      return;
    }

    if (url.pathname === '/studio' || url.pathname === '/studio/') {
      const pwaPath = path.resolve(ROOT_DIR, 'public', 'pwa', 'index.html');
      if (!pwaPath.startsWith(path.resolve(ROOT_DIR, 'public'))) {
        sendText(res, 'Forbidden', 403);
        return;
      }
      try {
        const body = await fs.readFile(pwaPath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(body);
      } catch (error) {
        if (error.code === 'ENOENT') {
          sendText(res, 'Not found', 404);
          return;
        }
        throw error;
      }
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, { error: error.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`PropAI Pulse Studio running at http://localhost:${PORT}`);
});

export { formatGroupSummary };
