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
} from '../controllers/adminController';
import {
    listWorkspacesQuerySchema,
    updateSubscriptionBodySchema,
    updateGroupBodySchema,
    getAuditLogQuerySchema,
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

export default router;
