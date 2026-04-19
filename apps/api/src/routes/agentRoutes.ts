import { Router } from 'express';
import { handleWebTool } from '../controllers/agentController';

const router = Router();

router.post('/tool/web_fetch', handleWebTool); // Generic handler for web tools

export default router;
