import { Router } from 'express';
import {
    chat,
    getHistory,
    getAIStatus,
    getModels,
    updateKey,
    testKey,
    propertySearch,
    listSessions,
    createSession,
    renameSession,
    deleteSession,
    clearSession,
} from '../controllers/aiController';
import { ROUTE_PATHS } from './routePaths';

const router = Router();

router.post(ROUTE_PATHS.ai.chat, chat);
router.get(ROUTE_PATHS.ai.history, getHistory);
router.get(ROUTE_PATHS.ai.status, getAIStatus);
router.get(ROUTE_PATHS.ai.models, getModels);
router.post(ROUTE_PATHS.ai.keys, updateKey);
router.post(ROUTE_PATHS.ai.keysTest, testKey);
router.post(ROUTE_PATHS.ai.propertySearch, propertySearch);
router.get(ROUTE_PATHS.ai.sessions, listSessions);
router.post(ROUTE_PATHS.ai.sessions, createSession);
router.patch(ROUTE_PATHS.ai.sessionById, renameSession);
router.delete(ROUTE_PATHS.ai.sessionById, deleteSession);
router.post(ROUTE_PATHS.ai.sessionClear, clearSession);

export default router;
