import axios from 'axios';
import { AGENT_SYSTEM_PROMPT } from './agentPrompt.js';
import { computeInsights } from './insights.js';
import { formatPrice, formatListingDisplay } from './utils.js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

export interface IntentFilters {
  location?: string | null;
  bhk?: number | null;
  budget_max?: number | null;
  budget_min?: number | null;
  furnishing?: string | null;
  type?: string | null;
  building?: string | null;
  target?: string | null;
}

export interface AgentIntent {
  intent: 'search' | 'draft_reply' | 'group_insights' | 'budget_filter' | 'approve_reply' | 'schedule_reply' | 'show_sent_log' | 'show_scheduled' | 'cancel_scheduled' | 'clarify' | 'unknown';
  filters?: IntentFilters;
  listing_id?: string;
  timeframe?: string;
  clarify_field?: string;
  reply_id?: string;
  scheduled_time?: string;
  approval?: 'yes' | 'no';
}

function stripMarkdown(text: string): string {
  return text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
}

function parseJsonResponse(raw: string): AgentIntent {
  const cleaned = stripMarkdown(raw);
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('No JSON in response: ' + raw.substring(0, 100));
  }
  return JSON.parse(match[0]);
}

async function supabaseQuery(table: string, params: Record<string, unknown>) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and a Supabase API key must be configured');
  }
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const { data } = await axios.get(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    params,
  });
  return data;
}

function normalizeLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const lower = location.toLowerCase().trim();

  const aliases: Record<string, string> = {
    'lp': 'Lower Parel',
    'lower parel': 'Lower Parel',
    'lower parel west': 'Lower Parel',
    'bkc': 'BKC',
    'bandra kurla': 'BKC',
    'bandra kurla complex': 'BKC',
    'bandra w': 'Bandra West',
    'bandra west': 'Bandra West',
    'bw': 'Bandra West',
    'andheri w': 'Andheri West',
    'andheri west': 'Andheri West',
    'andheri e': 'Andheri East',
    'andheri east': 'Andheri East',
    'aw': 'Andheri West',
    'ae': 'Andheri East',
    'worli': 'Worli',
    'worli sea face': 'Worli',
    'juhu': 'Juhu',
    'jvpd': 'Juhu',
    'powai': 'Powai',
    'powai lake': 'Powai',
    'goregaon w': 'Goregaon West',
    'goregaon west': 'Goregaon West',
    'goregaon e': 'Goregaon East',
    'goregaon east': 'Goregaon East',
    'malad w': 'Malad West',
    'malad west': 'Malad West',
    'malad e': 'Malad East',
    'malad east': 'Malad East',
    'kandivali w': 'Kandivali West',
    'kandivali west': 'Kandivali West',
    'kandivali e': 'Kandivali East',
    'kandivali east': 'Kandivali East',
    'borivali w': 'Borivali West',
    'borivali west': 'Borivali West',
    'borivali e': 'Borivali East',
    'borivali east': 'Borivali East',
    'thane w': 'Thane West',
    'thane west': 'Thane West',
    'thane e': 'Thane East',
    'thane east': 'Thane East',
    'navi mumbai': 'Navi Mumbai',
    'nm': 'Navi Mumbai',
    'khar': 'Khar',
    'khar west': 'Khar West',
    'santacruz w': 'Santacruz West',
    'santacruz west': 'Santacruz West',
    'santacruz e': 'Santacruz East',
    'santacruz east': 'Santacruz East',
    'vile parle w': 'Vile Parle West',
    'vile parle west': 'Vile Parle West',
    'vile parle e': 'Vile Parle East',
    'vile parle east': 'Vile Parle East',
    'chembur': 'Chembur',
    'wadala': 'Wadala',
    'dadar': 'Dadar',
    'parel': 'Parel',
    'seawoods': 'Seawoods',
    'ghansoli': 'Ghansoli',
    'airoli': 'Airoli',
  };

  return aliases[lower] || location;
}

function parsePriceToNumber(priceStr: string | null | undefined): number | null {
  if (!priceStr) return null;
  const str = String(priceStr).toLowerCase().replace(/[₹,rs\.\/month]/g, '').trim();

  const crMatch = str.match(/^([\d.]+)\s*cr/);
  if (crMatch) return parseFloat(crMatch[1]) * 10000000;

  const lMatch = str.match(/^([\d.]+)\s*l/);
  if (lMatch) return parseFloat(lMatch[1]) * 100000;

  const kMatch = str.match(/^([\d.]+)\s*k/);
  if (kMatch) return parseFloat(kMatch[1]) * 1000;

  const num = parseFloat(str);
  return Number.isFinite(num) ? num : null;
}

function extractBHKFromText(text: string): number | null {
  const match = text.match(/(\d)\s*bhk/i);
  return match ? parseInt(match[1], 10) : null;
}

function formatListingResult(listing: Record<string, unknown>): string {
  const building = (listing.building_name || listing.project_name || '') as string;
  const locality = (listing.location || listing.area || 'Unknown') as string;
  const config = (listing.property_type || listing.config || 'N/A') as string;
  const carpet = listing.carpet_area || listing.size_sqft || listing.area_sqft;
  const carpetStr = carpet ? `${carpet} sqft` : 'N/A';
  const furnishing = (listing.furnishing || 'N/A') as string;
  const parking = (listing.parking || 'N/A') as string;

  const priceRaw = listing.price_amount || listing.price || listing.rent;
  const priceNum = typeof priceRaw === 'number' ? priceRaw : parsePriceToNumber(String(priceRaw || ''));
  const price = priceNum ? formatPrice(priceNum, true) : String(priceRaw || 'N/A');

  const broker = (listing.broker_name || '') as string;
  const brokerPhone = (listing.broker_phone || '') as string;
  const brokerStr = broker ? (brokerPhone ? `${broker} – ${brokerPhone}` : broker) : 'N/A';

  const posted = listing.created_at || listing.timestamp;
  const postedStr = posted ? timeAgoString(posted) : 'Unknown';

  let line = '';
  if (building) line += `${building} — ${locality}\n`;
  else line += `${locality}\n`;

  line += `Config: ${config} | Rent/Price: ${price} | Carpet: ${carpetStr}\n`;
  line += `Furnishing: ${furnishing} | Parking: ${parking}\n`;
  line += `Broker: ${brokerStr}\n`;
  line += `Posted: ${postedStr}`;

  return line;
}

function timeAgoString(timestamp: string | Date): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function draftWhatsAppReply(listing: Record<string, unknown>): string {
  const config = (listing.property_type || listing.config || '') as string;
  const locality = (listing.location || listing.area || '') as string;
  const carpet = listing.carpet_area || listing.size_sqft || listing.area_sqft;
  const priceRaw = listing.price_amount || listing.price || listing.rent;
  const priceNum = typeof priceRaw === 'number' ? priceRaw : parsePriceToNumber(String(priceRaw || ''));
  const price = priceNum ? formatPrice(priceNum, true) : String(priceRaw || '');

  const highlights: string[] = [];
  if (listing.furnishing && listing.furnishing !== 'N/A') highlights.push(String(listing.furnishing));
  if (listing.parking && listing.parking !== 'N/A') highlights.push(`${listing.parking} parking`);
  if (listing.baths) highlights.push(`${listing.baths} bath${(listing.baths as number) > 1 ? 's' : ''}`);
  if (listing.modular_kitchen) highlights.push('modular kitchen');
  if (listing.pets_allowed) highlights.push('pets allowed');

  const broker = (listing.broker_name || '') as string;
  const brokerPhone = (listing.broker_phone || '') as string;

  let reply = `${config} available in ${locality}\n`;
  if (carpet) reply += `Carpet: ${carpet} sqft | Rent: ${price}\n`;
  else reply += `Rent: ${price}\n`;
  if (highlights.length > 0) reply += `${highlights.join(', ')}\n`;
  if (listing.new_building) reply += 'New building | ';
  if (listing.deposit) reply += `${listing.deposit}-month deposit\n`;
  if (broker) reply += `Contact: ${broker}${brokerPhone ? ` – ${brokerPhone}` : ''}`;

  return reply;
}

function formatApprovalBox(replyText: string, target: string): string {
  const separator = '─'.repeat(37);
  return `┌${separator}┐
│ DRAFT REPLY${' '.repeat(25)}│
│${' '.repeat(37)}│
${replyText.split('\n').map(line => `│ ${line}${' '.repeat(Math.max(0, 35 - line.length))}│`).join('\n')}
│${' '.repeat(37)}│
│ Send to: ${target}${' '.repeat(Math.max(0, 27 - target.length))}│
│${' '.repeat(37)}│
│ Reply YES to send · NO to cancel${' '.repeat(3)}│
└${separator}┘`;
}

function formatScheduledTime(isoTime: string): string {
  const date = new Date(isoTime);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  };
  return date.toLocaleString('en-IN', options) + ' IST';
}

function formatSentLogEntry(entry: Record<string, unknown>): string {
  const time = entry.sent_at ? formatTimeOnly(entry.sent_at as string) : '??:??';
  const target = (entry.group_name || entry.target || 'Unknown') as string;
  const text = (entry.text || '') as string;
  const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
  return `[${time}] → ${target} — "${preview}"`;
}

function formatScheduledEntry(entry: Record<string, unknown>): string {
  const time = entry.created_at ? formatTimeOnly(entry.created_at as string) : '??:??';
  const target = (entry.group_name || entry.target || 'Unknown') as string;
  const text = (entry.text || '') as string;
  const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
  const scheduledFor = entry.scheduled_for ? formatScheduledTime(entry.scheduled_for as string) : 'Unknown';
  return `[${time}] → ${target} — "${preview}"\n  Scheduled for: ${scheduledFor}`;
}

function formatTimeOnly(isoTime: string): string {
  const date = new Date(isoTime);
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}
