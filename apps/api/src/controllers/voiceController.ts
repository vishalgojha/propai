import { Request, Response } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const COQUI_URL = process.env.COQUI_TTS_URL || 'http://coqui-tts:5002';
const OLLAMA_URL = process.env.QWEN_BASE_URL?.replace('/api/chat', '') || 'http://ollama:11434';

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
    const user = (req as any).user;
    const tenantId = user.id;
    // We expect audio as a blob. For simplicity in this demo, we'll assume 
    // the client sends a file or raw buffer.
    try {
        const audioBuffer = req.body; // Assuming raw buffer from middleware
        
        const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: 'whisper',
            prompt: 'Transcribe this real estate conversation.',
            stream: false,
            images: [audioBuffer.toString('base64')] // Whisper in Ollama usually takes images/blobs
        });

        res.json({ transcript: response.data.response });
    } catch (error: any) {
        console.error('STT Error:', error.message);
        res.status(500).json({ error: 'Failed to transcribe audio' });
    }
};
