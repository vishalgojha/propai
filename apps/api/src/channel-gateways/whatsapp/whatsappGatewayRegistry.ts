import { CloudApiWhatsAppGateway } from './CloudApiWhatsAppGateway';
import { EvolutionApiWhatsAppGateway } from './EvolutionApiWhatsAppGateway';
import { supabase, supabaseAdmin } from '../../config/supabase';
import type { WhatsAppGateway } from './WhatsAppGateway';

const db = supabaseAdmin || supabase;

const cloudApiGateway = new CloudApiWhatsAppGateway();
const evolutionApiGateway = new EvolutionApiWhatsAppGateway();

async function getWorkspaceGatewayType(workspaceOwnerId: string): Promise<string | null> {
    try {
        const { data } = await db
            .from('workspace_settings')
            .select('settings')
            .eq('tenant_id', workspaceOwnerId)
            .maybeSingle();
        if (data) {
            const settings = (data as any).settings as Record<string, unknown> || {};
            const gatewayType = String(settings.gateway_type || '').trim().toLowerCase();
            if (gatewayType === 'evolution' || gatewayType === 'cloud_api') {
                return gatewayType;
            }
        }
    } catch {
        // fall through
    }
    return null;
}

export async function getWhatsAppGateway(workspaceOwnerId?: string): Promise<WhatsAppGateway> {
    if (workspaceOwnerId) {
        const perWorkspaceGateway = await getWorkspaceGatewayType(workspaceOwnerId);
        if (perWorkspaceGateway === 'evolution') {
            return evolutionApiGateway;
        }
        if (perWorkspaceGateway === 'cloud_api') {
            return cloudApiGateway;
        }
    }

    const evolutionUrl = String(process.env.EVOLUTION_API_URL || '').trim();
    if (evolutionUrl) {
        return evolutionApiGateway;
    }

    return cloudApiGateway;
}
