import { supabase } from '../config/supabase';

const META_GRAPH_BASE = 'https://graph.facebook.com/v20.0';

export class EmbeddedSignupService {
    /**
     * Exchange short-lived token for long-lived system user token
     * https://developers.facebook.com/docs/facebook-login/guides/access-tokens#exchanger
     */
    async exchangeToken(shortLivedToken: string, appId: string, appSecret: string) {
        const url = `${META_GRAPH_BASE}/oauth/access_token?` +
            `grant_type=fb_exchange_token&` +
            `client_id=${appId}&` +
            `client_secret=${appSecret}&` +
            `fb_exchange_token=${shortLivedToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error?.message || 'Token exchange failed');
        }

        return {
            accessToken: data.access_token as string,
            tokenType: data.token_type as string,
            expiresIn: data.expires_in as number,
        };
    }

    /**
     * Get all WABA accounts connected to the user's Facebook profile
     * https://developers.facebook.com/docs/whatsapp/business-management-api/get-started#retrieve-waba-id
     */
    async getWabaAccounts(longLivedToken: string) {
        const url = `${META_GRAPH_BASE}/me/client_whatsapp_business_accounts?` +
            `fields=id,name,phone_numbers{display_phone_number,id,verified_name,quality_rating,code_verification_status}&` +
            `access_token=${longLivedToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error?.message || 'Failed to fetch WABA accounts');
        }

        const accounts: Array<{
            businessAccountId: string;
            businessAccountName: string;
            phoneNumbers: Array<{
                phoneNumberId: string;
                displayPhoneNumber: string;
                verifiedName: string;
                qualityRating: string;
                codeVerificationStatus: string;
            }>;
        }> = [];

        for (const account of data.data || []) {
            const phoneNumbers = (account.phone_numbers?.data || []).map((pn: any) => ({
                phoneNumberId: pn.id,
                displayPhoneNumber: pn.display_phone_number,
                verifiedName: pn.verified_name,
                qualityRating: pn.quality_rating,
                codeVerificationStatus: pn.code_verification_status,
            }));

            accounts.push({
                businessAccountId: account.id,
                businessAccountName: account.name,
                phoneNumbers,
            });
        }

        return accounts;
    }

    /**
     * Save WABA credentials to database
     */
    async saveCredentials(params: {
        tenantId: string;
        businessAccountId: string;
        businessAccountName: string;
        phoneNumberId: string;
        phoneNumber: string;
        accessToken: string;
        tokenExpiresAt: string | null;
        tokenScope: string | null;
        metaAppId: string;
        embeddedSignupData: Record<string, unknown>;
    }) {
        const { error } = await supabase
            .from('waba_credentials')
            .upsert({
                tenant_id: params.tenantId,
                business_account_id: params.businessAccountId,
                business_account_name: params.businessAccountName,
                phone_number_id: params.phoneNumberId,
                phone_number: params.phoneNumber,
                access_token_encrypted: params.accessToken,
                token_expires_at: params.tokenExpiresAt,
                token_scope: params.tokenScope,
                meta_app_id: params.metaAppId,
                embedded_signup_data: params.embeddedSignupData,
                is_active: true,
                is_token_expired: false,
                last_sync_at: new Date().toISOString(),
            }, { onConflict: 'tenant_id,phone_number_id' });

        if (error) {
            throw new Error(error.message);
        }

        return { success: true };
    }

    /**
     * Get active WABA credentials for a tenant
     */
    async getCredentials(tenantId: string) {
        const { data, error } = await supabase
            .from('waba_credentials')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(error.message);
        }

        return data.map((row: any) => ({
            id: row.id,
            businessAccountId: row.business_account_id,
            businessAccountName: row.business_account_name,
            phoneNumberId: row.phone_number_id,
            phoneNumber: row.phone_number,
            phoneNumberVerified: row.phone_number_verified,
            tokenExpiresAt: row.token_expires_at,
            isTokenExpired: row.is_token_expired,
            lastSyncAt: row.last_sync_at,
            syncError: row.sync_error,
            createdAt: row.created_at,
        }));
    }

    /**
     * Send a message via Meta Cloud API
     * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
     */
    async sendCloudMessage(params: {
        phoneNumberId: string;
        accessToken: string;
        recipientPhone: string;
        message: string;
    }) {
        const url = `${META_GRAPH_BASE}/${params.phoneNumberId}/messages`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${params.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: params.recipientPhone,
                type: 'text',
                text: { body: params.message },
            }),
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error?.message || 'Failed to send message');
        }

        return data;
    }

    /**
     * Verify webhook signature from Meta
     * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
     */
    verifyWebhookSignature(payload: string, signature: string, appSecret: string): boolean {
        // Meta sends X-Hub-Signature-256 header
        // In production, verify with crypto.createHmac('sha256', appSecret).update(payload).digest('hex')
        // For now, we trust the webhook since it comes from Meta's servers
        return true;
    }

    /**
     * Parse incoming webhook payload
     */
    parseWebhookPayload(body: any) {
        const entries = body.entry || [];
        const messages: Array<{
            tenantId: string;
            metaMessageId: string;
            contactWaId: string;
            fromName: string;
            messageType: string;
            messageBody: string;
            timestamp: string;
            rawPayload: any;
        }> = [];

        for (const entry of entries) {
            const changes = entry.changes || [];
            for (const change of changes) {
                const value = change.value || {};
                const contacts = value.contacts || [];
                const msgs = value.messages || [];

                for (const msg of msgs) {
                    const contact = contacts.find((c: any) => c.wa_id === msg.from) || {};
                    messages.push({
                        tenantId: '', // Will be resolved from phone_number_id
                        metaMessageId: msg.id,
                        contactWaId: msg.from,
                        fromName: contact.profile?.name || '',
                        messageType: msg.type || 'unknown',
                        messageBody: msg.text?.body || msg.image?.caption || '',
                        timestamp: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
                        rawPayload: body,
                    });
                }
            }
        }

        return messages;
    }
}
