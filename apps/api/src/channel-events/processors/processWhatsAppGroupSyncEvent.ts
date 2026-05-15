import { whatsappGroupService } from '../../services/whatsappGroupService';
import { whatsappHealthService } from '../../services/whatsappHealthService';
import { sessionEventService } from '../../services/sessionEventService';

type GroupRecord = {
    id: string;
    name: string;
    participantsCount?: number;
};

export async function processWhatsAppGroupSyncEvent(input: {
    tenantId: string;
    sessionLabel: string;
    groups: GroupRecord[];
}) {
    await whatsappHealthService.syncGroups(input.tenantId, input.sessionLabel, input.groups);
    await whatsappGroupService.syncGroups(input.tenantId, input.sessionLabel, input.groups);
    void sessionEventService.log(input.tenantId, 'groups_synced', {
        sessionLabel: input.sessionLabel,
        count: input.groups.length,
        groupNames: input.groups.slice(0, 20).map((group) => group.name),
    });
}
