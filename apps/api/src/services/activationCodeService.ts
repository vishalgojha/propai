import crypto from 'crypto';
import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin || supabase;

const CODE_PREFIX = 'PROP-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_BODY_LENGTH = 8;
const CODE_EXPIRY_HOURS = 48;
const CODE_PATTERN = /^PROP-[A-Z0-9]{8}$/;

function generateCodeString(): string {
    let result = '';
    for (let i = 0; i < CODE_BODY_LENGTH; i++) {
        result += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    }
    return `${CODE_PREFIX}${result}`;
}

export type ActivationCodeRow = {
    id: string;
    code: string;
    tenant_id: string;
    context_type: string;
    context_id: string | null;
    status: 'pending' | 'activated' | 'expired';
    created_at: string;
    expires_at: string;
    activated_at: string | null;
    activated_phone: string | null;
};

export type ActivationCodeResult = {
    code: string;
    deepLink: string;
    expiresAt: string;
};

export class ActivationCodeService {
    isActivationCode(text: string): boolean {
        return CODE_PATTERN.test(String(text || '').trim().toUpperCase());
    }

    async generateCode(
        tenantId: string,
        contextType: string = 'broker_onboarding',
        contextId?: string,
        wabaPhoneNumber?: string,
    ): Promise<ActivationCodeResult> {
        let code: string;
        let attempts = 0;

        do {
            code = generateCodeString();
            const { data: existing } = await db
                .from('whatsapp_activation_codes')
                .select('id')
                .eq('code', code)
                .maybeSingle();
            if (!existing) break;
            attempts++;
        } while (attempts < 10);

        const expiresAt = new Date(Date.now() + CODE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
        const now = new Date().toISOString();

        const { error } = await db.from('whatsapp_activation_codes').insert({
            code,
            tenant_id: tenantId,
            context_type: contextType,
            context_id: contextId || null,
            status: 'pending',
            expires_at: expiresAt,
            created_at: now,
            updated_at: now,
        });

        if (error) {
            throw new Error(`Failed to create activation code: ${error.message}`);
        }

        const deepLink = wabaPhoneNumber
            ? this.buildDeepLink(wabaPhoneNumber, code)
            : '';

        return { code, deepLink, expiresAt };
    }

    async validateCode(code: string): Promise<ActivationCodeRow | null> {
        const { data, error } = await db
            .from('whatsapp_activation_codes')
            .select('*')
            .eq('code', code)
            .eq('status', 'pending')
            .maybeSingle();

        if (error || !data) return null;

        const row = data as ActivationCodeRow;

        if (new Date(row.expires_at) < new Date()) {
            await db.from('whatsapp_activation_codes')
                .update({ status: 'expired', updated_at: new Date().toISOString() })
                .eq('id', row.id);
            return null;
        }

        return row;
    }

    async activateCode(code: string, phone: string): Promise<boolean> {
        const now = new Date().toISOString();
        const { error } = await db
            .from('whatsapp_activation_codes')
            .update({
                status: 'activated',
                activated_at: now,
                activated_phone: phone,
                updated_at: now,
            })
            .eq('code', code)
            .eq('status', 'pending');

        return !error;
    }

    async linkBrokerPhone(tenantId: string, phone: string): Promise<void> {
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 10) return;

        const formattedPhone = digits.length > 10 ? digits : `91${digits}`;

        try {
            await db.from('broker_contacts').upsert({
                tenant_id: tenantId,
                phone: formattedPhone,
                display_name: `WhatsApp User (${formattedPhone.slice(-10)})`,
                last_seen_at: new Date().toISOString(),
            }, { onConflict: 'tenant_id,phone', ignoreDuplicates: false });
        } catch {
            // broker_contacts upsert is non-critical
        }
    }

    buildDeepLink(phoneNumber: string, code: string): string {
        const cleanPhone = phoneNumber.replace(/\D/g, '');
        const message = encodeURIComponent(`Hi Pulse! My activation code is ${code}`);
        return `https://wa.me/${cleanPhone}?text=${message}`;
    }
}

export const activationCodeService = new ActivationCodeService();
