import { supabaseAdmin } from '../config/supabase';
import { subscriptionService } from './subscriptionService';
import { getPhoneOwnership } from './phoneOwnershipService';

function nationalPhone(value: string) {
    return String(value || '').replace(/\D/g, '').slice(-10);
}

export class WabaBrokerProvisioningService {
    async provision(input: {
        phone: string;
        fullName: string;
        agencyName: string;
        city: string;
    }): Promise<string> {
        if (!supabaseAdmin) {
            throw new Error('Supabase service role is not configured');
        }

        const phone = nationalPhone(input.phone);
        if (phone.length !== 10) {
            throw new Error('A valid WhatsApp phone number is required');
        }

        const existing = await getPhoneOwnership(phone);
        let brokerId = existing?.canonicalOwnerId || null;
        if (!brokerId) {
            const { data, error } = await supabaseAdmin.auth.admin.createUser({
                phone: `+91${phone}`,
                phone_confirm: true,
                user_metadata: {
                    full_name: input.fullName.trim(),
                    source: 'waba_onboarding',
                },
            });
            if (error || !data.user?.id) {
                throw new Error(error?.message || 'Could not create the WhatsApp broker account');
            }
            brokerId = data.user.id;
        }

        const now = new Date().toISOString();
        const profileResult = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: brokerId,
                full_name: input.fullName.trim(),
                phone: `91${phone}`,
                phone_verified: true,
                updated_at: now,
            }, { onConflict: 'id' });
        if (profileResult.error) throw profileResult.error;

        const [identityResult, workspaceResult, contactResult] = await Promise.all([
            supabaseAdmin.from('broker_identity').upsert({
                broker_id: brokerId,
                full_name: input.fullName.trim(),
                agency_name: input.agencyName.trim(),
                city: input.city.trim(),
                mobile: `91${phone}`,
                onboarding_completed: true,
                onboarding_step: 6,
                updated_at: now,
            }, { onConflict: 'broker_id' }),
            supabaseAdmin.from('workspaces').upsert({
                owner_id: brokerId,
                agency_name: input.agencyName.trim(),
                primary_city: input.city.trim(),
                updated_at: now,
            }, { onConflict: 'owner_id' }),
            supabaseAdmin.from('broker_contacts').upsert({
                tenant_id: brokerId,
                phone: `91${phone}`,
                display_name: input.fullName.trim(),
                last_seen_at: now,
            }, { onConflict: 'tenant_id,phone' }),
        ]);
        if (identityResult.error) throw identityResult.error;
        if (workspaceResult.error) throw workspaceResult.error;
        if (contactResult.error) throw contactResult.error;

        await subscriptionService.ensureTrialSubscription(brokerId, null).catch((error) => {
            console.warn('[WabaBrokerProvisioning] Failed to initialise trial subscription', error);
        });

        return brokerId;
    }
}

export const wabaBrokerProvisioningService = new WabaBrokerProvisioningService();
