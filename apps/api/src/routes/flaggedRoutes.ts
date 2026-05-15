import { Router } from 'express';
import { listFlaggedParses, reviewFlaggedParse, flaggedStats } from '../controllers/flaggedController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.get('/flagged', authMiddleware, listFlaggedParses);
router.post('/flagged/:id/review', authMiddleware, reviewFlaggedParse);
router.get('/flagged/stats', authMiddleware, flaggedStats);

export default router;
