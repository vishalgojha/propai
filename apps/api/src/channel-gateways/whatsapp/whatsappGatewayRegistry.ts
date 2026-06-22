import { CloudApiWhatsAppGateway } from './CloudApiWhatsAppGateway';
import { EvolutionApiWhatsAppGateway } from './EvolutionApiWhatsAppGateway';
import type { WhatsAppGateway } from './WhatsAppGateway';

const cloudApiGateway = new CloudApiWhatsAppGateway();
const evolutionApiGateway = new EvolutionApiWhatsAppGateway();

export async function getWhatsAppGateway(_workspaceOwnerId?: string): Promise<WhatsAppGateway> {
    return cloudApiGateway;
}

export function getEvolutionApiGateway(): EvolutionApiWhatsAppGateway {
    return evolutionApiGateway;
}
