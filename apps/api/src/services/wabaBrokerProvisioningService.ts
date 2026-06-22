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
        localities: string[];
        email: string;
    }): Promise<{ brokerId: string; dashboardLoginUrl: string | null }> {
        if (!supabaseAdmin) {
            throw new Error('Supabase service role is not configured');
        }

        const phone = nationalPhone(input.phone);
        if (phone.length !== 10) {
            throw new Error('A valid WhatsApp phone number is required');
        }

        const email = input.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error('A valid email address is required');
        }
        const localities = [...new Set(input.localities.map((locality) => locality.trim()).filter(Boolean))].slice(0, 30);
        if (localities.length === 0) {
            throw new Error('At least one operating locality is required');
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

        // The WhatsApp number is the verified onboarding channel. Email is collected
        // as the dashboard identity so a one-time browser login can be delivered back
        // over WhatsApp; it is not marked email-confirmed merely because it was typed.
        const { error: authEmailError } = await supabaseAdmin.auth.admin.updateUserById(brokerId, { email });
        if (authEmailError) throw authEmailError;

        const now = new Date().toISOString();
        const profileResult = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: brokerId,
                full_name: input.fullName.trim(),
                phone: `91${phone}`,
                email,
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
                inferred_areas: [input.city.trim()],
                source_groups: ['WABA onboarding'],
                group_count: 0,
                last_seen_at: now,
            }, { onConflict: 'tenant_id,phone' }),
        ]);
        if (identityResult.error) throw identityResult.error;
        if (workspaceResult.error) throw workspaceResult.error;
        if (contactResult.error) throw contactResult.error;

        const { error: clearAreasError } = await supabaseAdmin
            .from('workspace_service_areas')
            .delete()
            .eq('workspace_id', brokerId);
        if (clearAreasError) throw clearAreasError;

        const { error: insertAreasError } = await supabaseAdmin
            .from('workspace_service_areas')
            .insert(localities.map((locality, index) => ({
                workspace_id: brokerId,
                city: input.city.trim(),
                locality,
                priority: index,
                created_at: now,
                updated_at: now,
            })));
        if (insertAreasError) throw insertAreasError;

        await subscriptionService.ensureTrialSubscription(brokerId, null).catch((error) => {
            console.warn('[WabaBrokerProvisioning] Failed to initialise trial subscription', error);
        });

        const appUrl = (process.env.APP_URL || 'https://app.propai.live').replace(/\/$/, '');
        const { data: loginLink, error: loginLinkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: { redirectTo: `${appUrl}/auth/callback` },
        });
        if (loginLinkError) {
            console.warn('[WabaBrokerProvisioning] Could not generate dashboard login link', loginLinkError);
        }

        return {
            brokerId,
            dashboardLoginUrl: loginLink?.properties?.action_link || null,
        };
    }
}

export const wabaBrokerProvisioningService = new WabaBrokerProvisioningService();
