import { Router } from 'express';
import { listDmContacts, tagDmContact } from '../controllers/dmContactController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.get('/dm-contacts', authMiddleware, listDmContacts);
router.post('/dm-contacts/tag', authMiddleware, tagDmContact);

export default router;
