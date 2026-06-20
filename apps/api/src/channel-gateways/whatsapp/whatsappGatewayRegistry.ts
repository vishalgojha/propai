import { CloudApiWhatsAppGateway } from './CloudApiWhatsAppGateway';

const cloudApiGateway = new CloudApiWhatsAppGateway();

export function getWhatsAppGateway(_workspaceOwnerId?: string): CloudApiWhatsAppGateway {
    return cloudApiGateway;
}
