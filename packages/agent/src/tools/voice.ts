import { z } from 'zod';

export const VoiceTools = {
    speak: {
        description: 'Convert text to speech and play it to the broker. Use this to provide audio updates or alerts.',
        schema: z.object({
            text: z.string().describe('The text to be spoken'),
            speaker_id: z.string().optional().default('p270').describe('Voice ID'),
        }),
    },
    listen: {
        description: 'Activate the microphone to record the broker\'s voice and transcribe it.',
        schema: z.object({
            duration: z.number().optional().default(5).describe('Max recording duration in seconds'),
        }),
    },
};
