import crypto from 'crypto';
import { supabase, supabaseAdmin } from '../config/supabase';
import { historyBatchService } from './historyBatchService';

type InProgressKey = string;

type HistorySyncHealthRow = {
  tenant_id: string;
  session_label: string;
  connected_at: string | null;
  connection_status: 'connected' | 'connecting' | 'disconnected';
  phone_number?: string | null;
  owner_name?: string | null;
};

type ProfileRow = {
  id: string;
  history_processed: boolean | null;
};

const db = supabaseAdmin ?? supabase;
const inProgress = new Set<InProgressKey>();

function getPollIntervalMs() {
  const raw = Number(process.env.HISTORY_SYNC_POLL_INTERVAL_MS || 45_000);
  return Number.isFinite(raw) && raw >= 5_000 ? raw : 45_000;
}

function makeKey(tenantId: string, sessionLabel: string) {
  return `${tenantId}:${sessionLabel}`;
}

function toBaileysHistoryMessage(row: Record<string, any>) {
  const remoteJid = String(row.remote_jid || row.remoteJid || '').trim();
  const text = String(row.text || row.content || '').trim();

  if (!remoteJid || !text) {
    return null;
  }

  return {
    id: String(row.id || row.message_id || crypto.randomUUID()),
    key: {
      id: String(row.id || row.message_id || crypto.randomUUID()),
      remoteJid,
      fromMe: false,
    },
    message: {
      conversation: text,
    },
    sender: String(row.sender || '').trim() || null,
    timestamp: row.timestamp || row.created_at || new Date().toISOString(),
    created_at: row.created_at || row.timestamp || new Date().toISOString(),
    remoteJid,
    text,
  };
}

export class HistorySyncWorker {
  private timer: NodeJS.Timeout | null = null;
  private started = false;

  start() {
    if (this.started) {
      return;
    }

    this.started = true;
    void this.tick();

    this.timer = setInterval(() => {
      void this.tick();
    }, getPollIntervalMs());
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.started = false;
  }

  private async tick() {
    try {
      const { data: profiles, error: profileError } = await db
        .from('profiles')
        .select('id, history_processed')
        .eq('history_processed', false);

      if (profileError || !Array.isArray(profiles) || profiles.length === 0) {
        return;
      }

      for (const profile of profiles as ProfileRow[]) {
        const { data: healthRows, error: healthError } = await db
          .from('whatsapp_ingestion_health')
          .select('tenant_id, session_label, connected_at, connection_status, phone_number, owner_name')
          .eq('tenant_id', profile.id)
          .eq('connection_status', 'connected')
          .order('connected_at', { ascending: true, nullsFirst: false });

        if (healthError || !Array.isArray(healthRows) || healthRows.length === 0) {
          continue;
        }

        const candidate = healthRows[0] as HistorySyncHealthRow;
        const connectedAt = candidate.connected_at ? new Date(candidate.connected_at) : null;
        if (!connectedAt || Number.isNaN(connectedAt.getTime())) {
          continue;
        }

        const key = makeKey(profile.id, candidate.session_label);
        if (inProgress.has(key)) {
          continue;
        }

        inProgress.add(key);
        try {
          const historyWindowEnd = new Date(connectedAt.getTime() + 30 * 60_000).toISOString();
          const { data: messages, error: messageError } = await db
            .from('messages')
            .select('id, remote_jid, text, sender, timestamp, created_at')
            .eq('tenant_id', profile.id)
            .gte('timestamp', connectedAt.toISOString())
            .lte('timestamp', historyWindowEnd)
            .order('timestamp', { ascending: true });

          if (messageError || !Array.isArray(messages) || messages.length === 0) {
            continue;
          }

          const historyMessages = messages
            .map((row) => toBaileysHistoryMessage(row))
            .filter((row): row is NonNullable<ReturnType<typeof toBaileysHistoryMessage>> => Boolean(row));

          if (historyMessages.length === 0) {
            continue;
          }

          await historyBatchService.processHistoryBatch({
            tenantId: profile.id,
            sessionLabel: candidate.session_label,
            messages: historyMessages,
          });
        } catch (error) {
          console.error('[HistorySyncWorker] Failed to process history batch', {
            tenantId: profile.id,
            sessionLabel: candidate.session_label,
            error,
          });
        } finally {
          inProgress.delete(key);
        }
      }
    } catch (error) {
      console.error('[HistorySyncWorker] Poll tick failed', error);
    }
  }
}

export const historySyncWorker = new HistorySyncWorker();
