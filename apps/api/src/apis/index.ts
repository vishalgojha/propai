export { PropertyAPI } from './property';
export type { PropertyItem, PropertyFilters, PropertyCategory, PropertyStats } from './property/types';
export { LeadsAPI } from './leads';
export type { Lead, LeadStatus, FollowUp, LeadFilters, LeadStats } from './leads/types';
export { StreamAPI } from './stream';
export type { StreamItem, StreamFilters, StreamStats, StreamChannel } from './stream/types';
export { WaClickAPI } from './waclick';
export type { WaClickEvent, WaClickStats, WaClickListingLog } from './waclick/types';

import { PropertyAPI } from './property';
import { LeadsAPI } from './leads';
import { StreamAPI } from './stream';
import { WaClickAPI } from './waclick';

export const propertyAPI = new PropertyAPI();
export const leadsAPI = new LeadsAPI();
export const streamAPI = new StreamAPI();
export const waClickAPI = new WaClickAPI();
