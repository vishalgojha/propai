import { Router } from 'express';
import { speak, listen } from '../controllers/voiceController';
import { ROUTE_PATHS } from './routePaths';

const router = Router();

router.post(ROUTE_PATHS.voice.speak, speak);
router.post(ROUTE_PATHS.voice.listen, listen);

export default router;
