import { Router } from 'express';
import { ingestListings } from '../controllers/ingestController';

const router = Router();

router.post('/', ingestListings);

export default router;
