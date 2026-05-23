import { Router } from 'express';
import { intelligenceHandler } from '../controllers/analyticsController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.get('/intelligence', authMiddleware, intelligenceHandler);

export default router;
