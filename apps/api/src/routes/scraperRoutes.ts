import { Router } from 'express';
import { heartbeat, getStatus } from '../controllers/scraperController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post('/heartbeat', heartbeat);
router.get('/status', authMiddleware, getStatus);

export default router;
