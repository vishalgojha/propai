import { Router } from 'express';
import { addWorkspaceMember, getWorkspaceMetadata, getWorkspaceOverview, saveWorkspaceMetadata, listWorkspaceActivity, listWorkspaceTeam, updateWorkspaceMember } from '../controllers/workspaceController';
import { ROUTE_PATHS } from './routePaths';

const router = Router();

router.get(ROUTE_PATHS.workspace.overview, getWorkspaceOverview);
router.get(ROUTE_PATHS.workspace.metadata, getWorkspaceMetadata);
router.post(ROUTE_PATHS.workspace.metadata, saveWorkspaceMetadata);
router.get(ROUTE_PATHS.workspace.team, listWorkspaceTeam);
router.post(ROUTE_PATHS.workspace.team, addWorkspaceMember);
router.patch(ROUTE_PATHS.workspace.updateMember, updateWorkspaceMember);
router.get(ROUTE_PATHS.workspace.activity, listWorkspaceActivity);

export default router;
