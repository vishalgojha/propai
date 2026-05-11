import { Router } from 'express';
import { chat, getHistory, getAIStatus, getModels, updateKey, testKey, propertySearch } from '../controllers/aiController';
import { ROUTE_PATHS } from './routePaths';

const router = Router();

router.post(ROUTE_PATHS.ai.chat, chat);
router.get(ROUTE_PATHS.ai.history, getHistory);
router.get(ROUTE_PATHS.ai.status, getAIStatus);
router.get(ROUTE_PATHS.ai.models, getModels);
router.post(ROUTE_PATHS.ai.keys, updateKey);
router.post(ROUTE_PATHS.ai.keysTest, testKey);
router.post(ROUTE_PATHS.ai.propertySearch, propertySearch);

export default router;
