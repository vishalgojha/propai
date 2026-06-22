import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { supabaseAdmin } from '../config/supabase';
import { workspaceAccessService } from '../services/workspaceAccessService';

const router = Router();

async function getTokenHash(rawToken: string): Promise<string> {
    return `sha256:${crypto.createHash('sha256').update(rawToken).digest('hex')}`;
}

async function generateRawToken(): Promise<string> {
    return crypto.randomBytes(32).toString('hex');
}

router.post('/token', async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
        const tenantId = context.workspaceOwnerId;

        const rawToken = await generateRawToken();
        const hash = await getTokenHash(rawToken);

        const { error } = await supabaseAdmin!
            .from('api_keys')
            .upsert({
                tenant_id: tenantId,
                provider: 'propai_mcp',
                key: hash,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'tenant_id, provider' });

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json({ token: rawToken });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create MCP token';
        res.status(500).json({ error: message });
    }
});

router.delete('/token', async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
        const tenantId = context.workspaceOwnerId;

        const { error } = await supabaseAdmin!
            .from('api_keys')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('provider', 'propai_mcp');

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to revoke MCP token';
        res.status(500).json({ error: message });
    }
});

router.get('/token', async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext((req as any).user ?? {});
        const tenantId = context.workspaceOwnerId;

        const { data } = await supabaseAdmin!
            .from('api_keys')
            .select('updated_at')
            .eq('tenant_id', tenantId)
            .eq('provider', 'propai_mcp')
            .maybeSingle();

        res.json({ hasToken: Boolean(data), updatedAt: data?.updated_at || null });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to check MCP token';
        res.status(500).json({ error: message });
    }
});

export default router;
