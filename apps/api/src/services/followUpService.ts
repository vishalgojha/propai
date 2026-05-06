import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type FollowUpAction = 'call' | 'email' | 'visit';
type FollowUpStatus = 'pending' | 'completed' | 'cancelled';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wnrwntumacbirbndfvwg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

export class FollowUpService {
    private readonly admin: SupabaseClient;

    constructor() {
        this.admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || 'placeholder-service-key', {
            auth: { persistSession: false, autoRefreshToken: false },
        });
    }

    private requireServiceRole() {
        if (!SUPABASE_SERVICE_KEY) {
            throw new Error('Service role key is not configured');
        }
    }

    async scheduleCallback(tenantId: string, input: {
        lead_id?: string;
        lead_name: string;
        lead_phone?: string;
        action_type?: FollowUpAction;
        due_at?: string;
        notes?: string;
        priority_bucket?: 'P1' | 'P2' | 'P3';
    }) {
        this.requireServiceRole();

        const row = {
            tenant_id: tenantId,
            lead_id: input.lead_id || null,
            lead_name: input.lead_name,
            lead_phone: input.lead_phone || null,
            action_type: input.action_type || 'call',
            due_at: input.due_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            status: 'pending' as FollowUpStatus,
            notes: input.notes || null,
            priority_bucket: input.priority_bucket || null,
            updated_at: new Date().toISOString(),
        };

        const { error } = await this.admin
            .from('follow_up_tasks')
            .upsert(row, { onConflict: 'tenant_id,lead_id,action_type,due_at' });

        if (error) {
            return { status: 'failure' as const, error_message: error.message };
        }

        return { status: 'success' as const, scheduled: true, due_at: row.due_at };
    }

    async getPendingCallbacks(tenantId: string, limit = 10) {
        this.requireServiceRole();

        const { data, error } = await this.admin
            .from('follow_up_tasks')
            .select('id,lead_id,lead_name,lead_phone,action_type,due_at,status,notes,priority_bucket,created_at')
            .eq('tenant_id', tenantId)
            .eq('status', 'pending')
            .order('due_at', { ascending: true })
            .limit(limit);

        if (error) {
            throw new Error(error.message);
        }

        return data || [];
    }
}

export const followUpService = new FollowUpService();
