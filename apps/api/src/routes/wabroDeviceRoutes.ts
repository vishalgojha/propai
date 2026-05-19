import { Router } from 'express';
import { ROUTE_PATHS } from './routePaths';
import {
  registerDevice,
  deviceHeartbeat,
  getPendingCampaigns,
  syncSendLogs,
  syncCampaignProgress,
  reportMessageStatus,
  reportCrash,
} from '../controllers/wabroController';
import { validate } from '../middleware/validate';
import { wabroDeviceAuthMiddleware } from '../middleware/wabroDeviceAuthMiddleware';
import {
  registerDeviceSchema,
  reportMessageStatusSchema,
  syncSendLogsSchema,
  syncCampaignProgressSchema,
} from '../schemas/wabroSchemas';

const router = Router();

router.use(wabroDeviceAuthMiddleware);
router.post(ROUTE_PATHS.wabroDevice.register, validate(registerDeviceSchema), registerDevice);
router.post(ROUTE_PATHS.wabroDevice.heartbeat, deviceHeartbeat);
router.get(ROUTE_PATHS.wabroDevice.pendingCampaigns, getPendingCampaigns);
router.post(ROUTE_PATHS.wabroDevice.syncLogs, validate(syncSendLogsSchema), syncSendLogs);
router.post(ROUTE_PATHS.wabroDevice.syncCampaign, validate(syncCampaignProgressSchema), syncCampaignProgress);
router.post(ROUTE_PATHS.wabroDevice.statusEvents, validate(reportMessageStatusSchema), reportMessageStatus);
router.post(ROUTE_PATHS.wabroDevice.crashLog, reportCrash);

export default router;
