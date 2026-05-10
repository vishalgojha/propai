import { Request, Response } from 'express';

export const speak = async (req: Request, res: Response) => {
    res.status(501).json({
        error: 'Voice synthesis is disabled in this deployment.',
    });
};

export const listen = async (req: Request, res: Response) => {
    res.status(501).json({
        error: 'Voice transcription is disabled in this deployment.',
    });
};
