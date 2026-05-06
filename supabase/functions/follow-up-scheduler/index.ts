import { admin, getPhoneFromRemoteJid, jsonResponse, logWorkerRun, queueOutboundMessage } from '../_shared/worker.ts';

Deno.serve(async () => {
  const workerName = 'follow-up-scheduler';
  const errors: string[] = [];

  try {
    console.log('[FollowUpScheduler] Starting run');
    const { data: leads, error } = await admin
      .from('leads')
      .select('id,tenant_id,contacts(remote_jid,display_name)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    let processed = 0;
    for (const lead of leads || []) {
      try {
        const remoteJid = (lead.contacts as { remote_jid?: string; display_name?: string } | null)?.remote_jid;
        if (!remoteJid) continue;

        const { data: messages, error: messagesError } = await admin
          .from('messages')
          .select('sender,timestamp')
          .eq('tenant_id', lead.tenant_id)
          .eq('remote_jid', remoteJid)
          .order('timestamp', { ascending: false })
          .limit(25);

        if (messagesError) throw messagesError;

        const latestClient = (messages || []).find((message) => message.sender !== 'AI');
        const latestBroker = (messages || []).find((message) => message.sender === 'AI');
        if (!latestClient?.timestamp) continue;

        const clientTs = new Date(latestClient.timestamp).getTime();
        const brokerTs = latestBroker?.timestamp ? new Date(latestBroker.timestamp).getTime() : 0;
        const hoursSinceClient = (Date.now() - clientTs) / 36e5;

        if (hoursSinceClient <= 48 || brokerTs >= clientTs) continue;

        await queueOutboundMessage({
          leadId: lead.id,
          brokerId: lead.tenant_id,
          recipientPhone: getPhoneFromRemoteJid(remoteJid),
          message: `Hi, just following up on your property requirement. If you want, I can share the next best matching options today.`,
          tag: 'soft_follow_up',
          metadata: { worker: workerName },
        });
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[FollowUpScheduler] Lead failed', message);
        errors.push(message);
      }
    }

    await logWorkerRun(workerName, processed, errors);
    return jsonResponse({ ok: true, worker: workerName, processed, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[FollowUpScheduler] Fatal error', message);
    await logWorkerRun(workerName, 0, [message]);
    return jsonResponse({ ok: false, worker: workerName, processed: 0, errors: [message] }, 500);
  }
});
