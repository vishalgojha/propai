import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { uploadWorkspaceFile, listWorkspaceFiles, getWorkspaceFileText } from '../controllers/filesController';

const router = Router();

router.use(authMiddleware);

router.post('/upload', uploadWorkspaceFile);
router.get('/', listWorkspaceFiles);
router.get('/:fileId/text', getWorkspaceFileText);

export default router;

