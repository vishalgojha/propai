import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import { createReplyRecord } from './replies.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'propulse.jsonl');
const REPLY_FILE = path.join(DATA_DIR, 'replies.jsonl');
const SCHEDULED_FILE = path.join(DATA_DIR, 'scheduled.jsonl');
const USERS_FILE = path.join(DATA_DIR, 'users.jsonl');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
let mongoFallback = false;

async function getSupabase() {
  if (!supabase && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      db: { schema: 'public' }
    });
  }
  return supabase;
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function initializeStorage() {
  await ensureDataDir();

  try {
    const sb = await getSupabase();
    if (!sb) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY not set');

    const { error } = await sb.from('whatsapp_messages').select('id').limit(1);
    if (error) throw error;
    console.log('Supabase connected: whatsapp_messages table');
    mongoFallback = false;
  } catch (error) {
    mongoFallback = true;
    supabase = null;
    console.warn(`Supabase unavailable, falling back to JSONL storage: ${error.message}`);
  }
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

export async function hasMessage(messageId) {
  if (!messageId) return false;

  if (!mongoFallback && supabase) {
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('message_id', messageId)
      .maybeSingle();
    return Boolean(data);
  }

  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return data.split('\n').filter(Boolean).some(line => {
      try { return JSON.parse(line).message_id === messageId; } catch { return false; }
    });
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function saveMessage(record) {
  if (!mongoFallback && supabase) {
    const { error } = await supabase
      .from('whatsapp_messages')
      .insert(record);
    if (error) {
      if (error.code === '23505') return false;
      throw error;
    }
    return true;
  }

  if (await hasMessage(record.message_id)) return false;
  const line = `${JSON.stringify(record)}\n`;
  await fs.appendFile(DATA_FILE, line, 'utf8');
  return true;
}

async function readJsonlRecords() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return data.split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function listMessages({ status = 'needs_review', limit = 25 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 500));

  if (!mongoFallback && supabase) {
    let query = supabase
      .from('whatsapp_messages')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(safeLimit);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  const records = await readJsonlRecords();
  return records
    .filter(r => !status || r.status === status)
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
    .slice(0, safeLimit);
}

// ─── REPLIES ──────────────────────────────────────────────────────────────────

async function appendReplySnapshot(record) {
  const line = `${JSON.stringify(record)}\n`;
  await fs.appendFile(REPLY_FILE, line, 'utf8');
}

async function readReplySnapshots() {
  try {
    const data = await fs.readFile(REPLY_FILE, 'utf8');
    return data.split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function listReplyStates() {
  const snapshots = await readReplySnapshots();
  const replies = new Map();
  for (const snapshot of snapshots) {
    if (!snapshot.reply_id) continue;
    replies.set(snapshot.reply_id, snapshot);
  }
  return [...replies.values()];
}

async function getReplyById(replyId) {
  if (!replyId) return null;
  if (!mongoFallback && supabase) {
    const { data } = await supabase
      .from('whatsapp_replies')
      .select('*')
      .eq('reply_id', replyId)
      .maybeSingle();
    return data;
  }
  const replies = await listReplyStates();
  return replies.find(r => r.reply_id === replyId) || null;
}

export async function enqueueReply(input) {
  const reply = createReplyRecord(input);
  if (!mongoFallback && supabase) {
    const { error } = await supabase.from('whatsapp_replies').insert(reply);
    if (error) throw error;
    return reply;
  }
  await appendReplySnapshot(reply);
  return reply;
}

export async function claimNextPendingReply() {
  const claimedAt = new Date().toISOString();

  if (!mongoFallback && supabase) {
    const { data, error } = await supabase
      .from('whatsapp_replies')
      .update({ status: 'sending', claimed_at: claimedAt, updated_at: claimedAt, error: null })
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .select()
      .single();
    if (error) throw error;
    return data || null;
  }

  const replies = await listReplyStates();
  const nextReply = replies.filter(r => r.status === 'pending')
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))[0];
  if (!nextReply) return null;
  return { ...nextReply, status: 'sending', claimed_at: claimedAt, updated_at: claimedAt, error: null };
}

export async function updateReply(replyId, updates) {
  const existing = await getReplyById(replyId);
  if (!existing) return null;
  const nextReply = { ...existing, ...updates, reply_id: existing.reply_id, updated_at: new Date().toISOString() };

  if (!mongoFallback && supabase) {
    const { error } = await supabase
      .from('whatsapp_replies')
      .update(nextReply)
      .eq('reply_id', replyId);
    if (error) throw error;
    return nextReply;
  }
  await appendReplySnapshot(nextReply);
  return nextReply;
}

export async function listReplies({ status = null, limit = 25 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 500));

  if (!mongoFallback && supabase) {
    let query = supabase.from('whatsapp_replies').select('*').order('created_at', { ascending: false }).limit(safeLimit);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  const replies = await listReplyStates();
  return replies
    .filter(r => !status || r.status === status)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, safeLimit);
}

// ─── USERS ───────────────────────────────────────────────────────────────────

async function hashPassword(password) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(password + 'pulse_salt_2024').digest('hex');
}

export async function createUser(email, password, name = '') {
  if (!mongoFallback && supabase) {
    const hashed = await hashPassword(password);
    const { data, error } = await supabase
      .from('pulse_users')
      .insert({
        email: email.toLowerCase().trim(),
        password: hashed,
        name: name.trim(),
        settings: {
          aiKey: '',
          aiProvider: '',
          voiceApiKey: '',
          voiceVoiceId: 'JPBXnM1EGM4hJz45K1rT',
          voiceSpeed: 'normal',
          voiceEnabled: false,
        }
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return { success: false, error: 'Email already exists' };
      throw error;
    }
    return { success: true, userId: data.id };
  }

  // JSONL fallback
  const { randomUUID } = await import('node:crypto');
  const hashed = await hashPassword(password);
  const userId = randomUUID();
  const newUser = {
    id: userId,
    email: email.toLowerCase().trim(),
    password: hashed,
    name: name.trim(),
    settings: { aiKey: '', aiProvider: '', voiceApiKey: '', voiceVoiceId: 'JPBXnM1EGM4hJz45K1rT', voiceSpeed: 'normal', voiceEnabled: false },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    const lines = data.split('\n').filter(Boolean);
    // Check if email exists
    for (const line of lines) {
      try {
        const user = JSON.parse(line);
        if (user.email === email.toLowerCase().trim()) {
          return { success: false, error: 'Email already exists' };
        }
      } catch {}
    }
    await fs.appendFile(USERS_FILE, JSON.stringify(newUser) + '\n', 'utf8');
    return { success: true, userId };
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(USERS_FILE, JSON.stringify(newUser) + '\n', 'utf8');
      return { success: true, userId };
    }
    return { success: false, error: error.message };
  }
}

export async function validateUser(email, password) {
  if (!mongoFallback && supabase) {
    const hashed = await hashPassword(password);
    const { data, error } = await supabase
      .from('pulse_users')
      .select('id, email, name')
      .eq('email', email.toLowerCase().trim())
      .eq('password', hashed)
      .maybeSingle();
    if (error || !data) return null;
    return { id: data.id, email: data.email, name: data.name };
  }

  // JSONL fallback
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    const lines = data.split('\n').filter(Boolean);
    const hashed = await hashPassword(password);
    for (const line of lines) {
      try {
        const user = JSON.parse(line);
        if (user.email === email.toLowerCase().trim() && user.password === hashed) {
          return { id: user.id, email: user.email, name: user.name };
        }
      } catch {}
    }
  } catch {}
  return null;
}

export async function getUserSettings(userId) {
  if (!mongoFallback && supabase) {
    const { data, error } = await supabase
      .from('pulse_users')
      .select('settings')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return {};
    return data.settings || {};
  }

  // JSONL fallback for users
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    const lines = data.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const user = JSON.parse(line);
        if (user.id === userId) return user.settings || {};
      } catch {}
    }
  } catch {}
  return {};
}

export async function saveUserSettings(userId, settings) {
  if (!mongoFallback && supabase) {
    const { error } = await supabase
      .from('pulse_users')
      .update({ settings, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) return { success: false, error: 'Failed to save settings' };
    return { success: true };
  }

  // JSONL fallback for users
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    const lines = data.split('\n').filter(Boolean);
    const users = [];
    let found = false;
    for (const line of lines) {
      try {
        const user = JSON.parse(line);
        if (user.id === userId) {
          users.push({ ...user, settings, updated_at: new Date().toISOString() });
          found = true;
        } else {
          users.push(user);
        }
      } catch {
        users.push(line);
      }
    }
    if (!found) {
      users.push({ id: userId, settings, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    await fs.writeFile(USERS_FILE, users.map(u => JSON.stringify(u)).join('\n') + '\n', 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function saveWhatsAppSession(userId, sessionData) {
  if (!mongoFallback && supabase) {
    const { error } = await supabase
      .from('pulse_users')
      .update({ whatsapp_session: sessionData, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) return { success: false, error: 'Failed to save WhatsApp session' };
    return { success: true };
  }

  // JSONL fallback - update whatsapp_session in user record
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    const lines = data.split('\n').filter(Boolean);
    const users = [];
    for (const line of lines) {
      try {
        const user = JSON.parse(line);
        if (user.id === userId) {
          users.push({ ...user, whatsapp_session: sessionData, updated_at: new Date().toISOString() });
        } else {
          users.push(user);
        }
      } catch {
        users.push(line);
      }
    }
    await fs.writeFile(USERS_FILE, users.map(u => JSON.stringify(u)).join('\n') + '\n', 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getWhatsAppSession(userId) {
  if (!mongoFallback && supabase) {
    const { data } = await supabase
      .from('pulse_users')
      .select('whatsapp_session')
      .eq('id', userId)
      .maybeSingle();
    return data?.whatsapp_session || null;
  }

  // JSONL fallback
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    const lines = data.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const user = JSON.parse(line);
        if (user.id === userId) return user.whatsapp_session || null;
      } catch {}
    }
  } catch {}
  return null;
}

export async function getUserById(userId) {
  if (!mongoFallback && supabase) {
    const { data } = await supabase
      .from('pulse_users')
      .select('id, email, name')
      .eq('id', userId)
      .maybeSingle();
    return data || null;
  }

  // JSONL fallback
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    const lines = data.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const user = JSON.parse(line);
        if (user.id === userId) return { id: user.id, email: user.email, name: user.name };
      } catch {}
    }
  } catch {}
  return null;
}

// ─── SCHEDULED REPLIES ────────────────────────────────────────────────────────

function createScheduledRecord({ groupId, groupName = null, text, scheduledFor, sourceMessageId = null }) {
  const normalizedGroupId = String(groupId || '').trim();
  const normalizedText = String(text || '').trim();
  const normalizedScheduledFor = String(scheduledFor || '').trim();

  if (!normalizedGroupId || !normalizedGroupId.endsWith('@g.us')) {
    throw new Error('A valid WhatsApp group id is required');
  }
  if (!normalizedText) throw new Error('Reply text is required');
  if (!normalizedScheduledFor) throw new Error('Scheduled time is required');
  if (normalizedText.length > 4096) throw new Error('Reply text is too long');

  const timestamp = new Date().toISOString();
  return {
    scheduled_id: crypto.randomUUID(),
    group_id: normalizedGroupId,
    group_name: groupName ? String(groupName).trim() : null,
    source_message_id: sourceMessageId ? String(sourceMessageId).trim() : null,
    text: normalizedText,
    scheduled_for: normalizedScheduledFor,
    status: 'scheduled',
    error: null,
    created_at: timestamp,
    updated_at: timestamp,
    sent_at: null,
    whatsapp_message_id: null,
  };
}

async function appendScheduledSnapshot(record) {
  const line = `${JSON.stringify(record)}\n`;
  await fs.appendFile(SCHEDULED_FILE, line, 'utf8');
}

async function readScheduledSnapshots() {
  try {
    const data = await fs.readFile(SCHEDULED_FILE, 'utf8');
    return data.split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function listScheduledStates() {
  const snapshots = await readScheduledSnapshots();
  const replies = new Map();
  for (const snapshot of snapshots) {
    if (!snapshot.scheduled_id) continue;
    replies.set(snapshot.scheduled_id, snapshot);
  }
  return [...replies.values()];
}

async function getScheduledById(scheduledId) {
  if (!scheduledId) return null;
  if (!mongoFallback && supabase) {
    const { data } = await supabase
      .from('whatsapp_scheduled_replies')
      .select('*')
      .eq('scheduled_id', scheduledId)
      .maybeSingle();
    return data;
  }
  const replies = await listScheduledStates();
  return replies.find(r => r.scheduled_id === scheduledId) || null;
}

export async function enqueueScheduledReply(input) {
  const reply = createScheduledRecord(input);
  if (!mongoFallback && supabase) {
    const { error } = await supabase.from('whatsapp_scheduled_replies').insert(reply);
    if (error) throw error;
    return reply;
  }
  await appendScheduledSnapshot(reply);
  return reply;
}

export async function listScheduledReplies({ status = null, limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));

  if (!mongoFallback && supabase) {
    let query = supabase
      .from('whatsapp_scheduled_replies')
      .select('*')
      .order('scheduled_for', { ascending: true })
      .limit(safeLimit);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  const replies = await listScheduledStates();
  return replies
    .filter(r => !status || r.status === status)
    .sort((a, b) => String(a.scheduled_for || '').localeCompare(String(b.scheduled_for || '')))
    .slice(0, safeLimit);
}

export async function cancelScheduledReply(scheduledId) {
  const existing = await getScheduledById(scheduledId);
  if (!existing) return null;
  const nextReply = { ...existing, status: 'cancelled', updated_at: new Date().toISOString() };

  if (!mongoFallback && supabase) {
    const { error } = await supabase
      .from('whatsapp_scheduled_replies')
      .update(nextReply)
      .eq('scheduled_id', scheduledId);
    if (error) throw error;
    return nextReply;
  }
  await appendScheduledSnapshot(nextReply);
  return nextReply;
}

export async function updateScheduledReply(scheduledId, updates) {
  const existing = await getScheduledById(scheduledId);
  if (!existing) return null;
  const nextReply = { ...existing, ...updates, scheduled_id: existing.scheduled_id, updated_at: new Date().toISOString() };

  if (!mongoFallback && supabase) {
    const { error } = await supabase
      .from('whatsapp_scheduled_replies')
      .update(nextReply)
      .eq('scheduled_id', scheduledId);
    if (error) throw error;
    return nextReply;
  }
  await appendScheduledSnapshot(nextReply);
  return nextReply;
}

export async function claimDueScheduledReplies() {
  const now = new Date().toISOString();

  if (!mongoFallback && supabase) {
    const { data, error } = await supabase
      .from('whatsapp_scheduled_replies')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  const replies = await listScheduledStates();
  return replies
    .filter(r => r.status === 'scheduled' && r.scheduled_for <= now)
    .sort((a, b) => String(a.scheduled_for || '').localeCompare(String(b.scheduled_for || '')));
}
