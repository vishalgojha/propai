import { Request, Response } from 'express';
import { keyService, parseApiKeys } from '../services/keyService';
import { aiUsageService } from '../services/aiUsageService';
import { getWorkspaceSettingsRecord, saveWorkspaceSettingsRecord } from '../services/workspaceSettingsService';
import { pushRecentAction } from '../services/identityService';
import { workspaceAccessService } from '../services/workspaceAccessService';

function normalizeKeyPayload(value: unknown) {
    return parseApiKeys(typeof value === 'string' ? value : '').join('\n');
}

export const getWorkspaceSettings = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;

    const record = await getWorkspaceSettingsRecord(tenantId);
    const [geminiKeys, groqKeys, openRouterKeys, doublewordKeys, nvidiaKeys, geminiMeta, groqMeta, openRouterMeta, doublewordMeta, nvidiaMeta] = await Promise.all([
        keyService.getKeys(tenantId, 'Google'),
        keyService.getKeys(tenantId, 'Groq'),
        keyService.getKeys(tenantId, 'OpenRouter'),
        keyService.getKeys(tenantId, 'Doubleword'),
        keyService.getKeys(tenantId, 'Nvidia'),
        keyService.getKeyMeta(tenantId, 'Google'),
        keyService.getKeyMeta(tenantId, 'Groq'),
        keyService.getKeyMeta(tenantId, 'OpenRouter'),
        keyService.getKeyMeta(tenantId, 'Doubleword'),
        keyService.getKeyMeta(tenantId, 'Nvidia'),
    ]);

    res.json({
        settings: record.settings,
        aiKeys: {
            gemini: geminiKeys.join('\n'),
            groq: groqKeys.join('\n'),
            openrouter: openRouterKeys.join('\n'),
            doubleword: doublewordKeys.join('\n'),
            nvidia: nvidiaKeys.join('\n'),
        },
        keyMeta: {
            gemini: geminiMeta,
            groq: groqMeta,
            openrouter: openRouterMeta,
            doubleword: doublewordMeta,
            nvidia: nvidiaMeta,
        },
    });
};

export const saveWorkspaceSettings = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;
    const { settings = {}, aiKeys = {} } = req.body || {};

    const existingKeys = await Promise.all([
        keyService.getKeys(tenantId, 'Google'),
        keyService.getKeys(tenantId, 'Groq'),
        keyService.getKeys(tenantId, 'OpenRouter'),
        keyService.getKeys(tenantId, 'Doubleword'),
        keyService.getKeys(tenantId, 'Nvidia'),
    ]);
    const shouldResetUsage =
        (typeof aiKeys.gemini === 'string' && normalizeKeyPayload(aiKeys.gemini) !== existingKeys[0].join('\n')) ||
        (typeof aiKeys.groq === 'string' && normalizeKeyPayload(aiKeys.groq) !== existingKeys[1].join('\n')) ||
        (typeof aiKeys.openrouter === 'string' && normalizeKeyPayload(aiKeys.openrouter) !== existingKeys[2].join('\n')) ||
        (typeof aiKeys.doubleword === 'string' && normalizeKeyPayload(aiKeys.doubleword) !== existingKeys[3].join('\n')) ||
        (typeof aiKeys.nvidia === 'string' && normalizeKeyPayload(aiKeys.nvidia) !== existingKeys[4].join('\n'));

    await saveWorkspaceSettingsRecord(tenantId, settings, aiKeys);

    const keyWrites = [
        { provider: 'Google', next: normalizeKeyPayload(aiKeys.gemini), existing: existingKeys[0].join('\n') },
        { provider: 'Groq', next: normalizeKeyPayload(aiKeys.groq), existing: existingKeys[1].join('\n') },
        { provider: 'OpenRouter', next: normalizeKeyPayload(aiKeys.openrouter), existing: existingKeys[2].join('\n') },
        { provider: 'Doubleword', next: normalizeKeyPayload(aiKeys.doubleword), existing: existingKeys[3].join('\n') },
        { provider: 'Nvidia', next: normalizeKeyPayload(aiKeys.nvidia), existing: existingKeys[4].join('\n') },
    ].filter((entry) => entry.next !== entry.existing);

    const keyResults: Array<{ success: boolean; error?: string }> = await Promise.all(
        keyWrites.map((entry) => entry.next
            ? keyService.saveKey(tenantId, entry.provider, entry.next)
            : keyService.deleteKey(tenantId, entry.provider)),
    );

    const failedWrite = keyResults.find((result) => !result.success);
    if (failedWrite) {
        return res.status(500).json({
            success: false,
            error: failedWrite.error || 'Failed to persist AI API key',
        });
    }

    if (shouldResetUsage) {
        void aiUsageService.resetUsage(tenantId).catch((error) => {
            console.error('[Settings] Failed to reset AI usage after key change', error);
        });
    }

    void pushRecentAction(tenantId, `Updated workspace settings / AI keys`);

    res.json({ success: true, usageResetScheduled: shouldResetUsage });
};
