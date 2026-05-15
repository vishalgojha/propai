import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorkspaceSettings, saveWorkspaceSettings } from '../src/controllers/settingsController';
import { workspaceAccessService } from '../src/services/workspaceAccessService';
import { getWorkspaceSettingsRecord, saveWorkspaceSettingsRecord } from '../src/services/workspaceSettingsService';
import { keyService } from '../src/services/keyService';

vi.mock('../src/services/workspaceAccessService', () => ({
    workspaceAccessService: {
        resolveContext: vi.fn(),
    },
}));

vi.mock('../src/services/workspaceSettingsService', () => ({
    getWorkspaceSettingsRecord: vi.fn(),
    saveWorkspaceSettingsRecord: vi.fn(),
}));

vi.mock('../src/services/keyService', () => ({
    keyService: {
        getKeys: vi.fn(),
        saveKey: vi.fn(),
    },
}));

vi.mock('../src/services/identityService', () => ({
    pushRecentAction: vi.fn(),
}));

function createResponse() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
}

describe('settingsController workspace scoping', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (workspaceAccessService.resolveContext as any).mockResolvedValue({
            workspaceOwnerId: 'workspace-owner-1',
            currentUserId: 'member-1',
        });
    });

    it('loads settings and keys from the workspace owner context', async () => {
        const req = { user: { id: 'member-1', email: 'member@example.com' } } as any;
        const res = createResponse();

        (getWorkspaceSettingsRecord as any).mockResolvedValue({
            settings: { defaultModel: 'gemini-2.5-flash' },
            aiKeys: { gemini: 'fallback-key' },
        });
        (keyService.getKeys as any)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce(['google-live-key'])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        await getWorkspaceSettings(req, res as any);

        expect(getWorkspaceSettingsRecord).toHaveBeenCalledWith('workspace-owner-1');
        expect(keyService.getKeys).toHaveBeenCalledWith('workspace-owner-1', 'Google');
        expect(res.json).toHaveBeenCalledWith({
            settings: { defaultModel: 'gemini-2.5-flash' },
            aiKeys: {
                concentrate: '',
                gemini: 'google-live-key',
                groq: '',
                openrouter: '',
                doubleword: '',
            },
        });
    });

    it('saves settings and provider keys to the workspace owner context', async () => {
        const req = {
            user: { id: 'member-1', email: 'member@example.com' },
            body: {
                settings: { defaultModel: 'groq' },
                aiKeys: { groq: 'gsk_live_123' },
            },
        } as any;
        const res = createResponse();

        (saveWorkspaceSettingsRecord as any).mockResolvedValue(undefined);
        (keyService.saveKey as any).mockResolvedValue({ success: true });

        await saveWorkspaceSettings(req, res as any);

        expect(saveWorkspaceSettingsRecord).toHaveBeenCalledWith(
            'workspace-owner-1',
            { defaultModel: 'groq' },
            { groq: 'gsk_live_123' },
        );
        expect(keyService.saveKey).toHaveBeenCalledWith('workspace-owner-1', 'Groq', 'gsk_live_123');
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });
});
