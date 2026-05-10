import { Router } from 'express';
import { getOnboarding, saveOnboarding } from '../controllers/identityController';

const router = Router();

router.get('/onboarding', getOnboarding);
router.post('/onboarding', saveOnboarding);

export default router;
