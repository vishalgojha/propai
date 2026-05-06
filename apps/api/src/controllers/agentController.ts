import { Request, Response } from 'express';
import { browserToolService } from '../services/browserToolService';

export const handleWebTool = async (req: Request, res: Response) => {
    const { tool, args } = req.body;

    try {
        const result = await browserToolService.execute(tool, args || {});
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
