import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin ?? supabase;

export type SessionEventType =
  | 'connected'
  | 'disconnected'
  | 'groups_synced'
  | 'group_participants_updated'
  | 'message_deleted'
  | 'message_received'
  | 'message_updated'
  | 'parse_failed'
  | 'parse_success';

export type SessionEvent = {
  id: string;
  workspace_id: string;
  event_type: SessionEventType;
  payload: Record<string, unknown>;
  created_at: string;
};

class SessionEventService {
  async log(workspaceId: string, eventType: SessionEventType, payload: Record<string, unknown> = {}): Promise<void> {
    try {
      await db.from('session_events').insert({
        workspace_id: workspaceId,
        event_type: eventType,
        payload,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[SessionEventService] Failed to log event', { workspaceId, eventType, error });
    }
  }

  async getRecent(workspaceId: string, limit = 20): Promise<SessionEvent[]> {
    const { data } = await db
      .from('session_events')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data || []) as SessionEvent[];
  }

  async getCountByType(workspaceId: string, eventType: SessionEventType): Promise<number> {
    const { count } = await db
      .from('session_events')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('event_type', eventType);

    return count ?? 0;
  }

  async getLastActivity(workspaceId: string): Promise<string | null> {
    const { data } = await db
      .from('session_events')
      .select('created_at')
      .eq('workspace_id', workspaceId)
      .in('event_type', ['message_received', 'parse_success', 'parse_failed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.created_at || null;
  }

  async getParseRatio(workspaceId: string): Promise<{ parsed: number; failed: number; rate: number }> {
    const [parsed, failed] = await Promise.all([
      this.getCountByType(workspaceId, 'parse_success'),
      this.getCountByType(workspaceId, 'parse_failed'),
    ]);
    const total = parsed + failed;
    return {
      parsed,
      failed,
      rate: total > 0 ? Math.round((parsed / total) * 100) : 100,
    };
  }

  async getGroupsCount(workspaceId: string): Promise<number> {
    const { count } = await db
      .from('whatsapp_groups')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', workspaceId);

    const { count: groupHealthCount } = await db
      .from('whatsapp_group_health')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', workspaceId);

    return Math.max(count ?? 0, groupHealthCount ?? 0);
  }

  async getMessagesReceivedCount(workspaceId: string): Promise<number> {
    return this.getCountByType(workspaceId, 'message_received');
  }
}

export const sessionEventService = new SessionEventService();
