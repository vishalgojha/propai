import { Request, Response } from 'express';
import axios from 'axios';

const COQUI_URL = process.env.COQUI_TTS_URL || 'http://coqui-tts:5002';

export const speak = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const tenantId = user.id;
    const { text, speaker_id = 'p270' } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    try {
        const response = await axios({
            method: 'get',
            url: `${COQUI_URL}/api/tts`,
            params: { text, speaker_id },
            responseType: 'stream',
        });

        res.setHeader('Content-Type', 'audio/wav');
        response.data.pipe(res);
    } catch (error: any) {
        console.error('TTS Error:', error.message);
        res.status(500).json({ error: 'Failed to generate speech' });
    }
};

export const listen = async (req: Request, res: Response) => {
    res.status(503).json({
        error: 'Voice transcription is not configured yet.',
    });
};
