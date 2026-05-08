import crypto from 'crypto';
import { supabase, supabaseAdmin } from '../config/supabase';
import { channelService } from './channelService';
import { normalizeConversationPhoneNumber } from '../memory/conversationMemory';

type HistoryRecord = Record<string, any>;

type HistoryBatchProgress = {
  total: number;
  processed: number;
  listings: number;
  leads: number;
  parsed: number;
  skipped: number;
  failed: number;
};

type HistoryBatchResult = HistoryBatchProgress & {
  alreadyProcessed: boolean;
  historyProcessedAt: string | null;
};

type HistoryBatchOptions = {
  sessionLabel: string;
  tenantId: string;
  messages: HistoryRecord[];
  forceProcess?: boolean;
  onProgress?: (progress: HistoryBatchProgress) => void;
};

const db = supabaseAdmin ?? supabase;
const BATCH_SIZE = 50;
const processingTenants = new Set<string>();

function getProfileId(tenantId: string) {
  return String(tenantId || '').trim();
}

function toIsoTimestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date().toISOString();
}

function unwrapMessageNode(node: HistoryRecord | null | undefined): HistoryRecord | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  const wrappedKeys = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage'];
  let current: HistoryRecord = node;

  for (;;) {
    const wrapperKey = wrappedKeys.find((key) => current[key]?.message);
    if (!wrapperKey) break;
    current = current[wrapperKey].message;
  }

  return current;
}

function summarizeStreamRows(rows: Array<Record<string, any>>, fallbackText: string) {
  const parts = rows
    .map((row) => {
      const recordType = String(row?.record_type || '').toLowerCase();
      const typeLabel = recordType === 'requirement' ? 'Requirement' : 'Listing';
      const title = String(
        row?.raw_text ||
        row?.price_label ||
        row?.locality ||
        row?.bhk ||
        fallbackText,
      ).trim();

      if (!title) {
        return null;
      }

      return `${typeLabel}: ${title}`;
    })
    .filter((value): value is string => Boolean(value));

  const summary = parts.join(' | ');
  return summary || fallbackText.trim();
}

async function seedConversationMemory(tenantId: string, brokerPhone: string | null | undefined, summary: string) {
  const phoneNumber = normalizeConversationPhoneNumber(String(brokerPhone || '').trim());
  if (!phoneNumber || !summary.trim()) {
    return;
  }

  const { error } = await db
    .from('conversations')
    .insert({
      phone_number: phoneNumber,
      role: 'user',
      content: `[WhatsApp history import] ${summary.trim()}`,
      created_at: new Date().toISOString(),
    });

  if (error) {
    console.error('[HistoryBatchService] Failed to seed conversation memory', {
      tenantId,
      phoneNumber,
      error,
    });
  }
}

function extractTextFromMessage(message: HistoryRecord | null | undefined): string | null {
  const unwrapped = unwrapMessageNode(message);
  if (!unwrapped) {
    return null;
  }

  if (typeof unwrapped.conversation === 'string' && unwrapped.conversation.trim()) {
    return unwrapped.conversation.trim();
  }

  if (typeof unwrapped.extendedTextMessage?.text === 'string' && unwrapped.extendedTextMessage.text.trim()) {
    return unwrapped.extendedTextMessage.text.trim();
  }

  if (typeof unwrapped.templateMessage?.hydratedTemplate?.hydratedContentText === 'string' && unwrapped.templateMessage.hydratedTemplate.hydratedContentText.trim()) {
    return unwrapped.templateMessage.hydratedTemplate.hydratedContentText.trim();
  }

  if (typeof unwrapped.imageMessage?.caption === 'string' && unwrapped.imageMessage.caption.trim()) {
    return unwrapped.imageMessage.caption.trim();
  }

  if (typeof unwrapped.videoMessage?.caption === 'string' && unwrapped.videoMessage.caption.trim()) {
    return unwrapped.videoMessage.caption.trim();
  }

  if (typeof unwrapped.documentMessage?.caption === 'string' && unwrapped.documentMessage.caption.trim()) {
    return unwrapped.documentMessage.caption.trim();
  }

  if (typeof unwrapped.audioMessage === 'object' || typeof unwrapped.callMessage === 'object' || typeof unwrapped.protocolMessage === 'object') {
    return null;
  }

  return null;
}

function isSystemOrMediaMessage(record: HistoryRecord) {
  const message = unwrapMessageNode(record.message);
  if (!message) {
    return true;
  }

  if (
    record.messageStubType ||
    message.protocolMessage ||
    message.reactionMessage ||
    message.pollCreationMessage ||
    message.pollUpdateMessage ||
    message.messageContextInfo?.stanzaId ||
    message.callMessage ||
    message.audioMessage ||
    message.videoMessage?.url ||
    message.imageMessage?.url ||
    message.documentMessage?.url
  ) {
    return true;
  }

  return false;
}

function normalizeHistoryRecord(record: HistoryRecord, index: number, sessionLabel: string, tenantId: string) {
  const text = extractTextFromMessage(record.message);
  if (!text) {
    return null;
  }

  const remoteJid = String(record.key?.remoteJid || record.remoteJid || record.chatId || '').trim();
  if (!remoteJid) {
    return null;
  }

  const sender = String(
    record.pushName ||
    record.key?.participant ||
    record.author ||
    record.sender ||
    '',
  ).trim() || null;

  return {
    id: String(record.key?.id || record.id || crypto.randomUUID()),
    remote_jid: remoteJid,
    sender,
    text,
    timestamp: toIsoTimestamp(record.messageTimestamp || record.timestamp || record.created_at),
    created_at: toIsoTimestamp(record.messageTimestamp || record.timestamp || record.created_at),
    session_label: sessionLabel,
    tenant_id: getProfileId(tenantId),
    _index: index,
  };
}

export class HistoryBatchService {
  async processHistoryBatch(options: HistoryBatchOptions): Promise<HistoryBatchResult> {
    const { tenantId, sessionLabel, messages, onProgress, forceProcess = false } = options;
    const profileId = getProfileId(tenantId);

    if (processingTenants.has(profileId)) {
      return {
        total: 0,
        processed: 0,
        listings: 0,
        leads: 0,
        parsed: 0,
        skipped: 0,
        failed: 0,
        alreadyProcessed: true,
        historyProcessedAt: null,
      };
    }

    processingTenants.add(profileId);

    try {
      const { data: profile, error: profileError } = await db
        .from('profiles')
        .select('phone, history_processed, history_processed_at, history_message_count, history_total_count')
        .eq('id', profileId)
        .maybeSingle();

      if (profileError) {
        throw new Error(profileError.message);
      }

      if (profile?.history_processed && !forceProcess) {
        return {
          total: 0,
          processed: 0,
          listings: 0,
          leads: 0,
          parsed: 0,
          skipped: 0,
          failed: 0,
          alreadyProcessed: true,
          historyProcessedAt: profile.history_processed_at || null,
        };
      }

      if (forceProcess) {
        const { error: resetError } = await db
          .from('profiles')
          .update({
            history_processed: false,
            history_processed_at: null,
            history_message_count: 0,
            history_total_count: 0,
          })
          .eq('id', profileId);

        if (resetError) {
          throw new Error(resetError.message);
        }
      }

      const normalized = (Array.isArray(messages) ? messages : [])
        .filter((record) => record && typeof record === 'object')
        .filter((record) => !isSystemOrMediaMessage(record))
        .map((record, index) => normalizeHistoryRecord(record, index, sessionLabel, profileId))
        .filter((record): record is NonNullable<ReturnType<typeof normalizeHistoryRecord>> => Boolean(record));

      const { error: totalError } = await db
        .from('profiles')
        .update({
          history_processed: false,
          history_processed_at: null,
          history_message_count: 0,
          history_total_count: normalized.length,
        })
        .eq('id', profileId);

      if (totalError) {
        console.error('[HistoryBatchService] Failed to persist history total count', {
          tenantId: profileId,
          sessionLabel,
          error: totalError,
        });
      }

      let processed = 0;
      let listings = 0;
      let leads = 0;
      let parsed = 0;
      let skipped = 0;
      let failed = 0;

      for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
        const batch = normalized.slice(i, i + BATCH_SIZE);

        for (const message of batch) {
          try {
            const ingestedCount = await channelService.ingestMessage(profileId, {
              id: message.id,
              remote_jid: message.remote_jid,
              sender: message.sender,
              text: message.text,
              timestamp: message.timestamp,
              created_at: message.created_at,
            });

            processed += 1;

            if (ingestedCount > 0) {
              parsed += ingestedCount;

              const { data: streamRows, error: streamError } = await db
                .from('stream_items')
                .select('record_type, raw_text, price_label, locality, bhk')
                .eq('tenant_id', profileId)
                .eq('source_message_id', message.id);

              if (!streamError && Array.isArray(streamRows)) {
                const summary = summarizeStreamRows(streamRows, message.text);
                for (const row of streamRows) {
                  if (row?.record_type === 'requirement') {
                    leads += 1;
                  } else if (row?.record_type === 'listing') {
                    listings += 1;
                  }
                }

                await seedConversationMemory(profileId, profile?.phone, summary);
              }
            } else {
              skipped += 1;
            }
          } catch (error) {
            failed += 1;
            console.error('[HistoryBatchService] Failed to ingest history message', {
              tenantId: profileId,
              sessionLabel,
              messageId: message.id,
              error,
            });
          }
        }

        onProgress?.({
          total: normalized.length,
          processed,
          listings,
          leads,
          parsed,
          skipped,
          failed,
        });

        const { error: progressError } = await db
          .from('profiles')
          .update({
            history_message_count: processed,
            history_total_count: normalized.length,
          })
          .eq('id', profileId);

        if (progressError) {
          console.error('[HistoryBatchService] Failed to persist progress counter', {
            tenantId: profileId,
            sessionLabel,
            error: progressError,
          });
        }

        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const historyProcessedAt = new Date().toISOString();
      const { error: updateError } = await db
        .from('profiles')
        .update({
          history_processed: true,
          history_processed_at: historyProcessedAt,
          history_message_count: normalized.length,
          history_total_count: normalized.length,
        })
        .eq('id', profileId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      return {
        total: normalized.length,
        processed,
        listings,
        leads,
        parsed,
        skipped,
        failed,
        alreadyProcessed: false,
        historyProcessedAt,
      };
    } finally {
      processingTenants.delete(profileId);
    }
  }
}

export const historyBatchService = new HistoryBatchService();
