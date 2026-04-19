import { WhatsAppTools } from './whatsapp';
import { ListingTools } from './listings';
import { LeadTools } from './leads';
import { BehaviorTools } from './behavior';
import { UtilityTools } from './utilities';
import { WebTools } from './web';
import { VoiceTools } from './voice';
import { BillingTools } from './billing';

export const PropAITools = {
    ...WhatsAppTools,
    ...ListingTools,
    ...LeadTools,
    ...BehaviorTools,
    ...UtilityTools,
    ...WebTools,
    ...VoiceTools,
    ...BillingTools,
};

export type PropAIToolName = keyof typeof PropAITools;
export type PropAIToolSchema = typeof PropAITools;
