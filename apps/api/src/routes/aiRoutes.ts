import { Router } from 'express';
import { chat, getAIStatus, getModels, updateKey, testKey } from '../controllers/aiController';

const router = Router();

router.post('/chat', chat);
router.get('/status', getAIStatus);
router.get('/models', getModels);
router.post('/keys', updateKey);
router.post('/keys/test', testKey);

export default router;
