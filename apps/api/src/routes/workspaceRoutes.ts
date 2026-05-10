import { Router } from 'express';
import { addWorkspaceMember, getWorkspaceMetadata, getWorkspaceOverview, getWorkspaceReferral, saveWorkspaceMetadata, listWorkspaceActivity, listWorkspaceTeam, updateWorkspaceMember } from '../controllers/workspaceController';
import { ROUTE_PATHS } from './routePaths';
import { validate } from '../middleware/validate';
import { saveWorkspaceMetadataSchema, addMemberSchema, updateMemberSchema } from '../schemas/workspaceSchemas';

const router = Router();

router.get(ROUTE_PATHS.workspace.overview, getWorkspaceOverview);
router.get(ROUTE_PATHS.workspace.metadata, getWorkspaceMetadata);
router.post(ROUTE_PATHS.workspace.metadata, validate(saveWorkspaceMetadataSchema), saveWorkspaceMetadata);
router.get(ROUTE_PATHS.workspace.referral, getWorkspaceReferral);
router.get(ROUTE_PATHS.workspace.team, listWorkspaceTeam);
router.post(ROUTE_PATHS.workspace.team, validate(addMemberSchema), addWorkspaceMember);
router.patch(ROUTE_PATHS.workspace.updateMember, validate(updateMemberSchema), updateWorkspaceMember);
router.get(ROUTE_PATHS.workspace.activity, listWorkspaceActivity);

export default router;
