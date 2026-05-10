import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { supabase, supabaseAdmin } from '../config/supabase';
import { referralService } from '../services/referralService';
import { workspaceAccessService } from '../services/workspaceAccessService';
import { workspaceActivityService } from '../services/workspaceActivityService';
import { getErrorMessage, getErrorStatus } from '../utils/controllerHelpers';
import '../types/express';

const db = supabaseAdmin || supabase;
const WORKSPACE_METADATA_FILE = path.join(process.cwd(), 'data', 'workspace-metadata.json');

type WorkspaceServiceAreaInput = {
    city: string;
    locality: string;
    priority?: number;
};

type StoredWorkspaceMetadata = Record<string, {
    agencyName: string | null;
    primaryCity: string | null;
    serviceAreas: Array<{ city: string; locality: string; priority: number }>;
    updatedAt: string | null;
}>;

function isMissingWorkspaceMetadataRelationError(error: unknown) {
    const err = error as { message?: string; code?: string } | null;
    const message = String(err?.message || '').toLowerCase();
    return err?.code === '42P01' || message.includes('schema cache') || message.includes('does not exist');
}

async function readWorkspaceMetadataStore(): Promise<StoredWorkspaceMetadata> {
    try {
        const raw = await fs.readFile(WORKSPACE_METADATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            return parsed as StoredWorkspaceMetadata;
        }
    } catch {
        // ignore missing/invalid file
    }

    return {};
}

async function writeWorkspaceMetadataStore(store: StoredWorkspaceMetadata) {
    await fs.mkdir(path.dirname(WORKSPACE_METADATA_FILE), { recursive: true });
    await fs.writeFile(WORKSPACE_METADATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

export const getWorkspaceOverview = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});

        const [ownerResult, membersResult] = await Promise.all([
            db
                .from('profiles')
                .select('id, email, full_name, phone')
                .eq('id', context.workspaceOwnerId)
                .maybeSingle(),
            db
                .from('workspace_members')
                .select('id, member_email, member_name, member_phone, role, status, invited_at, joined_at, last_active_at')
                .eq('workspace_owner_id', context.workspaceOwnerId)
                .order('invited_at', { ascending: false }),
        ]);

        if (ownerResult.error) throw ownerResult.error;
        if (membersResult.error) throw membersResult.error;

        res.json({
            success: true,
            workspace: {
                ownerId: context.workspaceOwnerId,
                ownerEmail: ownerResult.data?.email || context.currentUserEmail,
                ownerName: ownerResult.data?.full_name || null,
                memberRole: context.memberRole,
                isWorkspaceOwner: context.isWorkspaceOwner,
                canManageTeam: context.canManageTeam,
                canSendOutbound: context.canSendOutbound,
                teamSize: (membersResult.data || []).length + 1,
            },
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load workspace overview') });
    }
};

export const getWorkspaceMetadata = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const store = await readWorkspaceMetadataStore();
        const fallback = store[context.workspaceOwnerId] || {
            agencyName: null,
            primaryCity: null,
            serviceAreas: [],
            updatedAt: null,
        };

        const [workspaceResult, areasResult] = await Promise.all([
            db
                .from('workspaces')
                .select('owner_id, agency_name, primary_city, created_at, updated_at')
                .eq('owner_id', context.workspaceOwnerId)
                .maybeSingle(),
            db
                .from('workspace_service_areas')
                .select('city, locality, priority')
                .eq('workspace_id', context.workspaceOwnerId)
                .order('priority', { ascending: false })
                .order('locality', { ascending: true }),
        ]);

        const workspaceMissing = isMissingWorkspaceMetadataRelationError(workspaceResult.error);
        const areasMissing = isMissingWorkspaceMetadataRelationError(areasResult.error);

        if (workspaceResult.error && !workspaceMissing) throw workspaceResult.error;
        if (areasResult.error && !areasMissing) throw areasResult.error;

        if (workspaceMissing || areasMissing) {
            return res.json({
                success: true,
                workspace: {
                    ownerId: context.workspaceOwnerId,
                    memberRole: context.memberRole,
                    canManageTeam: context.canManageTeam,
                    canSendOutbound: context.canSendOutbound,
                },
                metadata: fallback,
                legacyStorage: true,
            });
        }

        const dbMetadata = {
            agencyName: workspaceResult.data?.agency_name || null,
            primaryCity: workspaceResult.data?.primary_city || null,
            serviceAreas: (areasResult.data || []).map((row: { city: string | null; locality: string | null; priority: number | null }) => ({
                city: String(row.city || '').trim(),
                locality: String(row.locality || '').trim(),
                priority: Number(row.priority || 0),
            })),
            updatedAt: workspaceResult.data?.updated_at || null,
        };

        const metadata = {
            agencyName: dbMetadata.agencyName || fallback.agencyName || null,
            primaryCity: dbMetadata.primaryCity || fallback.primaryCity || null,
            serviceAreas: dbMetadata.serviceAreas.length > 0 ? dbMetadata.serviceAreas : fallback.serviceAreas,
            updatedAt: dbMetadata.updatedAt || fallback.updatedAt || null,
        };

        res.json({
            success: true,
            workspace: {
                ownerId: context.workspaceOwnerId,
                memberRole: context.memberRole,
                canManageTeam: context.canManageTeam,
                canSendOutbound: context.canSendOutbound,
            },
            metadata,
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load workspace metadata') });
    }
};

export const getWorkspaceReferral = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const actor = req.user;
        const summary = await referralService.getSummary(
            context.workspaceOwnerId,
            actor?.email || null,
            (typeof actor?.user_metadata?.full_name === 'string' ? actor.user_metadata.full_name : null),
        );

        res.json({
            success: true,
            referral: summary,
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load referral summary') });
    }
};

export const saveWorkspaceMetadata = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.requireWorkspaceAdmin(req.user ?? {});
        const agencyName = String(req.body?.agencyName || '').trim() || null;
        const primaryCity = String(req.body?.primaryCity || '').trim() || null;
        const serviceAreas = Array.isArray(req.body?.serviceAreas) ? req.body.serviceAreas as WorkspaceServiceAreaInput[] : [];

        if (agencyName && agencyName.length > 80) {
            return res.status(400).json({ error: 'Agency name is too long.' });
        }

        if (primaryCity && primaryCity.length > 60) {
            return res.status(400).json({ error: 'Primary city is too long.' });
        }

        const cleanedAreas = serviceAreas
            .map((area) => ({
                city: String(area?.city || '').trim(),
                locality: String(area?.locality || '').trim(),
                priority: Number.isFinite(Number(area?.priority)) ? Number(area?.priority) : 0,
            }))
            .filter((area) => area.city && area.locality)
            .slice(0, 60);
        const store = await readWorkspaceMetadataStore();

        const now = new Date().toISOString();
        const { error: upsertError } = await db
            .from('workspaces')
            .upsert({
                owner_id: context.workspaceOwnerId,
                agency_name: agencyName,
                primary_city: primaryCity,
                updated_at: now,
            }, { onConflict: 'owner_id' });

        const missingWorkspaceTable = isMissingWorkspaceMetadataRelationError(upsertError);
        if (upsertError && !missingWorkspaceTable) throw upsertError;

        let missingServiceAreasTable = false;
        if (!missingWorkspaceTable) {
            const { error: deleteError } = await db
                .from('workspace_service_areas')
                .delete()
                .eq('workspace_id', context.workspaceOwnerId);

            missingServiceAreasTable = isMissingWorkspaceMetadataRelationError(deleteError);
            if (deleteError && !missingServiceAreasTable) throw deleteError;

            if (!missingServiceAreasTable && cleanedAreas.length > 0) {
                const { error: insertError } = await db
                    .from('workspace_service_areas')
                    .insert(cleanedAreas.map((area) => ({
                        workspace_id: context.workspaceOwnerId,
                        city: area.city,
                        locality: area.locality,
                        priority: area.priority,
                        created_at: now,
                        updated_at: now,
                    })));

                if (insertError && !isMissingWorkspaceMetadataRelationError(insertError)) throw insertError;
                if (isMissingWorkspaceMetadataRelationError(insertError)) {
                    missingServiceAreasTable = true;
                }
            }
        }

        store[context.workspaceOwnerId] = {
            agencyName,
            primaryCity,
            serviceAreas: cleanedAreas,
            updatedAt: now,
        };
        await writeWorkspaceMetadataStore(store);

        void workspaceActivityService.track({
            actor: req.user,
            workspaceOwnerId: context.workspaceOwnerId,
            actorRole: context.memberRole,
            eventType: 'workspace.metadata.updated',
            entityType: 'workspace',
            entityId: context.workspaceOwnerId,
            summary: `Updated workspace metadata (${agencyName || 'Agency'}).`,
            metadata: {
                agencyName,
                primaryCity,
                serviceAreasCount: cleanedAreas.length,
            },
        });

        res.json({
            success: true,
            metadata: {
                agencyName,
                primaryCity,
                serviceAreas: cleanedAreas,
                updatedAt: now,
            },
            legacyStorage: missingWorkspaceTable || missingServiceAreasTable,
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to save workspace metadata') });
    }
};

export const listWorkspaceTeam = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});

        const [ownerResult, membersResult] = await Promise.all([
            db
                .from('profiles')
                .select('id, email, full_name, phone')
                .eq('id', context.workspaceOwnerId)
                .maybeSingle(),
            db
                .from('workspace_members')
                .select('id, member_user_id, member_email, member_name, member_phone, role, status, invited_at, joined_at, last_active_at, updated_at')
                .eq('workspace_owner_id', context.workspaceOwnerId)
                .order('invited_at', { ascending: false }),
        ]);

        if (ownerResult.error) throw ownerResult.error;
        if (membersResult.error) throw membersResult.error;

        const members = (membersResult.data || []).map((member: { id: string; member_user_id: string | null; member_email: string; member_name: string | null; member_phone: string | null; role: string; status: string; invited_at: string | null; joined_at: string | null; last_active_at: string | null; updated_at: string | null }) => ({
            id: member.id,
            userId: member.member_user_id || null,
            email: member.member_email,
            fullName: member.member_name || null,
            phone: member.member_phone || null,
            role: member.role,
            status: member.status,
            invitedAt: member.invited_at || null,
            joinedAt: member.joined_at || null,
            lastActiveAt: member.last_active_at || null,
            updatedAt: member.updated_at || null,
        }));

        res.json({
            success: true,
            workspace: {
                ownerId: context.workspaceOwnerId,
                ownerEmail: ownerResult.data?.email || context.currentUserEmail,
                ownerName: ownerResult.data?.full_name || null,
                memberRole: context.memberRole,
                isWorkspaceOwner: context.isWorkspaceOwner,
                canManageTeam: context.canManageTeam,
                canSendOutbound: context.canSendOutbound,
            },
            members,
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load workspace team') });
    }
};

export const addWorkspaceMember = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.requireWorkspaceAdmin(req.user ?? {});
        const memberEmail = String(req.body?.email || '').trim().toLowerCase();
        const fullName = String(req.body?.fullName || '').trim() || null;
        const phone = String(req.body?.phone || '').split('').filter(c => c >= '0' && c <= '9').join('') || null;
        const role = String(req.body?.role || 'realtor').trim().toLowerCase();

        if (!memberEmail) {
            return res.status(400).json({ error: 'Member email is required' });
        }

        if (!['admin', 'realtor', 'ops', 'viewer'].includes(role)) {
            return res.status(400).json({ error: 'Invalid team role' });
        }

        const profileLookup = await db
            .from('profiles')
            .select('id, email, full_name, phone')
            .eq('email', memberEmail)
            .maybeSingle();

        if (profileLookup.error) {
            throw profileLookup.error;
        }

        const now = new Date().toISOString();
        const payload = {
            workspace_owner_id: context.workspaceOwnerId,
            member_user_id: profileLookup.data?.id || null,
            member_email: memberEmail,
            member_name: fullName || profileLookup.data?.full_name || null,
            member_phone: phone || profileLookup.data?.phone || null,
            role,
            status: profileLookup.data?.id ? 'active' : 'invited',
            invited_by: context.currentUserId,
            invited_at: now,
            joined_at: profileLookup.data?.id ? now : null,
            last_active_at: profileLookup.data?.id ? now : null,
            updated_at: now,
        };

        const { data, error } = await db
            .from('workspace_members')
            .upsert(payload, { onConflict: 'workspace_owner_id,member_email' })
            .select('id, member_user_id, member_email, member_name, member_phone, role, status, invited_at, joined_at, last_active_at, updated_at')
            .single();

        if (error || !data) {
            throw error || new Error('Failed to save workspace member');
        }

        await workspaceActivityService.track({
            actor: req.user,
            workspaceOwnerId: context.workspaceOwnerId,
            actorRole: context.memberRole,
            eventType: 'workspace.member.added',
            entityType: 'workspace_member',
            entityId: data.id,
            summary: `Added ${data.member_email} to the workspace as ${data.role}.`,
            metadata: {
                memberEmail: data.member_email,
                role: data.role,
                status: data.status,
            },
        });

        res.json({
            success: true,
            member: {
                id: data.id,
                userId: data.member_user_id || null,
                email: data.member_email,
                fullName: data.member_name || null,
                phone: data.member_phone || null,
                role: data.role,
                status: data.status,
                invitedAt: data.invited_at || null,
                joinedAt: data.joined_at || null,
                lastActiveAt: data.last_active_at || null,
                updatedAt: data.updated_at || null,
            },
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to add workspace member') });
    }
};

export const updateWorkspaceMember = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.requireWorkspaceAdmin(req.user ?? {});
        const memberId = String(req.params.memberId || '').trim();
        if (!memberId) {
            return res.status(400).json({ error: 'Workspace member ID is required' });
        }

        const patch: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };

        if (req.body?.fullName !== undefined) patch.member_name = String(req.body.fullName || '').trim() || null;
        if (req.body?.phone !== undefined) patch.member_phone = String(req.body.phone || '').split('').filter(c => c >= '0' && c <= '9').join('') || null;
        if (req.body?.role !== undefined) {
            const role = String(req.body.role || '').trim().toLowerCase();
            if (!['admin', 'realtor', 'ops', 'viewer'].includes(role)) {
                return res.status(400).json({ error: 'Invalid team role' });
            }
            patch.role = role;
        }
        if (req.body?.status !== undefined) {
            const status = String(req.body.status || '').trim().toLowerCase();
            if (!['invited', 'active', 'inactive'].includes(status)) {
                return res.status(400).json({ error: 'Invalid member status' });
            }
            patch.status = status;
        }

        const { data, error } = await db
            .from('workspace_members')
            .update(patch)
            .eq('workspace_owner_id', context.workspaceOwnerId)
            .eq('id', memberId)
            .select('id, member_user_id, member_email, member_name, member_phone, role, status, invited_at, joined_at, last_active_at, updated_at')
            .single();

        if (error || !data) {
            throw error || new Error('Failed to update workspace member');
        }

        await workspaceActivityService.track({
            actor: req.user,
            workspaceOwnerId: context.workspaceOwnerId,
            actorRole: context.memberRole,
            eventType: 'workspace.member.updated',
            entityType: 'workspace_member',
            entityId: data.id,
            summary: `Updated ${data.member_email} (${data.role}, ${data.status}).`,
            metadata: {
                memberEmail: data.member_email,
                role: data.role,
                status: data.status,
            },
        });

        res.json({
            success: true,
            member: {
                id: data.id,
                userId: data.member_user_id || null,
                email: data.member_email,
                fullName: data.member_name || null,
                phone: data.member_phone || null,
                role: data.role,
                status: data.status,
                invitedAt: data.invited_at || null,
                joinedAt: data.joined_at || null,
                lastActiveAt: data.last_active_at || null,
                updatedAt: data.updated_at || null,
            },
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to update workspace member') });
    }
};

export const listWorkspaceActivity = async (req: Request, res: Response) => {
    try {
        const context = await workspaceAccessService.resolveContext(req.user ?? {});
        const limit = Math.max(10, Math.min(200, Number(req.query.limit || 80)));
        const activity = await workspaceActivityService.list(context.workspaceOwnerId, limit);

        res.json({
            success: true,
            workspace: {
                ownerId: context.workspaceOwnerId,
                memberRole: context.memberRole,
                canManageTeam: context.canManageTeam,
                canSendOutbound: context.canSendOutbound,
            },
            activity,
        });
    } catch (error: unknown) {
        res.status(getErrorStatus(error)).json({ error: getErrorMessage(error, 'Failed to load workspace activity') });
    }
};
