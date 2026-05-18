import { Router } from 'express';
import { getPresenceStatus, postPresenceEvent } from '../controllers/whatsappController';

const router = Router();

router.get('/', getPresenceStatus);
router.post('/events', postPresenceEvent);

export default router;
