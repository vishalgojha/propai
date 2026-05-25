import { Request, Response } from 'express';
import { browserToolService } from '../services/browserToolService';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { agentControlService } from '../services/agentControlService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';

export const handleWebTool = async (req: Request, res: Response) => {
    const { tool, args } = req.body;

    try {
        const result = await browserToolService.execute(tool, args || {});
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const controlBrowser = async (req: Request, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const message = String(req.body?.message || '').trim();
    const pathname = String(req.body?.pathname || '/').trim() || '/';
    const sessionId = String(req.body?.sessionId || '').trim();

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
    }

    try {
        const context = await workspaceAccessService.resolveContext(req.user);
        const plan = await agentControlService.planActions(message, pathname, context.workspaceOwnerId);
        await agentControlService.broadcastSequence(sessionId, plan);
        return res.json({
            planned: true,
            stepCount: plan.steps.length,
            summary: plan.summary,
        });
    } catch (error) {
        return res.status(getErrorStatus(error)).json({
            error: getErrorMessage(error, 'Failed to plan browser control sequence'),
        });
    }
};
