import { Router } from 'express';
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

const router = Router();

// Workspace list (paginated, searchable)
router.get('/workspaces', listAdminWorkspaces);
router.post('/workspaces/:tenantId/subscription', updateWorkspaceSubscription);
router.get('/workspaces/:tenantId/groups', listWorkspaceGroups);
router.post('/workspaces/:tenantId/groups/:groupJid', updateWorkspaceGroup);

// Impersonation
router.post('/workspaces/:tenantId/impersonate', impersonateWorkspace);
router.get('/impersonation/resolve', resolveImpersonation);     // public — token is the auth
router.delete('/impersonation/:token', revokeImpersonation);
router.get('/impersonations', listImpersonations);

// Audit log
router.get('/audit', getAdminAuditLog);

export default router;
