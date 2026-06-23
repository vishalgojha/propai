import { supabaseAdmin } from '../config/supabase';
import { channelService } from '../services/channelService';

const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 60_000;

export class EvolutionBatchParserJob {
  private timer: ReturnType<typeof setInterval> | null = null;

  start() {
    if (this.timer) return;
    console.log('[EvolutionBatchParser] Starting (interval: 60s, batch: 10)');
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    console.log('[EvolutionBatchParser] Stopped');
  }

  private async tick() {
    try {
      const count = await this.processBatch();
      if (count > 0) {
        console.log(`[EvolutionBatchParser] Parsed ${count} raw messages`);
      }
    } catch (error) {
      console.error('[EvolutionBatchParser] Tick error', error);
    }
  }

  private async processBatch(): Promise<number> {
    const db = supabaseAdmin!;

    const { data: rows, error } = await db
      .from('evolution_raw_messages')
      .select('id, tenant_id, session_label, remote_jid, sender, text_content, message_id, source_group_jid, sender_jid, created_at, parse_attempts')
      .eq('is_parsed', false)
      .lt('parse_attempts', 3)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error('[EvolutionBatchParser] Query error', error);
      return 0;
    }

    if (!rows || rows.length === 0) return 0;

    let parsed = 0;

    for (const row of rows) {
      try {
        if (!row.text_content) {
          await db.from('evolution_raw_messages').update({
            is_parsed: true,
            parsed_at: new Date().toISOString(),
          }).eq('id', row.id);
          parsed++;
          continue;
        }

        const ingested = await channelService.ingestMessage(row.tenant_id, {
          id: row.message_id || row.id,
          session_label: row.session_label,
          remote_jid: row.remote_jid,
          sender: row.sender || 'Unknown',
          text: row.text_content,
          timestamp: row.created_at,
          created_at: row.created_at,
          source: 'evolution_api',
          sourceGroupId: row.source_group_jid || null,
          sourceGroupName: null,
          senderJid: row.sender_jid || null,
        });

        await db.from('evolution_raw_messages').update({
          is_parsed: true,
          parsed_at: new Date().toISOString(),
        }).eq('id', row.id);

        parsed += ingested;
      } catch (error: any) {
        console.warn('[EvolutionBatchParser] Parse error for', row.id, error?.message);
        await db.from('evolution_raw_messages').update({
          parse_attempts: (row.parse_attempts || 0) + 1,
          last_parse_error: String(error?.message || 'Unknown').slice(0, 500),
        }).eq('id', row.id);
      }
    }

    return parsed;
  }
}

export const evolutionBatchParserJob = new EvolutionBatchParserJob();
