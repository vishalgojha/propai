import { Request, Response } from 'express';
import { aiService } from '../services/aiService';

export const chat = async (req: Request, res: Response) => {
    const { prompt, modelPreference } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    try {
        const response = await aiService.chat(prompt, modelPreference);
        res.json(response);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getAIStatus = async (req: Request, res: Response) => {
    const status = await aiService.getStatus();
    res.json(status);
};
