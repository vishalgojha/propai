import { Request, Response } from 'express';
import { sessionManager } from '../whatsapp/SessionManager';
import { supabase } from '../config/supabase';
import crypto from 'crypto';

export const requestVerification = async (req: Request, res: Response) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    try {
        const token = crypto.randomBytes(32).toString('hex');
        
        // 1. Update or create profile with verification token
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .upsert({ phone, verification_token: token })
            .select()
            .single();

        if (profileError) throw profileError;

        // 2. Send WhatsApp message via system session
        const systemClient = await sessionManager.getSession('system');
        if (!systemClient) throw new Error('System session not available');

        await (systemClient as any).sendText(phone + '@s.whatsapp.net', 
            `Welcome to PropAI! Reply YES to verify your number and start your 7-day free trial. (Token: ${token.substring(0, 6)})`
        );

        res.json({ message: 'Verification message sent to WhatsApp' });
    } catch (error: any) {
        console.error('Verification Request Error:', error);
        res.status(500).json({ error: 'Failed to send verification message' });
    }
};

export const verifyPhone = async (req: Request, res: Response) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const { data, error } = await supabase
        .from('profiles')
        .update({ phone_verified: true })
        .eq('phone', phone)
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, user: data });
};
