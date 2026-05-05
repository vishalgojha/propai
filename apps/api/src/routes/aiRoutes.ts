import { Router } from 'express';
import { getModels, updateKey, testKey } from '../controllers/aiController';

const router = Router();

router.get('/models', getModels);
router.post('/keys', updateKey);
router.post('/keys/test', testKey);

export default router;
