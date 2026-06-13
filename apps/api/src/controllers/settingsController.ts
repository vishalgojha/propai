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
    const [geminiKeys, groqKeys, openRouterKeys, doublewordKeys, geminiMeta, groqMeta, openRouterMeta, doublewordMeta] = await Promise.all([
        keyService.getKeys(tenantId, 'Google'),
        keyService.getKeys(tenantId, 'Groq'),
        keyService.getKeys(tenantId, 'OpenRouter'),
        keyService.getKeys(tenantId, 'Doubleword'),
        keyService.getKeyMeta(tenantId, 'Google'),
        keyService.getKeyMeta(tenantId, 'Groq'),
        keyService.getKeyMeta(tenantId, 'OpenRouter'),
        keyService.getKeyMeta(tenantId, 'Doubleword'),
    ]);

    res.json({
        settings: record.settings,
        aiKeys: {
            gemini: geminiKeys.join('\n'),
            groq: groqKeys.join('\n'),
            openrouter: openRouterKeys.join('\n'),
            doubleword: doublewordKeys.join('\n'),
        },
        keyMeta: {
            gemini: geminiMeta,
            groq: groqMeta,
            openrouter: openRouterMeta,
            doubleword: doublewordMeta,
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
    ]);
    const shouldResetUsage =
        (typeof aiKeys.gemini === 'string' && normalizeKeyPayload(aiKeys.gemini) !== existingKeys[0].join('\n')) ||
        (typeof aiKeys.groq === 'string' && normalizeKeyPayload(aiKeys.groq) !== existingKeys[1].join('\n')) ||
        (typeof aiKeys.openrouter === 'string' && normalizeKeyPayload(aiKeys.openrouter) !== existingKeys[2].join('\n')) ||
        (typeof aiKeys.doubleword === 'string' && normalizeKeyPayload(aiKeys.doubleword) !== existingKeys[3].join('\n'));

    await saveWorkspaceSettingsRecord(tenantId, settings, aiKeys);

    const keyResults: Array<{ success: boolean; error?: string }> = await Promise.all([
        aiKeys.gemini ? keyService.saveKey(tenantId, 'Google', aiKeys.gemini) : keyService.deleteKey(tenantId, 'Google'),
        aiKeys.groq ? keyService.saveKey(tenantId, 'Groq', aiKeys.groq) : keyService.deleteKey(tenantId, 'Groq'),
        aiKeys.openrouter ? keyService.saveKey(tenantId, 'OpenRouter', aiKeys.openrouter) : keyService.deleteKey(tenantId, 'OpenRouter'),
        aiKeys.doubleword ? keyService.saveKey(tenantId, 'Doubleword', aiKeys.doubleword) : keyService.deleteKey(tenantId, 'Doubleword'),
    ]);

    const failedWrite = keyResults.find((result) => !result.success);
    if (failedWrite) {
        return res.status(500).json({
            success: false,
            error: failedWrite.error || 'Failed to persist AI API key',
        });
    }

    let usageReset: { deletedCount: number } | null = null;
    if (shouldResetUsage) {
        usageReset = await aiUsageService.resetUsage(tenantId);
    }

    void pushRecentAction(tenantId, `Updated workspace settings / AI keys`);

    res.json({ success: true, usageReset });
};
