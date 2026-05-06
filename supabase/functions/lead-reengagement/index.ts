import { admin, buildReengagementMessage, getPhoneFromRemoteJid, jsonResponse, logWorkerRun, queueOutboundMessage } from '../_shared/worker.ts';

Deno.serve(async () => {
  const workerName = 'lead-reengagement';
  const errors: string[] = [];

  try {
    console.log('[LeadReengagement] Starting run');
    const cutoffIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: leads, error } = await admin
      .from('leads')
      .select('id,tenant_id,budget,location_pref,status,lead_temperature,last_lead_message_at,last_reengaged_at,contacts(remote_jid,display_name)')
      .not('status', 'eq', 'Closed')
      .order('created_at', { ascending: false });

    if (error) throw error;

    let processed = 0;
    for (const lead of leads || []) {
      try {
        if (lead.lead_temperature === 'dead') continue;
        if (!lead.last_lead_message_at || lead.last_lead_message_at > cutoffIso) continue;
        if (lead.last_reengaged_at && lead.last_reengaged_at > cutoffIso) continue;

        const remoteJid = (lead.contacts as { remote_jid?: string; display_name?: string } | null)?.remote_jid;
        const leadName = (lead.contacts as { display_name?: string } | null)?.display_name || 'there';
        const recipientPhone = getPhoneFromRemoteJid(remoteJid);
        if (!recipientPhone) continue;

        const message = await buildReengagementMessage({
          leadName,
          location: lead.location_pref,
          budget: lead.budget,
          lastInterest: lead.location_pref,
        });

        await queueOutboundMessage({
          leadId: lead.id,
          brokerId: lead.tenant_id,
          recipientPhone,
          message,
          tag: 're_engagement',
          metadata: { worker: workerName },
        });

        const { error: updateError } = await admin
          .from('leads')
          .update({ last_reengaged_at: new Date().toISOString() })
          .eq('id', lead.id);

        if (updateError) throw updateError;
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[LeadReengagement] Lead failed', message);
        errors.push(message);
      }
    }

    await logWorkerRun(workerName, processed, errors);
    return jsonResponse({ ok: true, worker: workerName, processed, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[LeadReengagement] Fatal error', message);
    await logWorkerRun(workerName, 0, [message]);
    return jsonResponse({ ok: false, worker: workerName, processed: 0, errors: [message] }, 500);
  }
});
