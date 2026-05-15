import { admin, getBrokerPhone, getPhoneFromRemoteJid, jsonResponse, logWorkerRun, queueOutboundMessage } from '../_shared/worker.ts';

Deno.serve(async () => {
  const workerName = 'site-visit-reminder';
  const errors: string[] = [];

  try {
    console.log('[SiteVisitReminder] Starting run');
    const now = Date.now();
    const in24Hours = now + 24 * 60 * 60 * 1000;
    const in2Hours = now + 2 * 60 * 60 * 1000;

    const { data: visits, error } = await admin
      .from('site_visits')
      .select('id,broker_id,lead_id,scheduled_for,location,notes,reminder_24h_sent,reminder_2h_sent,leads(contact_id,contacts(remote_jid,display_name))')
      .eq('status', 'scheduled');

    if (error) throw error;

    let processed = 0;
    for (const visit of visits || []) {
      try {
        const scheduledFor = new Date(visit.scheduled_for).getTime();
        const remoteJid = ((visit.leads as { contacts?: { remote_jid?: string; display_name?: string } } | null)?.contacts)?.remote_jid;
        const leadName = ((visit.leads as { contacts?: { display_name?: string } } | null)?.contacts)?.display_name || 'Lead';
        const leadPhone = getPhoneFromRemoteJid(remoteJid);
        const brokerPhone = await getBrokerPhone(visit.broker_id);
        const shouldSend24h = !visit.reminder_24h_sent && scheduledFor <= in24Hours && scheduledFor > in2Hours;
        const shouldSend2h = !visit.reminder_2h_sent && scheduledFor <= in2Hours && scheduledFor > now;

        if (!shouldSend24h && !shouldSend2h) continue;

        const reminderLabel = shouldSend2h ? '2_hour_visit_reminder' : '24_hour_visit_reminder';
        const whenCopy = shouldSend2h ? 'in about 2 hours' : 'within the next 24 hours';
        const location = visit.location || 'the scheduled site';

        if (leadPhone) {
          await queueOutboundMessage({
            leadId: visit.lead_id,
            brokerId: visit.broker_id,
            recipientPhone: leadPhone,
            message: `Reminder: your site visit for ${location} is scheduled ${whenCopy}. Reply here if you need any help before the visit.`,
            tag: reminderLabel,
            metadata: { worker: workerName, visit_id: visit.id },
          });
        }

        if (brokerPhone) {
          await queueOutboundMessage({
            leadId: visit.lead_id,
            brokerId: visit.broker_id,
            recipientPhone: brokerPhone,
            message: `Reminder: ${leadName}'s site visit for ${location} is scheduled ${whenCopy}.`,
            tag: reminderLabel,
            metadata: { worker: workerName, visit_id: visit.id },
          });
        }

        const updatePatch = shouldSend2h
          ? { reminder_2h_sent: true }
          : { reminder_24h_sent: true };

        const { error: updateError } = await admin.from('site_visits').update(updatePatch).eq('id', visit.id);
        if (updateError) throw updateError;
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[SiteVisitReminder] Visit failed', message);
        errors.push(message);
      }
    }

    await logWorkerRun(workerName, processed, errors);
    return jsonResponse({ ok: true, worker: workerName, processed, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[SiteVisitReminder] Fatal error', message);
    await logWorkerRun(workerName, 0, [message]);
    return jsonResponse({ ok: false, worker: workerName, processed: 0, errors: [message] }, 500);
  }
});
