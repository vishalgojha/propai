import { admin, jsonResponse, logWorkerRun } from '../_shared/worker.ts';

function calculateLeadScore(input: {
  lastClientMessageAt?: string | null;
  lastBrokerMessageAt?: string | null;
  responseRate?: number;
  hasUpcomingVisit: boolean;
  hasCompletedVisit: boolean;
  sentimentScore?: number | null;
}) {
  let score = 1;
  const now = Date.now();
  const lastMessageAt = input.lastClientMessageAt ? new Date(input.lastClientMessageAt).getTime() : 0;
  const hoursSinceLastMessage = lastMessageAt ? (now - lastMessageAt) / 36e5 : 999;

  if (hoursSinceLastMessage <= 24) score += 3;
  else if (hoursSinceLastMessage <= 72) score += 2;
  else if (hoursSinceLastMessage <= 168) score += 1;

  const responseRate = Math.max(0, Math.min(input.responseRate || 0, 1));
  score += Math.round(responseRate * 2);

  if (input.hasCompletedVisit) score += 3;
  else if (input.hasUpcomingVisit) score += 2;

  if ((input.sentimentScore || 0) >= 0.35) score += 1;
  if ((input.sentimentScore || 0) <= -0.35) score -= 1;

  const bounded = Math.max(1, Math.min(score, 10));
  const leadTemperature = bounded >= 8 ? 'hot' : bounded >= 5 ? 'warm' : bounded >= 3 ? 'cold' : 'dead';
  return { score: bounded, leadTemperature };
}

Deno.serve(async () => {
  const workerName = 'lead-scorer';
  const errors: string[] = [];

  try {
    console.log('[LeadScorer] Starting run');
    const { data: leads, error } = await admin
      .from('leads')
      .select('id,tenant_id,contact_id,contacts(remote_jid),lead_records(sentiment_score),site_visits(status,scheduled_for)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    let processed = 0;
    for (const lead of leads || []) {
      try {
        const remoteJid = (lead.contacts as { remote_jid?: string } | null)?.remote_jid;
        const { data: messages, error: messagesError } = await admin
          .from('messages')
          .select('sender,timestamp')
          .eq('tenant_id', lead.tenant_id)
          .eq('remote_jid', remoteJid || '')
          .order('timestamp', { ascending: false })
          .limit(50);

        if (messagesError) throw messagesError;

        const clientMessages = (messages || []).filter((message) => message.sender === 'Client' || message.sender === 'Broker');
        const brokerMessages = (messages || []).filter((message) => message.sender === 'AI');
        const lastClientMessageAt = clientMessages[0]?.timestamp || null;
        const lastBrokerMessageAt = brokerMessages[0]?.timestamp || null;
        const responseRate = clientMessages.length ? Math.min(brokerMessages.length / clientMessages.length, 1) : 0;
        const visits = Array.isArray(lead.site_visits) ? lead.site_visits as Array<{ status?: string; scheduled_for?: string }> : [];
        const sentimentScore = Array.isArray(lead.lead_records) && lead.lead_records[0]
          ? Number((lead.lead_records[0] as { sentiment_score?: number }).sentiment_score || 0)
          : 0;
        const result = calculateLeadScore({
          lastClientMessageAt,
          lastBrokerMessageAt,
          responseRate,
          hasUpcomingVisit: visits.some((visit) => visit.status === 'scheduled' && new Date(visit.scheduled_for || '').getTime() > Date.now()),
          hasCompletedVisit: visits.some((visit) => visit.status === 'completed'),
          sentimentScore,
        });

        const { error: updateError } = await admin
          .from('leads')
          .update({
            score: result.score,
            lead_temperature: result.leadTemperature,
            response_rate: responseRate,
            last_lead_message_at: lastClientMessageAt,
            last_broker_response_at: lastBrokerMessageAt,
            sentiment_score: sentimentScore,
            last_scored_at: new Date().toISOString(),
          })
          .eq('id', lead.id);

        if (updateError) throw updateError;
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[LeadScorer] Lead failed', message);
        errors.push(message);
      }
    }

    await logWorkerRun(workerName, processed, errors);
    return jsonResponse({ ok: true, worker: workerName, processed, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[LeadScorer] Fatal error', message);
    await logWorkerRun(workerName, 0, [message]);
    return jsonResponse({ ok: false, worker: workerName, processed: 0, errors: [message] }, 500);
  }
});
