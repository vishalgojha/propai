import { randomUUID } from 'crypto';
import { aiService } from './aiService';
import { getWorkspaceDefaultModel } from './workspaceSettingsService';
import { supabase, supabaseAdmin } from '../config/supabase';

export type ActionStep = {
    type: 'navigate' | 'click' | 'fill' | 'select' | 'scroll' | 'wait' | 'highlight';
    selector?: string;
    path?: string;
    value?: string;
    duration?: number;
    description: string;
};

type PlannedActionSequence = {
    steps: ActionStep[];
    summary: string;
};

const db = supabaseAdmin ?? supabase;
const ALLOWED_STEP_TYPES = new Set<ActionStep['type']>(['navigate', 'click', 'fill', 'select', 'scroll', 'wait', 'highlight']);
const FALLBACK_DESCRIPTION = 'Mujhe samajh nahi aaya — thoda aur batao?';

const SYSTEM_PROMPT = `
You are a browser control agent for PropAI Pulse, a real estate broker dashboard. The broker has asked for help and you must return a JSON array of steps to accomplish their request.

AVAILABLE PAGES AND KEY SELECTORS:
/stream:
  #stream-search — inventory search input
  [data-action="stream-filters"] — stream filters row
  [data-action="save-to-channel"] — save to channel button
  [data-action="stream-item"] — listing row
  [data-action="rebuild-stream"] — rebuild stream button

/whatsapp:
  [data-action="connect-whatsapp"] — connect WhatsApp button

/group-audit:
  [data-action="audit-group"] — save group audit setup
  [data-action="add-group"] — add group button

/settings:
  #workspace-name — workspace name input
  [data-action="save-settings"] — save workspace profile button

/team:
  [data-action="invite-member"] — add workspace member button

/broker-network:
  [data-action="broker-network-tab-contacts"] — contacts tab
  [data-action="broker-network-tab-overlaps"] — overlaps tab
  [data-action="broker-network-tab-partners"] — partners tab

/intelligence:
  [data-tour="intelligence-locality"] — locality section
  [data-tour="intelligence-bhk"] — BHK demand section

RULES:
- Return ONLY a valid JSON array of ActionStep objects
- No markdown, no explanation, no preamble
- Max 8 steps per sequence
- Always start with a navigate step if not already on the right page
- Always include a meaningful description for each step
- Never navigate outside the PropAI app; only use internal paths beginning with /
- Prefer highlight over click for read-only explanations
- Only use fill when you have a specific value to enter
- If request is ambiguous or impossible, return [{"type":"wait","duration":0,"description":"${FALLBACK_DESCRIPTION}"}]
`.trim();

function fallbackSteps(): ActionStep[] {
    return [{ type: 'wait', duration: 0, description: FALLBACK_DESCRIPTION }];
}

function safeJsonParse(raw: string) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) {
        return null;
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() || trimmed;

    try {
        return JSON.parse(candidate) as unknown;
    } catch {
        return null;
    }
}

function sanitizeStep(input: unknown): ActionStep | null {
    if (!input || typeof input !== 'object') {
        return null;
    }

    const row = input as Record<string, unknown>;
    const type = String(row.type || '').trim() as ActionStep['type'];
    const description = String(row.description || '').trim();

    if (!ALLOWED_STEP_TYPES.has(type) || !description) {
        return null;
    }

    const step: ActionStep = {
        type,
        description,
    };

    if (typeof row.selector === 'string' && row.selector.trim()) {
        step.selector = row.selector.trim();
    }
    if (typeof row.path === 'string' && row.path.trim().startsWith('/') && !row.path.trim().startsWith('//')) {
        step.path = row.path.trim();
    }
    if (typeof row.value === 'string') {
        step.value = row.value;
    }
    if (Number.isFinite(Number(row.duration))) {
        step.duration = Math.max(0, Number(row.duration));
    }

    if (type === 'navigate' && !step.path) {
        return null;
    }
    if ((type === 'click' || type === 'fill' || type === 'select' || type === 'scroll' || type === 'highlight') && !step.selector) {
        return null;
    }
    if ((type === 'fill' || type === 'select') && typeof step.value !== 'string') {
        return null;
    }

    return step;
}

async function ensureSubscribed(channel: ReturnType<typeof db.channel>) {
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Realtime subscribe timeout')), 5000);
        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                clearTimeout(timeout);
                resolve();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                clearTimeout(timeout);
                reject(new Error(`Realtime subscription failed: ${status}`));
            }
        });
    });
}

export class AgentControlService {
    async planActions(message: string, pathname: string, tenantId: string): Promise<PlannedActionSequence> {
        const prompt = [
            `Current path: ${pathname || '/'}`,
            `Broker request: ${message}`,
        ].join('\n');

        const modelPreference = await getWorkspaceDefaultModel(tenantId).catch(() => 'Auto');
        const response = await aiService.chat(
            prompt,
            modelPreference || 'Auto',
            'agent_router',
            tenantId,
            SYSTEM_PROMPT,
        ).catch(() => null);

        const parsed = safeJsonParse(response?.text || '');
        const rawSteps = Array.isArray(parsed) ? parsed : [];
        const steps = rawSteps
            .map((step) => sanitizeStep(step))
            .filter((step): step is ActionStep => Boolean(step))
            .slice(0, 8);

        if (!steps.length) {
            return {
                steps: fallbackSteps(),
                summary: FALLBACK_DESCRIPTION,
            };
        }

        return {
            summary: steps.map((step) => step.description).join(' -> '),
            steps,
        };
    }

    async broadcastSequence(sessionId: string, plan: PlannedActionSequence) {
        const channel = db.channel(`agent:control:${sessionId}`, {
            config: {
                broadcast: {
                    ack: true,
                    self: false,
                },
            },
        });

        try {
            await ensureSubscribed(channel);
            await channel.send({
                type: 'broadcast',
                event: 'action_sequence',
                payload: {
                    steps: plan.steps,
                    summary: plan.summary,
                    requestId: randomUUID(),
                },
            });
        } finally {
            await db.removeChannel(channel);
        }
    }
}

export const agentControlService = new AgentControlService();
