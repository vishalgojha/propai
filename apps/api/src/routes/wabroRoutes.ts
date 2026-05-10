import { Router } from 'express';
import { ROUTE_PATHS } from './routePaths';
import {
  createCampaign,
  listCampaigns,
  getCampaign,
  updateCampaignStatus,
  deleteCampaign,
  scheduleCampaign,
  listContactLists,
  getContactsByList,
  addContacts,
  deleteContact,
  registerDevice,
  deviceHeartbeat,
  getPendingCampaigns,
  syncSendLogs,
  syncCampaignProgress,
  reportCrash,
  dashboardStats,
} from '../controllers/wabroController';
import { validate } from '../middleware/validate';
import {
  createCampaignSchema,
  updateCampaignStatusSchema,
  scheduleCampaignSchema,
  addContactsSchema,
  registerDeviceSchema,
  syncSendLogsSchema,
  syncCampaignProgressSchema,
} from '../schemas/wabroSchemas';

const router = Router();

// Campaigns
router.post(ROUTE_PATHS.wabro.campaigns, validate(createCampaignSchema), createCampaign);
router.get(ROUTE_PATHS.wabro.campaigns, listCampaigns);
router.get(ROUTE_PATHS.wabro.campaignById, getCampaign);
router.patch(ROUTE_PATHS.wabro.campaignStatus, validate(updateCampaignStatusSchema), updateCampaignStatus);
router.delete(ROUTE_PATHS.wabro.campaignById, deleteCampaign);
router.post(ROUTE_PATHS.wabro.campaignSchedule, validate(scheduleCampaignSchema), scheduleCampaign);

// Contacts / Lists
router.get(ROUTE_PATHS.wabro.contacts, listContactLists);
router.get(ROUTE_PATHS.wabro.contactsByList, getContactsByList);
router.post(ROUTE_PATHS.wabro.contacts, validate(addContactsSchema), addContacts);
router.delete('/contacts/:id', deleteContact);

// Device
router.post(ROUTE_PATHS.wabro.registerDevice, validate(registerDeviceSchema), registerDevice);
router.post(ROUTE_PATHS.wabro.deviceHeartbeat, deviceHeartbeat);

// App Polling
router.get(ROUTE_PATHS.wabro.pendingCampaigns, getPendingCampaigns);

// Sync
router.post(ROUTE_PATHS.wabro.syncLogs, validate(syncSendLogsSchema), syncSendLogs);
router.post(ROUTE_PATHS.wabro.syncCampaign, validate(syncCampaignProgressSchema), syncCampaignProgress);

// Crash
router.post(ROUTE_PATHS.wabro.crashLog, reportCrash);

// Dashboard Stats
router.get(ROUTE_PATHS.wabro.dashboardStats, dashboardStats);

export default router;
