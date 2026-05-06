import { Router } from 'express';
import { getWorkspaceSettings, saveWorkspaceSettings } from '../controllers/settingsController';

const router = Router();

router.get('/', getWorkspaceSettings);
router.post('/', saveWorkspaceSettings);

export default router;
