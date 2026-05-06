import { Router } from 'express';
import { parseBroadcast } from '../controllers/broadcastController';
import { ROUTE_PATHS } from './routePaths';

const router = Router();

router.post(ROUTE_PATHS.broadcast.parse, parseBroadcast);

export default router;
