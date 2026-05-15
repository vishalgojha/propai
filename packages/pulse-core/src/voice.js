import https from 'node:https';
import http from 'node:http';

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JPBXnM1EGM4hJz45K1rT';
const API_KEY = process.env.ELEVENLABS_API_KEY || '';
const MODEL = 'eleven_turbo_v2';

const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
};

function buildVoiceUrl() {
  return `${ELEVENLABS_API}/text-to-speech/${VOICE_ID}/stream`;
}

async function speedToVoiceSettings(speed) {
  if (speed === 'slow') {
    return { ...VOICE_SETTINGS, speed: 0.35, use_speaker_boost: false };
  } else if (speed === 'fast') {
    return { ...VOICE_SETTINGS, speed: 0.7 };
  }
  return VOICE_SETTINGS;
}

async function fetchElevenLabs(text, voiceSettings = VOICE_SETTINGS) {
  if (!API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not configured');
  }

  const body = JSON.stringify({
    text,
    model_id: MODEL,
    voice_settings: voiceSettings,
  });

  return new Promise((resolve, reject) => {
    const url = new URL(buildVoiceUrl());
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': API_KEY,
      },
    };

    const protocol = url.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', (c) => (errorBody += c));
        res.on('end', () => {
          reject(new Error(`ElevenLabs error ${res.statusCode}: ${errorBody}`));
        });
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function formatListingForSpeech(entry) {
  const parts = [];
  if (entry.property_type) parts.push(entry.property_type);
  if (entry.location?.sub_area || entry.location?.area) {
    parts.push(`in ${[entry.location.sub_area, entry.location.area].filter(Boolean).join(', ')}`);
  }
  if (entry.price) parts.push(`${entry.price}`);
  if (entry.area_sqft) parts.push(`${entry.area_sqft} sq ft`);
  if (entry.furnishing) parts.push(entry.furnishing);
  return parts.join(', ');
}

function formatRecordForSpeech(record) {
  const type = record.type === 'listing_rent' ? 'rent listing' :
    record.type === 'listing_sale' ? 'sale listing' :
      record.type === 'requirement' ? 'requirement' : 'message';
  const groupName = record.group_name || 'unknown group';
  const parts = [];

  if (record.type === 'requirement') {
    const entries = record.entries || [];
    if (entries.length > 0) {
      const e = entries[0];
      const details = formatListingForSpeech(e);
      parts.push(`New requirement in ${groupName}: ${details}`);
    } else {
      parts.push(`New requirement in ${groupName}`);
    }
  } else {
    const entries = record.entries || [];
    if (entries.length > 0) {
      const e = entries[0];
      const details = formatListingForSpeech(e);
      parts.push(`${type}: ${details}`);
    } else {
      parts.push(`${type} received`);
    }
  }

  return parts.join('');
}

function formatBriefingForSpeech(summary, records) {
  const lines = [];
  lines.push(`Good morning. Here's your PropAI Pulse briefing.`);

  if (summary) {
    lines.push(`${summary.total || 0} total listings in the system.`);
    lines.push(`${summary.needs_review || 0} need review.`);
  }

  const today = new Date().toDateString();
  const todayRecords = records.filter(r => new Date(r.timestamp).toDateString() === today);
  if (todayRecords.length > 0) {
    lines.push(`${todayRecords.length} listings came in today.`);
  }

  const byType = {};
  for (const r of records) {
    const t = r.type || 'unknown';
    byType[t] = (byType[t] || 0) + 1;
  }
  if (byType.listing_rent) lines.push(`${byType.listing_rent} for rent.`);
  if (byType.listing_sale) lines.push(`${byType.listing_sale} for sale.`);
  if (byType.requirement) lines.push(`${byType.requirement} requirements.`);

  return lines.join(' ');
}

export { fetchElevenLabs, formatRecordForSpeech, formatBriefingForSpeech, formatListingForSpeech, speedToVoiceSettings };