import { Router } from 'express';
import { heartbeat, getStatus, semanticSearch, generateEmbedding, marketStats } from '../controllers/scraperController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post('/heartbeat', heartbeat);
router.get('/status', authMiddleware, getStatus);
router.post('/semantic-search', semanticSearch);
router.post('/embed', generateEmbedding);
router.get('/market-stats', marketStats);

export default router;
