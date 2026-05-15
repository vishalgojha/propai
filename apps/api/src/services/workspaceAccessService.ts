import { supabase, supabaseAdmin } from '../config/supabase';

const db = supabaseAdmin || supabase;

const OWNER_SUPER_ADMIN_EMAILS = new Set([
    'vishal@chaoscraftlabs.com',
    'vishal@chaoscraftslabs.com',
]);

export type WorkspaceMemberRole = 'owner' | 'admin' | 'realtor' | 'ops' | 'viewer';

export type WorkspaceContext = {
    workspaceOwnerId: string;
    workspaceOwnerEmail: string | null;
    currentUserId: string;
    currentUserEmail: string | null;
    isWorkspaceOwner: boolean;
    isSuperAdmin: boolean;
    memberRole: WorkspaceMemberRole;
    canManageTeam: boolean;
    canSendOutbound: boolean;
};

type AuthUserLike = {
    id?: string | null;
    email?: string | null;
};

function normalizeEmail(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

export class WorkspaceAccessService {
    async resolveContext(user: AuthUserLike): Promise<WorkspaceContext> {
        const currentUserId = String(user?.id || '').trim();
        const currentUserEmail = normalizeEmail(user?.email);

        if (!currentUserId) {
            throw new Error('Authenticated user is required');
        }

        if (OWNER_SUPER_ADMIN_EMAILS.has(currentUserEmail)) {
            return {
                workspaceOwnerId: currentUserId,
                workspaceOwnerEmail: currentUserEmail,
                currentUserId,
                currentUserEmail,
                isWorkspaceOwner: true,
                isSuperAdmin: true,
                memberRole: 'owner',
                canManageTeam: true,
                canSendOutbound: true,
            };
        }

        const byUserId = await db
            .from('workspace_members')
            .select('workspace_owner_id, member_user_id, member_email, role, status')
            .eq('member_user_id', currentUserId)
            .in('status', ['invited', 'active'])
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (byUserId.error) {
            throw byUserId.error;
        }

        if (byUserId.data?.workspace_owner_id) {
            if (byUserId.data.status !== 'active') {
                await db
                    .from('workspace_members')
                    .update({
                        status: 'active',
                        joined_at: new Date().toISOString(),
                        last_active_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('workspace_owner_id', byUserId.data.workspace_owner_id)
                    .eq('member_user_id', currentUserId);
            } else {
                await db
                    .from('workspace_members')
                    .update({
                        last_active_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('workspace_owner_id', byUserId.data.workspace_owner_id)
                    .eq('member_user_id', currentUserId);
            }

            return {
                workspaceOwnerId: String(byUserId.data.workspace_owner_id),
                workspaceOwnerEmail: null,
                currentUserId,
                currentUserEmail,
                isWorkspaceOwner: false,
                isSuperAdmin: false,
                memberRole: (byUserId.data.role || 'realtor') as WorkspaceMemberRole,
                canManageTeam: byUserId.data.role === 'admin',
                canSendOutbound: byUserId.data.role !== 'viewer',
            };
        }

        if (currentUserEmail) {
            const byEmail = await db
                .from('workspace_members')
                .select('workspace_owner_id, member_email, role, status')
                .eq('member_email', currentUserEmail)
                .in('status', ['invited', 'active'])
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (byEmail.error) {
                throw byEmail.error;
            }

            if (byEmail.data?.workspace_owner_id) {
                await db
                    .from('workspace_members')
                    .update({
                        member_user_id: currentUserId,
                        status: 'active',
                        joined_at: new Date().toISOString(),
                        last_active_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('workspace_owner_id', byEmail.data.workspace_owner_id)
                    .eq('member_email', currentUserEmail);

                return {
                    workspaceOwnerId: String(byEmail.data.workspace_owner_id),
                    workspaceOwnerEmail: null,
                    currentUserId,
                    currentUserEmail,
                    isWorkspaceOwner: false,
                    isSuperAdmin: false,
                    memberRole: (byEmail.data.role || 'realtor') as WorkspaceMemberRole,
                    canManageTeam: byEmail.data.role === 'admin',
                    canSendOutbound: byEmail.data.role !== 'viewer',
                };
            }
        }

        return {
            workspaceOwnerId: currentUserId,
            workspaceOwnerEmail: currentUserEmail,
            currentUserId,
            currentUserEmail,
            isWorkspaceOwner: true,
            isSuperAdmin: false,
            memberRole: 'owner',
            canManageTeam: true,
            canSendOutbound: true,
        };
    }

    async requireWorkspaceAdmin(user: AuthUserLike) {
        const context = await this.resolveContext(user);
        if (!context.canManageTeam) {
            const error = new Error('Workspace admin access required');
            (error as any).statusCode = 403;
            throw error;
        }

        return context;
    }

    async requireOutboundAccess(user: AuthUserLike) {
        const context = await this.resolveContext(user);
        if (!context.canSendOutbound) {
            const error = new Error('Your workspace role is read-only and cannot send outbound messages');
            (error as any).statusCode = 403;
            throw error;
        }

        return context;
    }
}

export const workspaceAccessService = new WorkspaceAccessService();
