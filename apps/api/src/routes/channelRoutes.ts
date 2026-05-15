import { Router } from 'express';
import { attachStreamItemToChannel, correctStreamItem, createChannel, listChannels, listStreamItems, markChannelRead, rebuildStream, getAnalytics } from '../controllers/channelController';
import { ROUTE_PATHS } from './routePaths';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.get(ROUTE_PATHS.channels.root, listChannels);
router.post(ROUTE_PATHS.channels.root, createChannel);
router.get(ROUTE_PATHS.channels.stream, listStreamItems);
router.post(ROUTE_PATHS.channels.rebuild, rebuildStream);
router.post(ROUTE_PATHS.channels.correct, correctStreamItem);
router.post(ROUTE_PATHS.channels.markRead, markChannelRead);
router.post(ROUTE_PATHS.channels.attachItem, attachStreamItemToChannel);
router.get(ROUTE_PATHS.channels.analytics, getAnalytics);

export default router;
