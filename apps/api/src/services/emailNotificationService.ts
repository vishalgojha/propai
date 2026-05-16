type EmailPayload = {
    from?: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    replyTo?: string | null;
};

type EmailSendResult =
    | { success: true }
    | { skipped: true }
    | { success: false; error: unknown };

type WelcomeEmailInput = {
    to: string;
    fullName?: string | null;
    phone?: string | null;
};

type WhatsAppStatusEmailInput = {
    to: string;
    fullName?: string | null;
    phoneNumber?: string | null;
    label?: string | null;
    status: 'connected' | 'disconnected';
};

type CrashReportInput = {
    subject: string;
    error: string;
    context?: Record<string, any>;
};

class EmailNotificationService {
    private readonly apiKey = process.env.RESEND_API_KEY || '';
    private readonly from = process.env.EMAIL_FROM || process.env.RESEND_FROM || 'hello@propai.live';
    private readonly replyTo = process.env.EMAIL_REPLY_TO || 'hello@propai.live';
    private readonly appUrl = process.env.APP_URL || 'https://app.propai.live';

    isConfigured() {
        return Boolean(this.apiKey && this.from);
    }

    async sendWelcomeEmail(input: WelcomeEmailInput): Promise<EmailSendResult> {
        const name = this.getFirstName(input.fullName);
        const dashboardUrl = `${this.appUrl}/whatsapp`;

        const text = [
            `Hi ${name},`,
            '',
            'Thanks for signing up. I wanted to send you a quick personal note about what you just joined and what happens next.',
            '',
            'PropAI connects you directly with buyers and renters looking for exactly what you have listed. Your WhatsApp listings get surfaced across Mumbai\'s busiest property search channels — not in days, but within minutes of you posting.',
            '',
            'Here\'s what\'s ready for you:',
            '  - Your listings are already being indexed and searchable on PropAI\'s public site',
            '  - When a buyer wants to connect, they reach you directly on WhatsApp — no lead forms, no delays',
            '  - You can manage everything from the dashboard: ' + dashboardUrl,
            '',
            'Next step: Set up your WhatsApp connection so we can start pulling your listings automatically. It takes about a minute.',
            '',
            '→ ' + dashboardUrl,
            '',
            'If you have questions or want to understand how the matching works, just reply to this email. I read every response.',
            '',
            '- Vishal',
            'Founder, PropAI',
        ].join('\n');

        const html = `
            <div style="font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#1a1a2e;max-width:560px;margin:0 auto">
                <div style="background:#0d1117;border-radius:16px;padding:32px;border:1px solid #243040">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px">
                        <div style="width:8px;height:8px;border-radius:50%;background:#25d366"></div>
                        <span style="font-weight:600;font-size:15px;color:#e2e8f0">PropAI</span>
                    </div>

                    <p style="font-size:15px;margin:0 0 16px;color:#e2e8f0">Hi ${this.escapeHtml(name)},</p>

                    <p style="font-size:14px;margin:0 0 16px;color:#94a3b8;line-height:1.65">
                        Thanks for signing up. I wanted to send you a quick personal note about what you just joined and what happens next.
                    </p>

                    <p style="font-size:14px;margin:0 0 16px;color:#94a3b8;line-height:1.65">
                        PropAI connects you directly with buyers and renters looking for exactly what you have listed. Your WhatsApp listings get surfaced across Mumbai's busiest property search channels — not in days, but within minutes of you posting.
                    </p>

                    <div style="background:#121a24;border-radius:12px;border:1px solid #243040;padding:16px;margin:20px 0">
                        <p style="font-size:13px;font-weight:600;margin:0 0 12px;color:#e2e8f0">Here's what's ready for you:</p>
                        <ul style="font-size:13px;color:#94a3b8;line-height:1.6;margin:0;padding-left:16px">
                            <li>Your listings are already being indexed and searchable on PropAI's public site</li>
                            <li>When a buyer wants to connect, they reach you directly on WhatsApp — no lead forms, no delays</li>
                            <li>You can manage everything from the dashboard</li>
                        </ul>
                    </div>

                    <p style="font-size:14px;margin:0 0 16px;color:#94a3b8;line-height:1.65">
                        <strong style="color:#e2e8f0">Next step:</strong> Set up your WhatsApp connection so we can start pulling your listings automatically. It takes about a minute.
                    </p>

                    <a href="${dashboardUrl}" style="display:inline-block;background:#25d366;color:#000;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:12px;margin:8px 0 20px">
                        Set up WhatsApp →
                    </a>

                    <p style="font-size:14px;margin:0 0 16px;color:#94a3b8;line-height:1.65">
                        If you have questions or want to understand how the matching works, just reply to this email. I read every response.
                    </p>

                    <div style="border-top:1px solid #243040;padding-top:16px;margin-top:20px">
                        <p style="font-size:14px;margin:0;color:#e2e8f0">- Vishal</p>
                        <p style="font-size:12px;margin:4px 0 0;color:#64748b">Founder, PropAI</p>
                    </div>
                </div>
            </div>
        `;

        return this.sendEmail({
            from: 'Vishal from PropAI <vishal@propai.live>',
            to: input.to,
            subject: 'Welcome to PropAI — here\'s what you just joined',
            text,
            html,
        });
    }

    async sendCrashReport(input: CrashReportInput): Promise<EmailSendResult> {
        const contextLine = input.context ? `\nContext: ${JSON.stringify(input.context, null, 2)}` : '';
        return this.sendEmail({
            to: 'support@propai.live',
            subject: input.subject,
            text: [
                `Crash Report`,
                ``,
                `Error: ${input.error}`,
                contextLine,
                ``,
                `Time: ${new Date().toISOString()}`,
            ].join('\n'),
            html: `
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
                    <h2>Crash Report</h2>
                    <p><strong>Error:</strong> ${this.escapeHtml(input.error)}</p>
                    ${input.context ? `<pre>${this.escapeHtml(JSON.stringify(input.context, null, 2))}</pre>` : ''}
                    <p><strong>Time:</strong> ${new Date().toISOString()}</p>
                </div>
            `,
        });
    }

    async sendWhatsAppStatusEmail(input: WhatsAppStatusEmailInput): Promise<EmailSendResult> {
        const name = this.getFirstName(input.fullName);
        const subject = input.status === 'connected'
            ? 'Your WhatsApp is now connected to PropAI Pulse'
            : 'Your WhatsApp connection was disconnected from PropAI Pulse';
        const statusLine = input.status === 'connected'
            ? 'Your WhatsApp session is now connected and ready inside PropAI Pulse.'
            : 'Your WhatsApp session is currently disconnected inside PropAI Pulse.';
        const deviceLine = input.phoneNumber
            ? `Connected number: ${input.phoneNumber}`
            : 'We could not confirm the active number from the runtime snapshot.';
        const labelLine = input.label ? `Workspace device label: ${input.label}` : null;
        const whatsappUrl = `${this.appUrl}/whatsapp`;

        return this.sendEmail({
            to: input.to,
            subject,
            text: [
                `Hi ${name},`,
                '',
                statusLine,
                deviceLine,
                labelLine,
                `Manage WhatsApp here: ${whatsappUrl}`,
                '',
                'If this was unexpected, please send a screenshot to hello@propai.live.',
                '',
                'Team PropAI',
            ].filter(Boolean).join('\n'),
            html: `
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
                    <p>Hi ${this.escapeHtml(name)},</p>
                    <p>${this.escapeHtml(statusLine)}</p>
                    <p>${this.escapeHtml(deviceLine)}</p>
                    ${labelLine ? `<p>${this.escapeHtml(labelLine)}</p>` : ''}
                    <p><a href="${whatsappUrl}">Manage WhatsApp</a></p>
                    <p>If this was unexpected, please send a screenshot to <a href="mailto:hello@propai.live">hello@propai.live</a>.</p>
                    <p>Team PropAI</p>
                </div>
            `,
        });
    }

    private async sendEmail(payload: EmailPayload): Promise<EmailSendResult> {
        if (!this.isConfigured()) {
            console.warn('[EmailNotificationService] Email provider not configured (RESEND_API_KEY or EMAIL_FROM missing), skipping email:', payload.subject);
            return { skipped: true };
        }

        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: payload.from || this.from,
                    to: [payload.to],
                    subject: payload.subject,
                    text: payload.text,
                    html: payload.html,
                    reply_to: payload.replyTo || this.replyTo,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`Resend request failed with ${response.status}: ${errorText}`);
            }

            return { success: true };
        } catch (error) {
            console.error('[EmailNotificationService] Failed to send email:', error);
            return { success: false, error };
        }
    }

    private getFirstName(fullName?: string | null) {
        const trimmed = (fullName || '').trim();
        return trimmed ? trimmed.split(/\s+/)[0] : 'there';
    }

    private escapeHtml(value: string) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

export const emailNotificationService = new EmailNotificationService();
