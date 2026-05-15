import type { WhatsAppGateway } from './WhatsAppGateway';
import { BaileysWhatsAppGateway } from './BaileysWhatsAppGateway';

const baileysGateway = new BaileysWhatsAppGateway();

export function getWhatsAppGateway(_workspaceOwnerId?: string): WhatsAppGateway {
    return baileysGateway;
}
