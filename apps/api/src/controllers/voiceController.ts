import { Request, Response } from 'express';

export const speak = async (req: Request, res: Response) => {
    res.status(501).json({
        error: 'Voice synthesis is not enabled in this deployment.',
        hint: 'Configure a TTS provider (e.g., ElevenLabs, OpenAI) and set the corresponding env vars to enable voice replies from Pulse.',
    });
};

export const listen = async (req: Request, res: Response) => {
    res.status(501).json({
        error: 'Voice transcription is not enabled in this deployment.',
        hint: 'Configure a STT provider (e.g., OpenAI Whisper, Groq Whisper) and set the corresponding env vars to enable voice messages from brokers.',
    });
};
