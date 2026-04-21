import { Router } from 'express';
import { requestVerification, verifyPhone } from '../controllers/authController';
import { sessionManager } from '../whatsapp/SessionManager';

const router = Router();

router.post('/request-verification', requestVerification);
router.post('/verify', verifyPhone);

router.get('/system-qr', async (req, res) => {
    const qr = sessionManager.getSystemQR();
    if (!qr) {
        return res.status(202).json({ qr: null, status: 'waiting', message: 'System session initializing, please retry in a few seconds' });
    }
    res.json({ qr, status: 'ready' });
});

router.get('/system-status', async (req, res) => {
    const status = await sessionManager.getSystemStatus();
    res.json(status);
});

export default router;
