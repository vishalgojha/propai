import {
    countLikelyBrokerSignals,
    countNoiseSignals,
    GroupClassification,
    whatsappGroupService,
} from './whatsappGroupService';
import { brokerContactSyncService } from './brokerContactSyncService';

function normalizePhoneFromJid(value?: string | null) {
    const jid = String(value || '').trim().toLowerCase();
    if (!jid) return '';

    const localPart = jid.split('@')[0] || '';
    const deviceSeparatorIndex = localPart.indexOf(':');
    const phoneCandidate = deviceSeparatorIndex >= 0 ? localPart.slice(0, deviceSeparatorIndex) : localPart;
    const digits = phoneCandidate.replace(/\D/g, '');

    if (/^91[6-9]\d{9}$/.test(digits)) return digits.slice(2);
    if (/^[6-9]\d{9}$/.test(digits)) return digits;
    return '';
}

function buildOverlapMap(groups: Array<{ id: string; participantJids?: string[] }>) {
    const phoneToGroups = new Map<string, Set<string>>();

    for (const group of groups) {
        const phones = Array.from(new Set((group.participantJids || []).map((jid) => normalizePhoneFromJid(jid)).filter(Boolean)));
        for (const phone of phones) {
            const existing = phoneToGroups.get(phone) || new Set<string>();
            existing.add(group.id);
            phoneToGroups.set(phone, existing);
        }
    }

    return phoneToGroups;
}

function topOverlappingGroups(input: {
    groupId: string;
    phones: string[];
    overlapMap: Map<string, Set<string>>;
    groupNames: Map<string, string>;
}) {
    const sharedCounts = new Map<string, number>();

    for (const phone of input.phones) {
        const overlappingGroupIds = input.overlapMap.get(phone) || new Set<string>();
        for (const overlappingGroupId of overlappingGroupIds) {
            if (overlappingGroupId === input.groupId) continue;
            sharedCounts.set(overlappingGroupId, (sharedCounts.get(overlappingGroupId) || 0) + 1);
        }
    }

    return Array.from(sharedCounts.entries())
        .map(([id, sharedMemberCount]) => ({
            id,
            name: input.groupNames.get(id) || id,
            sharedMemberCount,
        }))
        .sort((left, right) => right.sharedMemberCount - left.sharedMemberCount)
        .slice(0, 5);
}

function average(values: number[]) {
    if (!values.length) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function positiveOrDerived(value: unknown, derive: () => number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : derive();
}

export class GroupAuditService {
    async getAudit(workspaceOwnerId: string, sessionLabel: string) {
        const groups = (await whatsappGroupService.listGroups(workspaceOwnerId, { includeArchived: false }))
            .filter((group) => String(group.sessionLabel || '') === sessionLabel);

        const overlapMap = buildOverlapMap(groups.map((group) => ({
            id: String(group.id || ''),
            participantJids: Array.isArray((group as any).participantJids) ? ((group as any).participantJids as string[]) : [],
        })));
        const groupNames = new Map(groups.map((group) => [String(group.id || ''), String(group.name || group.id || '')]));

        const enrichedGroups = groups.map((group) => {
            const participantJids: string[] = Array.isArray((group as any).participantJids)
                ? ((group as any).participantJids as string[])
                : [];
            const phones: string[] = Array.from(
                new Set(
                    participantJids
                        .map((jid: string) => normalizePhoneFromJid(jid))
                        .filter((phone): phone is string => Boolean(phone)),
                ),
            );
            const duplicatePhones = phones.filter((phone) => (overlapMap.get(phone)?.size || 0) > 1);
            const overlapPercent = phones.length > 0 ? Math.round((duplicatePhones.length / phones.length) * 100) : 0;
            const classification = String((group as any).classification || 'unknown') as GroupClassification;
            const scoringInput = {
                id: String(group.id || ''),
                name: String(group.name || ''),
                participantsCount: Number(group.participantsCount || 0),
                participantJids,
            };
            const signalScore = positiveOrDerived(
                (group as any).signalScore,
                () => countLikelyBrokerSignals(scoringInput, group.locality, group.category),
            );
            const noiseScore = positiveOrDerived(
                (group as any).noiseScore,
                () => countNoiseSignals(scoringInput, classification, group.category),
            );

            const reasons: string[] = [];
            if (classification === 'business') reasons.push('business-labelled by PropAI');
            if (group.locality) reasons.push(`locality signal: ${group.locality}`);
            if (signalScore >= 55) reasons.push('strong real-estate keyword density');
            if (overlapPercent >= 45) reasons.push(`high broker overlap: ${overlapPercent}%`);
            if (noiseScore >= 60) reasons.push('high non-business or noisy naming pattern');
            if (phones.length >= 100) reasons.push('large broker surface');

            return {
                ...group,
                participantPhoneCount: phones.length,
                duplicateMemberCount: duplicatePhones.length,
                overlappingMemberCount: duplicatePhones.length,
                duplicateOverlapPercent: overlapPercent,
                overlappingGroups: topOverlappingGroups({
                    groupId: String(group.id || ''),
                    phones,
                    overlapMap,
                    groupNames,
                }),
                signalScore,
                noiseScore,
                reasons,
                chaosScore: Math.max(0, Math.min(100, Math.round((noiseScore * 0.55) + (overlapPercent * 0.45)))),
            };
        }).sort((left, right) => {
            return (right.signalScore - right.noiseScore) - (left.signalScore - left.noiseScore);
        });

        const uniquePhones = new Set<string>();
        const duplicatePhonesWorkspace = new Set<string>();
        for (const [phone, sessionGroups] of overlapMap.entries()) {
            uniquePhones.add(phone);
            if (sessionGroups.size > 1) duplicatePhonesWorkspace.add(phone);
        }

        return {
            sessionLabel,
            summary: {
                totalGroups: enrichedGroups.length,
                realEstateGroups: enrichedGroups.filter((group) => String((group as any).classification || '') === 'business' || group.signalScore >= 55).length,
                uniqueParticipants: uniquePhones.size,
                duplicateParticipants: duplicatePhonesWorkspace.size,
                overlappingParticipants: duplicatePhonesWorkspace.size,
                duplicateParticipantRate: uniquePhones.size > 0 ? Math.round((duplicatePhonesWorkspace.size / uniquePhones.size) * 100) : 0,
                overlappingParticipantRate: uniquePhones.size > 0 ? Math.round((duplicatePhonesWorkspace.size / uniquePhones.size) * 100) : 0,
                averageChaosScore: average(enrichedGroups.map((group) => group.chaosScore)),
                averageSignalScore: average(enrichedGroups.map((group) => group.signalScore)),
            },
            groups: enrichedGroups,
        };
    }

    async rescanGroups(workspaceOwnerId: string, sessionLabel: string) {
        const groups = (await whatsappGroupService.listGroups(workspaceOwnerId, { includeArchived: false }))
            .filter((group) => String(group.sessionLabel || '') === sessionLabel);

        for (const group of groups) {
            const groupId = String(group.id || '');
            await whatsappGroupService.updateGroup(workspaceOwnerId, groupId, {
                isParsing: true,
                visibilityStatus: 'visible',
            });
        }

        try {
            await brokerContactSyncService.syncFromStoredGroups(workspaceOwnerId, {
                sessionLabel,
            });
        } catch (syncError) {
            console.warn('[GroupAudit] Broker contact sync failed after rescan:', syncError);
        }

        return { totalGroups: groups.length };
    }
}

export const groupAuditService = new GroupAuditService();
