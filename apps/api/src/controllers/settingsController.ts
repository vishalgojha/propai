import { Request, Response } from 'express';
import { keyService } from '../services/keyService';
import { getWorkspaceSettingsRecord, saveWorkspaceSettingsRecord } from '../services/workspaceSettingsService';
import { pushRecentAction } from '../services/identityService';
import { workspaceAccessService } from '../services/workspaceAccessService';

export const getWorkspaceSettings = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;

    const record = await getWorkspaceSettingsRecord(tenantId);
    const [concentrateKeys, geminiKeys, groqKeys, openRouterKeys, doublewordKeys] = await Promise.all([
        keyService.getKeys(tenantId, 'Concentrate'),
        keyService.getKeys(tenantId, 'Google'),
        keyService.getKeys(tenantId, 'Groq'),
        keyService.getKeys(tenantId, 'OpenRouter'),
        keyService.getKeys(tenantId, 'Doubleword'),
    ]);

    res.json({
        settings: record.settings,
        aiKeys: {
            concentrate: concentrateKeys.length ? concentrateKeys.join('\n') : record.aiKeys.concentrate || '',
            gemini: geminiKeys.length ? geminiKeys.join('\n') : record.aiKeys.gemini || '',
            groq: groqKeys.length ? groqKeys.join('\n') : record.aiKeys.groq || '',
            openrouter: openRouterKeys.length ? openRouterKeys.join('\n') : record.aiKeys.openrouter || '',
            doubleword: doublewordKeys.length ? doublewordKeys.join('\n') : record.aiKeys.doubleword || '',
        },
    });
};

export const saveWorkspaceSettings = async (req: Request, res: Response) => {
    const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
    const tenantId = context.workspaceOwnerId;
    const { settings = {}, aiKeys = {} } = req.body || {};

    await saveWorkspaceSettingsRecord(tenantId, settings, aiKeys);

    const keyResults: Array<{ success: boolean; error?: string }> = await Promise.all([
        aiKeys.concentrate ? keyService.saveKey(tenantId, 'Concentrate', aiKeys.concentrate) : Promise.resolve({ success: true }),
        aiKeys.gemini ? keyService.saveKey(tenantId, 'Google', aiKeys.gemini) : Promise.resolve({ success: true }),
        aiKeys.groq ? keyService.saveKey(tenantId, 'Groq', aiKeys.groq) : Promise.resolve({ success: true }),
        aiKeys.openrouter ? keyService.saveKey(tenantId, 'OpenRouter', aiKeys.openrouter) : Promise.resolve({ success: true }),
        aiKeys.doubleword ? keyService.saveKey(tenantId, 'Doubleword', aiKeys.doubleword) : Promise.resolve({ success: true }),
    ]);

    const failedWrite = keyResults.find((result) => !result.success);
    if (failedWrite) {
        return res.status(500).json({
            success: false,
            error: failedWrite.error || 'Failed to persist AI API key',
        });
    }

    void pushRecentAction(tenantId, `Updated workspace settings / AI keys`);

    res.json({ success: true });
};
