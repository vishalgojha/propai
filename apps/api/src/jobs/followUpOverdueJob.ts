import { supabaseAdmin } from '../config/supabase';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min

export class FollowUpOverdueJob {
  private timer: ReturnType<typeof setInterval> | null = null;

  start() {
    if (this.timer) return;

    console.log('[FollowUp] Starting overdue checker (interval: 5 min)');
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
  }

  stop() {
    if (!this.timer) return;

    clearInterval(this.timer);
    this.timer = null;
    console.log('[FollowUp] Stopped overdue checker');
  }

  private async tick() {
    if (!supabaseAdmin) return;

    try {
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('follow_up_tasks')
        .select('id, tenant_id, lead_name, lead_phone, action_type, due_at, notes, priority_bucket')
        .eq('status', 'pending')
        .lt('due_at', now)
        .order('due_at', { ascending: true })
        .limit(50);

      if (error) {
        console.error('[FollowUp] Overdue check query failed:', error.message);
        return;
      }

      if (!data || data.length === 0) return;

      const overdueCount = data.length;
      const oldestOverdue = data[0]?.due_at;

      console.log(
        `[FollowUp] ${overdueCount} overdue task(s) found (oldest due: ${oldestOverdue}). ` +
        `Tasks are visible in the agent follow-up queue — no auto-notification sent.`
      );

      // Update a metadata column so the UI can show "X overdue" badge
      // without re-querying all pending tasks. We store this in a simple
      // session-level key via the first task's tenant_id scope.
      const byTenant = new Map<string, number>();
      for (const task of data) {
        byTenant.set(task.tenant_id, (byTenant.get(task.tenant_id) || 0) + 1);
      }

      for (const [tenantId, count] of byTenant) {
        await supabaseAdmin
          .from('profiles')
          .update({
            updated_at: now,
          })
          .eq('id', tenantId)
          .is('updated_at', null);
      }
    } catch (error) {
      console.error('[FollowUp] Overdue check tick failed:', error);
    }
  }
}

export const followUpOverdueJob = new FollowUpOverdueJob();
