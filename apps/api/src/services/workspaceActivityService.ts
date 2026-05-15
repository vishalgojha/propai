import { supabase, supabaseAdmin } from '../config/supabase';
import { workspaceAccessService } from './workspaceAccessService';

const db = supabaseAdmin || supabase;

type ActivityInput = {
    actor?: {
        id?: string | null;
        email?: string | null;
    };
    workspaceOwnerId?: string;
    actorName?: string | null;
    actorRole?: string | null;
    eventType: string;
    entityType?: string | null;
    entityId?: string | null;
    summary: string;
    metadata?: Record<string, unknown>;
};

export class WorkspaceActivityService {
    async track(input: ActivityInput) {
        try {
            const context = input.workspaceOwnerId
                ? {
                    workspaceOwnerId: input.workspaceOwnerId,
                    currentUserId: String(input.actor?.id || ''),
                    currentUserEmail: String(input.actor?.email || ''),
                    memberRole: input.actorRole || 'broker',
                }
                : await workspaceAccessService.resolveContext(input.actor || {});

            await db.from('workspace_activity_events').insert({
                workspace_owner_id: context.workspaceOwnerId,
                actor_user_id: input.actor?.id || null,
                actor_email: input.actor?.email || null,
                actor_name: input.actorName || input.actor?.email || 'Workspace user',
                actor_role: input.actorRole || context.memberRole || 'broker',
                event_type: input.eventType,
                entity_type: input.entityType || null,
                entity_id: input.entityId || null,
                summary: input.summary,
                metadata: input.metadata || {},
            });
        } catch (error) {
            console.error('[WorkspaceActivity] Failed to track activity:', error);
        }
    }

    async list(workspaceOwnerId: string, limit = 80) {
        const { data, error } = await db
            .from('workspace_activity_events')
            .select('*')
            .eq('workspace_owner_id', workspaceOwnerId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            throw error;
        }

        return data || [];
    }
}

export const workspaceActivityService = new WorkspaceActivityService();
