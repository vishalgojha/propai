import { Router } from 'express';
import { requestVerification, verifyPhone } from '../controllers/authController';

const router = Router();

router.post('/request-verification', requestVerification);
router.post('/verify', verifyPhone);

export default router;
