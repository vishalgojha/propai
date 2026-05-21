import { Router } from 'express';
import { subscribePush, unsubscribePush } from '../controllers/notificationController';
import { ROUTE_PATHS } from './routePaths';

const router = Router();

router.post(ROUTE_PATHS.notifications.subscribe, subscribePush);
router.post(ROUTE_PATHS.notifications.unsubscribe, unsubscribePush);

export default router;
