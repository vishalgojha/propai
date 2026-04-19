import { Router } from 'express';
import { speak, listen } from '../controllers/voiceController';

const router = Router();

router.post('/speak', speak);
router.post('/listen', listen);

export default router;
