type EmailPayload = {
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
        const phoneLine = input.phone ? `WhatsApp number on file: ${input.phone}` : 'You can add your WhatsApp number from the WhatsApp setup page anytime.';
        const whatsappUrl = `${this.appUrl}/whatsapp`;

        return this.sendEmail({
            to: input.to,
            subject: 'Welcome to PropAI Pulse',
            text: [
                `Hi ${name},`,
                '',
                'Welcome to PropAI Pulse.',
                'Your workspace is ready for saving listings, capturing requirements, and connecting WhatsApp.',
                phoneLine,
                `Set up WhatsApp here: ${whatsappUrl}`,
                '',
                'If anything feels off, reply to this email or write to hello@propai.live.',
                '',
                'Team PropAI',
            ].join('\n'),
            html: `
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
                    <p>Hi ${this.escapeHtml(name)},</p>
                    <p>Welcome to <strong>PropAI Pulse</strong>.</p>
                    <p>Your workspace is ready for saving listings, capturing requirements, and connecting WhatsApp.</p>
                    <p>${this.escapeHtml(phoneLine)}</p>
                    <p><a href="${whatsappUrl}">Set up WhatsApp</a></p>
                    <p>If anything feels off, reply to this email or write to <a href="mailto:hello@propai.live">hello@propai.live</a>.</p>
                    <p>Team PropAI</p>
                </div>
            `,
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
            console.log('[EmailNotificationService] Email provider not configured, skipping email:', payload.subject);
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
                    from: this.from,
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
