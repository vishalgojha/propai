import { Router } from 'express';
import { chat, getAIStatus } from '../controllers/aiController';

const router = Router();

router.post('/chat', chat);
router.get('/status', getAIStatus);

export default router;
