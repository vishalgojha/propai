import { admin, getBrokerPhone, jsonResponse, logWorkerRun, queueOutboundMessage } from '../_shared/worker.ts';

Deno.serve(async () => {
  const workerName = 'market-pulse';
  const errors: string[] = [];

  try {
    console.log('[MarketPulse] Starting run');
    const { data: brokers, error } = await admin.from('profiles').select('id,full_name');
    if (error) throw error;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let processed = 0;

    for (const broker of brokers || []) {
      try {
        const [leadsResult, visitsResult] = await Promise.all([
          admin.from('leads').select('id,status,lead_temperature', { count: 'exact', head: false }).eq('tenant_id', broker.id),
          admin.from('site_visits').select('id,status', { count: 'exact', head: false }).eq('broker_id', broker.id).gte('scheduled_for', weekAgo),
        ]);

        if (leadsResult.error) throw leadsResult.error;
        if (visitsResult.error) throw visitsResult.error;

        const leads = leadsResult.data || [];
        const activeLeads = leads.filter((lead) => lead.status !== 'Closed').length;
        const hotLeads = leads.filter((lead) => lead.lead_temperature === 'hot').length;
        const siteVisits = (visitsResult.data || []).length;
        const conversions = leads.filter((lead) => lead.status === 'Closed').length;
        const conversionRate = leads.length ? Math.round((conversions / leads.length) * 100) : 0;
        const brokerPhone = await getBrokerPhone(broker.id);
        if (!brokerPhone) continue;

        await queueOutboundMessage({
          brokerId: broker.id,
          recipientPhone: brokerPhone,
          message: `Weekly market pulse\n• Active leads: ${activeLeads}\n• Hot leads: ${hotLeads}\n• Site visits this week: ${siteVisits}\n• Conversion rate: ${conversionRate}%`,
          tag: 'market_pulse',
          metadata: { worker: workerName },
        });
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[MarketPulse] Broker failed', message);
        errors.push(message);
      }
    }

    await logWorkerRun(workerName, processed, errors);
    return jsonResponse({ ok: true, worker: workerName, processed, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[MarketPulse] Fatal error', message);
    await logWorkerRun(workerName, 0, [message]);
    return jsonResponse({ ok: false, worker: workerName, processed: 0, errors: [message] }, 500);
  }
});
