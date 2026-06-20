import { Router } from 'express';
import { attachStreamItemToChannel, correctStreamItem, createChannel, deleteChannel, listChannels, listInboxMatches, listStreamItems, listStreamSummary, markChannelRead, rebuildStream, getAnalytics } from '../controllers/channelController';
import { ROUTE_PATHS } from './routePaths';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

router.get(ROUTE_PATHS.channels.root, listChannels);
router.post(ROUTE_PATHS.channels.root, createChannel);
router.get(ROUTE_PATHS.channels.inbox, listInboxMatches);
router.get(ROUTE_PATHS.channels.stream, listStreamItems);
router.get(ROUTE_PATHS.channels.streamSummary, listStreamSummary);
router.post(ROUTE_PATHS.channels.rebuild, rebuildStream);
router.post(ROUTE_PATHS.channels.correct, correctStreamItem);
router.post(ROUTE_PATHS.channels.markRead, markChannelRead);
router.post(ROUTE_PATHS.channels.attachItem, attachStreamItemToChannel);
router.delete(ROUTE_PATHS.channels.delete, deleteChannel);
router.get(ROUTE_PATHS.channels.analytics, getAnalytics);

export default router;
