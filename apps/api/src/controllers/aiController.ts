import { Request, Response } from 'express';
import { aiService } from '../services/aiService';
import { modelDiscoveryService } from '../services/modelDiscoveryService';
import { keyService } from '../services/keyService';

export const chat = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    const { prompt, modelPreference } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    try {
        const response = await aiService.chat(prompt, modelPreference, undefined, tenantId);
        res.json(response);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};


export const getAIStatus = async (req: Request, res: Response) => {
    const status = await aiService.getStatus();
    res.json(status);
};

export const getModels = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;

    try {
        const models = await modelDiscoveryService.discoverModels(tenantId);
        res.json(models);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateKey = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    const { provider, key } = req.body;
    if (!provider || !key) return res.status(400).json({ error: 'Provider and key are required' });

    try {
        const result = await keyService.saveKey(tenantId, provider, key);
        if (!result.success) return res.status(500).json({ error: result.error });
        res.json({ message: 'Key updated successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const testKey = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    const { provider } = req.body;
    if (!provider) return res.status(400).json({ error: 'Provider is required' });

    try {
        const result = await keyService.testConnection(tenantId, provider);
        if (!result.success) return res.status(400).json({ error: result.error });
        res.json({ message: 'Connected ✅' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
