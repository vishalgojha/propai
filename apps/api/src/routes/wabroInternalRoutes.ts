import { Router } from 'express';
import {
    runtimeBroadcastRequestSchema,
    runtimeSendMediaRequestSchema,
    runtimeSendMessageRequestSchema,
    runtimeSessionStatusQuerySchema,
    whatsappInboundMessagePayloadSchema,
    whatsappStatusPayloadSchema,
} from '../contracts/wabroContracts';
import { validate } from '../middleware/validate';
import { ROUTE_PATHS } from './routePaths';
import {
    receiveInboundEvent,
    receiveStatusEvent,
    runtimeBroadcast,
    runtimeSendMedia,
    runtimeSendMessage,
    runtimeSessionStatus,
} from '../controllers/wabroInternalController';

const router = Router();

router.post(ROUTE_PATHS.internal.whatsappInbound, validate(whatsappInboundMessagePayloadSchema), receiveInboundEvent);
router.post(ROUTE_PATHS.internal.whatsappStatus, validate(whatsappStatusPayloadSchema), receiveStatusEvent);
router.post(ROUTE_PATHS.internal.runtimeSendMessage, validate(runtimeSendMessageRequestSchema), runtimeSendMessage);
router.post(ROUTE_PATHS.internal.runtimeSendMedia, validate(runtimeSendMediaRequestSchema), runtimeSendMedia);
router.post(ROUTE_PATHS.internal.runtimeBroadcast, validate(runtimeBroadcastRequestSchema), runtimeBroadcast);
router.get(ROUTE_PATHS.internal.runtimeSessionStatus, validate(runtimeSessionStatusQuerySchema, 'query'), runtimeSessionStatus);

export default router;
