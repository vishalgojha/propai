import { WhatsAppTools } from './whatsapp';
import { ListingTools } from './listings';
import { LeadTools } from './leads';
import { BehaviorTools } from './behavior';
import { UtilityTools } from './utilities';
import { WebTools } from './web';
import { VoiceTools } from './voice';
import { BillingTools } from './billing';
import { MessageParserTools } from './messageParser';
import { LeadExtractorTools } from './leadExtractor';
import { IndiaLocationNormalizerTools } from './indiaLocationNormalizer';
import { SentimentPriorityScorerTools } from './sentimentPriorityScorer';
import { SummaryGeneratorTools } from './summaryGenerator';
import { ActionSuggesterTools } from './actionSuggester';
import { LeadStorageTools } from './leadStorage';

export const PropAITools = {
    ...WhatsAppTools,
    ...ListingTools,
    ...MessageParserTools,
    ...LeadExtractorTools,
    ...IndiaLocationNormalizerTools,
    ...SentimentPriorityScorerTools,
    ...SummaryGeneratorTools,
    ...ActionSuggesterTools,
    ...LeadStorageTools,
    ...LeadTools,
    ...BehaviorTools,
    ...UtilityTools,
    ...WebTools,
    ...VoiceTools,
    ...BillingTools,
};

export type PropAIToolName = keyof typeof PropAITools;
export type PropAIToolSchema = typeof PropAITools;
