import axios from 'axios';
import { AGENT_SYSTEM_PROMPT } from './agentPrompt.js';
import { computeInsights } from './insights.js';
import { formatPrice, formatListingDisplay } from './utils.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wnrwntumacbirbndfvwg.supabase.co';
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

async function ollamaGenerate(prompt: string, model = 'qwen3:14b'): Promise<string> {
  const { data } = await axios.post(
    OLLAMA_URL,
    { model, prompt, stream: false },
    { timeout: 90000 }
  );
  return (data?.response || '').trim();
}

async function supabaseQuery(table: string, params: Record<string, unknown>) {
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

export async function agentQuery(userQuery: string, records?: Record<string, unknown>[], context?: {
  pendingReply?: Record<string, unknown>;
  sentLog?: Record<string, unknown>[];
  scheduledReplies?: Record<string, unknown>[];
}): Promise<unknown> {
  const raw = await ollamaGenerate(
    `${AGENT_SYSTEM_PROMPT}\n\nQuery: ${userQuery}\n\nReturn ONLY JSON.`
  );
  const intent: AgentIntent = parseJsonResponse(raw);

  if (intent.intent === 'clarify') {
    const field = intent.clarify_field || 'details';
    const questions: Record<string, string> = {
      location: 'Which locality are you looking in?',
      bhk: 'What configuration do you need? (1 BHK, 2 BHK, 3 BHK, etc.)',
      budget: 'What is your budget range?',
      type: 'Are you looking for residential or commercial?',
    };
    return { answer: questions[field] || `Please specify the ${field}.` };
  }

  if (intent.intent === 'unknown') {
    return { answer: 'I could not understand your query. Please try again with more details.' };
  }

  if (intent.intent === 'approve_reply') {
    if (!context?.pendingReply) {
      return { answer: 'No pending reply to approve. Draft a reply first.' };
    }

    if (intent.approval === 'yes') {
      return {
        action: 'send_reply',
        reply: context.pendingReply,
        answer: `Sent to ${context.pendingReply.group_name || 'group'} at ${formatTimeOnly(new Date().toISOString())}.`,
      };
    }

    return { answer: 'Reply cancelled. Not sent.' };
  }

  if (intent.intent === 'show_sent_log') {
    const log = context?.sentLog || [];
    if (log.length === 0) {
      return { answer: 'No messages sent in this session.' };
    }
    const lines = log.map(formatSentLogEntry);
    return { answer: `SENT LOG:\n${lines.join('\n')}` };
  }

  if (intent.intent === 'show_scheduled') {
    const scheduled = context?.scheduledReplies || [];
    const pending = scheduled.filter((s: Record<string, unknown>) => s.status === 'scheduled');
    if (pending.length === 0) {
      return { answer: 'No scheduled replies pending.' };
    }
    const lines = pending.map(formatScheduledEntry);
    return { answer: `SCHEDULED REPLIES:\n${lines.join('\n\n')}` };
  }

  if (intent.intent === 'cancel_scheduled') {
    const target = intent.filters?.target;
    if (!target) {
      return { answer: 'Which scheduled reply should I cancel? Specify the group or contact name.' };
    }
    return { action: 'cancel_scheduled', filters: { target }, answer: `Cancelled scheduled reply to ${target}.` };
  }

  if (intent.intent === 'group_insights') {
    if (!records || records.length === 0) {
      return { answer: 'No data available for insights yet.' };
    }

    const timeframe = intent.timeframe || 'this_week';
    const insights = computeInsights(records, timeframe);

    const lines: string[] = [];

    lines.push('MOST ACTIVE GROUPS:');
    for (const group of insights.mostActiveGroups.slice(0, 5)) {
      lines.push(`  ${group.name} — ${group.posts7d} posts (${group.posts24h} in 24h), ${group.listings} listings`);
    }

    lines.push('');
    lines.push('RECENT LISTINGS:');
    const r24 = insights.recentListings.last24h;
    const r7d = insights.recentListings.last7d;
    lines.push(`  Last 24 hours: ${r24.total} listings (${r24.residential} residential, ${r24.commercial} commercial)`);
    lines.push(`  Last 7 days: ${r7d.total} listings (${r7d.residential} residential, ${r7d.commercial} commercial)`);

    if (r24.topConfigurations.length > 0) {
      lines.push(`  Top configs: ${r24.topConfigurations.map((c: { config: string; count: number }) => `${c.config}: ${c.count}`).join(', ')}`);
    }
    if (r24.topLocalities.length > 0) {
      lines.push(`  Top localities: ${r24.topLocalities.map((l: { locality: string; count: number }) => `${l.locality}: ${l.count}`).join(', ')}`);
    }

    lines.push('');
    lines.push('TOP POSTING BROKERS (this week):');
    for (const broker of insights.topBrokers.slice(0, 5)) {
      lines.push(`  ${broker.name}${broker.phone ? ` – ${broker.phone}` : ''} — ${broker.posts} posts, ${broker.listingsShared} listings`);
    }

    lines.push('');
    lines.push('ACTIVITY TRENDS:');
    const t = insights.activityTrends;
    lines.push(`  Busiest day: ${t.busiestDay} (${t.busiestDayCount} posts)`);
    lines.push(`  Average posts/day: ${t.avgPerDay}`);
    lines.push(`  Trend vs last week: ${t.trend} (${t.trendPct > 0 ? '+' : ''}${t.trendPct}%)`);

    return { answer: lines.join('\n') };
  }

  const filters = intent.filters || {};
  const location = normalizeLocation(filters.location);
  const bhk = filters.bhk ?? (filters.type ? extractBHKFromText(filters.type) : null);
  const budgetMax = filters.budget_max;
  const furnishing = filters.furnishing;
  const type = filters.type;

  if (intent.intent === 'search' || intent.intent === 'budget_filter') {
    if (!location) {
      return { answer: 'Which locality are you looking in?' };
    }

    const params: Record<string, unknown> = {
      select: '*, brokers(name, phone)',
      order: 'created_at.desc',
      limit: 20,
    };

    params['location'] = `ilike.%${location}%`;
    if (bhk) params['bhk'] = `eq.${bhk}`;
    if (budgetMax) params['price_amount'] = `lte.${budgetMax}`;
    if (furnishing) params['furnishing'] = `eq.${furnishing}`;
    if (type) params['type'] = `eq.${type}`;

    try {
      const listings = await supabaseQuery('listings', params);

      if (!Array.isArray(listings) || listings.length === 0) {
        const configStr = bhk ? `${bhk} BHK` : 'listings';
        return {
          answer: `No ${configStr} listings found in ${location}${budgetMax ? ` within the given budget` : ''}.\n\nWould you like me to check nearby areas?`,
        };
      }

      const lines: string[] = [];
      for (const listing of listings) {
        lines.push(formatListingResult(listing));
        lines.push('');
      }

      lines.push('Which listing would you like more details or a reply draft for?');

      return { answer: lines.join('\n'), listings };
    } catch (error) {
      return { error: `Search failed: ${(error as Error).message}` };
    }
  }

  if (intent.intent === 'draft_reply') {
    if (!location) {
      return { answer: 'Which listing should I draft a reply for? Please specify the location and configuration.' };
    }

    const params: Record<string, unknown> = {
      select: '*, brokers(name, phone)',
      order: 'created_at.desc',
      limit: 1,
    };

    params['location'] = `ilike.%${location}%`;
    if (bhk) params['bhk'] = `eq.${bhk}`;

    try {
      const listings = await supabaseQuery('listings', params);

      if (!Array.isArray(listings) || listings.length === 0) {
        return { answer: `No listings found matching the criteria to draft a reply for.` };
      }

      const reply = draftWhatsAppReply(listings[0]);
      return { answer: reply, listing: listings[0] };
    } catch (error) {
      return { error: `Reply draft failed: ${(error as Error).message}` };
    }
  }

  if (intent.intent === 'schedule_reply') {
    if (!intent.scheduled_time) {
      return { answer: 'When should I send this? Specify a time like "tomorrow 9am" or "in 2 hours".' };
    }

    const formattedTime = formatScheduledTime(intent.scheduled_time);
    return {
      action: 'schedule_reply',
      scheduled_time: intent.scheduled_time,
      answer: `This will be sent on ${formattedTime}.\n\nReply YES to confirm or NO to cancel.`,
    };
  }

  return { error: 'Unknown intent: ' + intent.intent };
}

export async function routeAgentQuery(userQuery: string, records?: Record<string, unknown>[], context?: {
  pendingReply?: Record<string, unknown>;
  sentLog?: Record<string, unknown>[];
  scheduledReplies?: Record<string, unknown>[];
}): Promise<unknown> {
  return agentQuery(userQuery, records, context);
}
