import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { cleanMessage } from './cleaner.js';
import { extractRealEstateData } from './extractor.js';
import { isRelevant } from './filter.js';
import { buildMessageRecord, getMessageId } from './record.js';
import { claimNextPendingReply, hasMessage, saveMessage, updateReply } from './storage.js';
import { extractMessageText, formatLog } from './utils.js';

const AUTH_DIR = './auth_info_baileys';
const groupNameCache = new Map();
let activeSocket = null;
let connectPromise = null;
let reconnectTimer = null;
let connectionGeneration = 0;
let replyLoopPromise = null;
let replyPollTimer = null;

function isTransientDisconnect(error) {
  const statusCode =
    error?.output?.statusCode ||
    error?.data?.output?.statusCode ||
    error?.cause?.output?.statusCode;
  const message = error?.message || error?.cause?.message || '';

  return statusCode === 428 && message.includes('Connection Closed');
}

async function flushReplyQueue(sock, generation) {
  if (replyLoopPromise) {
    return replyLoopPromise;
  }

  replyLoopPromise = (async () => {
    while (sock === activeSocket && generation === connectionGeneration) {
      const reply = await claimNextPendingReply();

      if (!reply) {
        return;
      }

      try {
        const sent = await sock.sendMessage(reply.group_id, { text: reply.text });
        await updateReply(reply.reply_id, {
          status: 'sent',
          error: null,
          sent_at: new Date().toISOString(),
          whatsapp_message_id: sent?.key?.id || null,
        });
        console.log(`Sent reply to ${reply.group_name || reply.group_id}`);
      } catch (error) {
        if (isTransientDisconnect(error)) {
          await updateReply(reply.reply_id, {
            status: 'pending',
            error: null,
            claimed_at: null,
          });
          return;
        }

        await updateReply(reply.reply_id, {
          status: 'failed',
          error: error.message,
        });
        console.error(`Failed to send reply ${reply.reply_id}: ${error.message}`);
      }
    }
  })();

  try {
    await replyLoopPromise;
  } finally {
    replyLoopPromise = null;
  }
}

function startReplyPoller(sock, generation) {
  if (replyPollTimer) {
    clearInterval(replyPollTimer);
  }

  replyPollTimer = setInterval(() => {
    if (sock !== activeSocket || generation !== connectionGeneration) {
      clearInterval(replyPollTimer);
      replyPollTimer = null;
      return;
    }

    flushReplyQueue(sock, generation).catch((error) => {
      console.error(`Reply queue failed: ${error.message}`);
    });
  }, 5000);
}

async function resolveGroupName(sock, groupId) {
  if (groupNameCache.has(groupId)) {
    return groupNameCache.get(groupId);
  }

  try {
    const metadata = await sock.groupMetadata(groupId);
    const subject = metadata?.subject || null;
    groupNameCache.set(groupId, subject);
    return subject;
  } catch {
    groupNameCache.set(groupId, null);
    return null;
  }
}

async function processMessage(sock, msg) {
  if (!msg?.message || msg.key?.fromMe) {
    return;
  }

  const groupId = msg.key?.remoteJid;
  if (!groupId?.endsWith('@g.us')) {
    return;
  }

  const text = extractMessageText(msg.message);
  const cleaned = cleanMessage(text);

  if (!text || text.trim().length <= 5 || /^image\d*\.png$/i.test(text.trim())) {
    return;
  }

  if (!isRelevant(cleaned.cleaned)) {
    return;
  }

  const messageId = getMessageId(msg);
  if (await hasMessage(messageId)) {
    return;
  }

const groupName = await resolveGroupName(sock, groupId);
  const extracted = await extractRealEstateData(cleaned.cleaned);
  const record = buildMessageRecord({ msg, groupName, cleaned, extracted });
  const saved = await saveMessage(record);
  if (saved) {
    console.log(formatLog(record));
  }
}

export async function connectToWhatsApp() {
  if (connectPromise) {
    return connectPromise;
  }

  const generation = ++connectionGeneration;

  connectPromise = (async () => {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: ['PropAI Pulse', 'Chrome', '1.0.0'],
      printQRInTerminal: false,
      syncFullHistory: false,
    });

    activeSocket = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (sock !== activeSocket || generation !== connectionGeneration) {
        return;
      }

      if (qr) {
        const dataUrl = await QRCode.toDataURL(qr, { width: 240, margin: 1 });
        console.log('QR:' + dataUrl);
      }

      if (connection === 'open') {
        console.log('PropAI Pulse connected and listening to WhatsApp groups');
        startReplyPoller(sock, generation);
        flushReplyQueue(sock, generation).catch((error) => {
          console.error(`Reply queue failed: ${error.message}`);
        });
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log('Connection closed, reconnecting');

          if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              connectToWhatsApp().catch((error) => {
                console.error('Reconnect failed:', error.message);
              });
            }, 3000);
          }
        } else {
          console.error('WhatsApp session logged out');
        }

        if (sock === activeSocket) {
          activeSocket = null;
        }
        if (replyPollTimer) {
          clearInterval(replyPollTimer);
          replyPollTimer = null;
        }
        connectPromise = null;
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      if (sock !== activeSocket || generation !== connectionGeneration) {
        return;
      }

      flushReplyQueue(sock, generation).catch((error) => {
        console.error(`Reply queue failed: ${error.message}`);
      });

      await Promise.all(
        (messages || []).map(async (msg) => {
          try {
            await processMessage(sock, msg);
          } catch (error) {
            console.error(`Failed to process message ${msg?.key?.id || 'unknown'}: ${error.message}`);
          }
        }),
      );
    });

    return sock;
  })();

  try {
    return await connectPromise;
  } catch (error) {
    connectPromise = null;
    throw error;
  }
}
