import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY') || '';
const openRouterBaseUrl = Deno.env.get('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1';
const openRouterModel = Deno.env.get('OPENROUTER_MODEL') || 'openai/gpt-4o-mini';
const doublewordApiKey = Deno.env.get('DOUBLEWORD_API_KEY') || '';
const doublewordBaseUrl = Deno.env.get('DOUBLEWORD_BASE_URL') || 'https://api.doubleword.ai/v1';
const doublewordModel = Deno.env.get('DOUBLEWORD_MODEL') || 'qwen3-235b';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('[Worker] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export async function logWorkerRun(workerName: string, recordsProcessed: number, errors: string[] = []) {
  await admin.from('worker_logs').insert({
    worker_name: workerName,
    ran_at: new Date().toISOString(),
    records_processed: recordsProcessed,
    errors,
  });
}

export async function queueOutboundMessage(input: {
  leadId?: string | null;
  brokerId: string;
  recipientPhone?: string | null;
  message: string;
  scheduledAt?: string;
  tag: string;
  metadata?: Record<string, unknown>;
}) {
  const row = {
    lead_id: input.leadId || null,
    broker_id: input.brokerId,
    recipient_phone: input.recipientPhone || null,
    message: input.message,
    scheduled_at: input.scheduledAt || new Date().toISOString(),
    status: 'queued',
    tag: input.tag,
    metadata: input.metadata || {},
  };

  const { error } = await admin.from('outbound_message_queue').insert(row);
  if (error) {
    throw new Error(error.message);
  }
}

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export function getPhoneFromRemoteJid(remoteJid?: string | null) {
  return remoteJid ? remoteJid.split('@')[0] : null;
}

export async function getBrokerPhone(brokerId: string) {
  const { data, error } = await admin
    .from('whatsapp_sessions')
    .select('session_data,last_sync,status')
    .eq('tenant_id', brokerId)
    .eq('status', 'connected')
    .order('last_sync', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data?.session_data as Record<string, unknown> | null)?.phoneNumber as string | undefined;
}

export async function buildReengagementMessage(context: {
  leadName: string;
  location?: string | null;
  budget?: string | null;
  lastInterest?: string | null;
}) {
  if (doublewordApiKey) {
    try {
      const response = await fetch(`${doublewordBaseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${doublewordApiKey}`,
        },
        body: JSON.stringify({
          model: doublewordModel,
          messages: [
            {
              role: 'system',
              content: 'You write concise WhatsApp follow-up messages for Indian real estate brokers. No markdown, no greeting fluff, max 3 lines.',
            },
            {
              role: 'user',
              content: `Write a re-engagement message for ${context.leadName}. Last interest: ${context.lastInterest || 'property search'}. Preferred location: ${context.location || 'not specified'}. Budget: ${context.budget || 'not specified'}.`,
            },
          ],
        }),
      });

      if (response.ok) {
        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content;
        if (content) {
          try {
            const parsed = JSON.parse(content);
            return typeof parsed?.message === 'string' ? parsed.message : content;
          } catch {
            return typeof content === 'string' ? content : null;
          }
        }
      }
    } catch {
      // fall through to OpenRouter
    }
  }

  if (!openRouterApiKey) {
    return `Hi ${context.leadName}, just checking back on your ${context.lastInterest || context.location || 'property search'}. If you're still looking, I can send fresh matching options today.`;
  }

  const response = await fetch(`${openRouterBaseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openRouterApiKey}`,
      'HTTP-Referer': Deno.env.get('APP_URL') || 'https://app.propai.live',
      'X-Title': 'PropAI Pulse Worker',
    },
    body: JSON.stringify({
      model: openRouterModel,
      messages: [
        {
          role: 'system',
          content:
            'You write concise WhatsApp follow-up messages for Indian real estate brokers. No markdown, no greeting fluff, max 3 lines.',
        },
        {
          role: 'user',
          content: `Write a re-engagement message for ${context.leadName}. Last interest: ${context.lastInterest || 'property search'}. Preferred location: ${context.location || 'not specified'}. Budget: ${context.budget || 'not specified'}.`,
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    return `Hi ${context.leadName}, just checking back on your ${context.lastInterest || context.location || 'property search'}. If you're still looking, I can send fresh matching options today.`;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    return `Hi ${context.leadName}, just checking back on your ${context.lastInterest || context.location || 'property search'}. If you're still looking, I can send fresh matching options today.`;
  }

  try {
    const parsed = JSON.parse(content);
    return typeof parsed?.message === 'string' ? parsed.message : content;
  } catch {
    return typeof content === 'string' ? content : `Hi ${context.leadName}, just checking back on your search.`;
  }
}
