import { sessionEventService } from '../../services/sessionEventService';
import { whatsappHealthService } from '../../services/whatsappHealthService';
import { sendWhatsAppLifecycleEmail } from '../../whatsapp/propaiRuntimeHooks';

export async function processWhatsAppSessionEvent(input: {
    tenantId: string;
    sessionLabel: string;
    phoneNumber?: string | null;
    ownerName?: string | null;
    status: 'connected' | 'connecting' | 'disconnected';
}) {
    await whatsappHealthService.upsertConnectionSnapshot({
        tenantId: input.tenantId,
        sessionLabel: input.sessionLabel,
        phoneNumber: input.phoneNumber || null,
        ownerName: input.ownerName || null,
        status: input.status,
    });

    if (input.status === 'connected') {
        void sessionEventService.log(input.tenantId, 'connected', {
            sessionLabel: input.sessionLabel,
            phoneNumber: input.phoneNumber || null,
        });
    }

    if (input.status === 'disconnected') {
        void sessionEventService.log(input.tenantId, 'disconnected', {
            sessionLabel: input.sessionLabel,
            phoneNumber: input.phoneNumber || null,
        });
    }

    if (input.status === 'connected' || input.status === 'disconnected') {
        await sendWhatsAppLifecycleEmail({
            tenantId: input.tenantId,
            label: input.sessionLabel,
            status: input.status,
            phoneNumber: input.phoneNumber || null,
        });
    }
}
