import { Request, Response } from 'express';
import { getWhatsAppGateway } from '../channel-gateways/whatsapp/whatsappGatewayRegistry';
import { supabase } from '../config/supabase';
import crypto from 'crypto';
import { pushRecentAction } from '../services/identityService';

export const requestVerification = async (req: Request, res: Response) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    if (process.env.ENABLE_SYSTEM_WHATSAPP_SESSION !== 'true') {
        return res.status(503).json({
            error: 'WhatsApp phone verification is disabled on this deployment. Enable ENABLE_SYSTEM_WHATSAPP_SESSION=true to use it.',
        });
    }

    try {
        const token = crypto.randomBytes(32).toString('hex');
        
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .upsert({ phone, verification_token: token, phone_verified: false })
            .select()
            .single();

        if (profileError) throw profileError;

        const gateway = getWhatsAppGateway('system');
        await gateway.sendMessage({
            workspaceOwnerId: 'system',
            remoteJid: `${phone}@s.whatsapp.net`,
            text: `Welcome to PropAI! Your verification token is: ${token.substring(0, 6)}\n\nReply with YES to activate your account.`,
        });

        res.json({ message: 'Verification code sent to your WhatsApp' });
    } catch (error: any) {
        console.error('Verification Request Error:', error);
        res.status(500).json({ error: 'Failed to send verification message' });
    }
};

export const verifyPhone = async (req: Request, res: Response) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required' });

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('verification_token')
        .eq('phone', phone)
        .single();

    if (error || !profile) return res.status(400).json({ error: 'Profile not found' });

    const expectedToken = profile.verification_token?.substring(0, 6);
    if (otp.toLowerCase() !== expectedToken?.toLowerCase()) {
        return res.status(400).json({ error: 'Invalid verification token' });
    }

    const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update({ phone_verified: true, verification_token: null })
        .eq('phone', phone)
        .select()
        .single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    void pushRecentAction(updated.id, `Verified phone number`);

    res.json({ success: true, user: updated });
};
