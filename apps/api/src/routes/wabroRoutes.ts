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
  listDevices,
  createDeviceProvision,
  registerDevice,
  deviceHeartbeat,
  getPendingCampaigns,
  syncSendLogs,
  syncCampaignProgress,
  reportCrash,
  dashboardStats,
  getAppVersion,
  syncBrokerContacts,
  listBrokerContacts,
  listBroadcastLists,
  sendToBroadcastList,
  listAreas,
  sendMessage,
  sendMediaMessage,
  startCampaign,
  pauseCampaign,
  stopCampaign,
  getCampaignStatusEndpoint,
  uploadMediaHandler,
  getEvents,
  listGroups,
  getGroupParticipants,
} from '../controllers/wabroController';
import { validate } from '../middleware/validate';
import {
  createCampaignSchema,
  updateCampaignStatusSchema,
  scheduleCampaignSchema,
  addContactsSchema,
  createDeviceProvisionSchema,
  registerDeviceSchema,
  syncSendLogsSchema,
  syncCampaignProgressSchema,
  sendMessageSchema,
  sendMediaMessageSchema,
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
router.get(ROUTE_PATHS.wabro.devices, listDevices);
router.post(ROUTE_PATHS.wabro.deviceProvision, validate(createDeviceProvisionSchema), createDeviceProvision);
router.post(ROUTE_PATHS.wabro.registerDevice, validate(registerDeviceSchema), registerDevice);
router.post(ROUTE_PATHS.wabro.deviceHeartbeat, deviceHeartbeat);
router.get(ROUTE_PATHS.wabro.appVersion, getAppVersion);

// App Polling
router.get(ROUTE_PATHS.wabro.pendingCampaigns, getPendingCampaigns);

// Sync
router.post(ROUTE_PATHS.wabro.syncLogs, validate(syncSendLogsSchema), syncSendLogs);
router.post(ROUTE_PATHS.wabro.syncCampaign, validate(syncCampaignProgressSchema), syncCampaignProgress);

// Crash
router.post(ROUTE_PATHS.wabro.crashLog, reportCrash);

// Dashboard Stats
router.get(ROUTE_PATHS.wabro.dashboardStats, dashboardStats);

// Broker Contacts (Group Parsed)
router.post(ROUTE_PATHS.wabro.brokerContactsSync, syncBrokerContacts);
router.get(ROUTE_PATHS.wabro.brokerContacts, listBrokerContacts);

// Broadcast Lists
router.get(ROUTE_PATHS.wabro.broadcastLists, listBroadcastLists);
router.post(ROUTE_PATHS.wabro.broadcastListSend, sendToBroadcastList);

// Areas
router.get(ROUTE_PATHS.wabro.areas, listAreas);

// Campaign Lifecycle (Android app expects GET for status, POST for lifecycle actions)
router.get(ROUTE_PATHS.wabro.campaignStatus, getCampaignStatusEndpoint);
router.post(ROUTE_PATHS.wabro.campaignStart, startCampaign);
router.post(ROUTE_PATHS.wabro.campaignPause, pauseCampaign);
router.post(ROUTE_PATHS.wabro.campaignStop, stopCampaign);

// Message Sending (via connected WhatsApp session)
router.post(ROUTE_PATHS.wabro.messagesSend, validate(sendMessageSchema), sendMessage);
router.post(ROUTE_PATHS.wabro.messagesSendMedia, validate(sendMediaMessageSchema), sendMediaMessage);

// Media Upload
router.post(ROUTE_PATHS.wabro.mediaUpload, ...uploadMediaHandler);

// Events (Inbound Message Polling)
router.get(ROUTE_PATHS.wabro.events, getEvents);

// Groups
router.get(ROUTE_PATHS.wabro.groups, listGroups);
router.get(ROUTE_PATHS.wabro.groupParticipants, getGroupParticipants);

export default router;
