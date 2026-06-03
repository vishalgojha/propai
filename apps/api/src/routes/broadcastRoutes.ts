import { Router } from 'express';
import { parseBroadcast } from '../controllers/broadcastController';
import { authMiddleware } from '../middleware/authMiddleware';
import { ROUTE_PATHS } from './routePaths';
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  deleteCampaign,
  cancelCampaign,
  populateRecipients,
  startCampaign,
  getCampaignRecipients,
  getCampaignStats,
} from '../controllers/broadcastCampaignController';

const router = Router();

router.post(ROUTE_PATHS.broadcast.parse, parseBroadcast);

router.use(authMiddleware);

router.post(ROUTE_PATHS.broadcast.campaigns, createCampaign);
router.get(ROUTE_PATHS.broadcast.campaigns, listCampaigns);
router.get(ROUTE_PATHS.broadcast.campaignById, getCampaign);
router.delete(ROUTE_PATHS.broadcast.campaignById, deleteCampaign);
router.post(ROUTE_PATHS.broadcast.campaignCancel, cancelCampaign);
router.post(ROUTE_PATHS.broadcast.campaignPopulate, populateRecipients);
router.post(ROUTE_PATHS.broadcast.campaignStart, startCampaign);
router.get(ROUTE_PATHS.broadcast.campaignRecipients, getCampaignRecipients);
router.get(ROUTE_PATHS.broadcast.campaignStats, getCampaignStats);

export default router;
