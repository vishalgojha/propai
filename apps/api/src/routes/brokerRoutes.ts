import { Router } from 'express';
import { listBrokers, getBroker, getBrokerListings } from '../controllers/brokerController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.get('/brokers', authMiddleware, listBrokers);
router.get('/brokers/:phone', authMiddleware, getBroker);
router.get('/brokers/:phone/listings', authMiddleware, getBrokerListings);

export default router;
