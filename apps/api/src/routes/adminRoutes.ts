import { Router } from 'express';
import { validate } from '../middleware/validate';
import {
    listAdminWorkspaces,
    updateWorkspaceSubscription,
    listWorkspaceGroups,
    updateWorkspaceGroup,
    impersonateWorkspace,
    resolveImpersonation,
    revokeImpersonation,
    listImpersonations,
    getAdminAuditLog,
    backfillListings,
    backfillPublicListings,
    listScoutTasks,
    createScoutTask,
    updateScoutTask,
    deleteScoutTask,
    getParserEvidence,
} from '../controllers/adminController';
import {
    listWorkspacesQuerySchema,
    updateSubscriptionBodySchema,
    updateGroupBodySchema,
    getAuditLogQuerySchema,
    listScoutTasksQuerySchema,
    upsertScoutTaskBodySchema,
    scoutTaskIdParamSchema,
} from '../schemas/adminSchemas';

const router = Router();

// Workspace list (paginated, searchable)
router.get('/workspaces', validate(listWorkspacesQuerySchema, 'query'), listAdminWorkspaces);
router.post('/workspaces/:tenantId/subscription', validate(updateSubscriptionBodySchema), updateWorkspaceSubscription);
router.get('/workspaces/:tenantId/groups', listWorkspaceGroups);
router.post('/workspaces/:tenantId/groups/:groupJid', validate(updateGroupBodySchema), updateWorkspaceGroup);

// Impersonation
router.post('/workspaces/:tenantId/impersonate', impersonateWorkspace);
router.get('/impersonation/resolve', resolveImpersonation);     // public — token is the auth
router.delete('/impersonation/:token', revokeImpersonation);
router.get('/impersonations', listImpersonations);

// Audit log
router.get('/audit', validate(getAuditLogQuerySchema, 'query'), getAdminAuditLog);
router.get('/parser-evidence', getParserEvidence);

// Scout queue
router.get('/scout/tasks', validate(listScoutTasksQuerySchema, 'query'), listScoutTasks);
router.post('/scout/tasks', validate(upsertScoutTaskBodySchema), createScoutTask);
router.patch('/scout/tasks/:taskId', validate(scoutTaskIdParamSchema, 'params'), validate(upsertScoutTaskBodySchema), updateScoutTask);
router.delete('/scout/tasks/:taskId', validate(scoutTaskIdParamSchema, 'params'), deleteScoutTask);

// Backfill
router.post('/backfill/listings', backfillListings);
router.post('/backfill/public-listings', backfillPublicListings);

export default router;
