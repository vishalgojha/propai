import { Router } from 'express';
import { handleWebTool } from '../controllers/agentController';
import { handleLeadStorage } from '../controllers/leadStorageController';
import { ROUTE_PATHS } from './routePaths';

const router = Router();

router.post(ROUTE_PATHS.agent.webFetch, handleWebTool); // Generic handler for web tools
router.post(ROUTE_PATHS.agent.storeLeads, handleLeadStorage);

export default router;
