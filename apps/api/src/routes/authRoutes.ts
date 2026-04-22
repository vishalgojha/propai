import { Router } from 'express';
import { requestVerification, verifyPhone } from '../controllers/authController';
import { sessionManager } from '../whatsapp/SessionManager';
import { supabase } from '../config/supabase';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const router = Router();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mailgun.org',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

router.post('/request-verification', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
        const token = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        await supabase
            .from('profiles')
            .upsert({ phone: email, verification_token: token, phone_verified: false, updated_at: new Date().toISOString() }, { onConflict: 'phone' });

        await transporter.sendMail({
            from: process.env.EMAIL_FROM || 'PropAI <noreply@propai.live>',
            to: email,
            subject: 'Your PropAI verification code',
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #10b981;">PropAI Verification</h2>
                    <p>Your verification code is:</p>
                    <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; padding: 20px; background: #f3f4f6; border-radius: 8px; text-align: center; margin: 20px 0;">
                        ${token}
                    </div>
                    <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes.</p>
                    <p style="color: #6b7280; font-size: 12px;">If you didn't request this, ignore this email.</p>
                </div>
            `
        });

        res.json({ message: 'Verification code sent to your email' });
    } catch (error: any) {
        console.error('Email send error:', error);
        res.status(500).json({ error: 'Failed to send verification email' });
    }
});

router.post('/verify', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, verification_token, phone_verified')
        .eq('phone', email)
        .single();

    if (error || !profile) return res.status(400).json({ error: 'Profile not found' });

    if (profile.verification_token !== otp) {
        return res.status(400).json({ error: 'Invalid verification code' });
    }

    const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update({ phone_verified: true, verification_token: null })
        .eq('phone', email)
        .select()
        .single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    const { data: { session: supabaseSession }, error: sessionError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: email
    });

    res.json({ success: true, user: updated });
});

router.get('/system-qr', async (req, res) => {
    const qr = sessionManager.getSystemQR();
    if (!qr) {
        return res.status(202).json({ qr: null, status: 'waiting', message: 'System session initializing' });
    }
    res.json({ qr, status: 'ready' });
});

router.get('/system-status', async (req, res) => {
    const status = await sessionManager.getSystemStatus();
    res.json(status);
});

export default router;