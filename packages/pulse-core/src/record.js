import { extractMessageText, normalizeSenderNumber } from './utils.js';
import { correctPriceWithText } from './normalizer.js';

const REVIEW_CONFIDENCE_THRESHOLD = Number(process.env.REVIEW_CONFIDENCE_THRESHOLD || 0.7);

export function getMessageId(msg) {
  const groupId = msg?.key?.remoteJid || 'unknown-group';
  const messageId = msg?.key?.id || null;
  if (!messageId) return null;
  return `${groupId}:${messageId}`;
}

export function getMessageTimestamp(msg) {
  return new Date(
    typeof msg?.messageTimestamp === 'number' ? msg.messageTimestamp * 1000 : Date.now(),
  ).toISOString();
}

export function getReviewReasons(listings, confidence, extractionError) {
  if (extractionError) return ['extraction_error'];
  if (!Array.isArray(listings) || listings.length === 0) return [];

  const reasons = [];
  if (confidence < REVIEW_CONFIDENCE_THRESHOLD) {
    reasons.push('low_confidence');
  }
  if (listings.some(entry => entry.confidence === null || entry.confidence === undefined)) {
    reasons.push('missing_confidence');
  }
  return reasons;
}

export function buildMessageRecord({ msg, groupName, cleaned, extracted }) {
  const listings = Array.isArray(extracted?.listings) ? extracted.listings : [];
  const extractionError = extracted?.error || null;
  const confidence = typeof extracted?.confidence === 'number' ? extracted.confidence : 0;
  const rawMessage = cleaned?.cleaned || extracted?.raw_message || '';

  const firstType = listings[0]?.type || 'unknown';
  const review_reasons = getReviewReasons(listings, confidence, extractionError);
  const status = extractionError
    ? 'extraction_error'
    : listings.length === 0
      ? 'no_entries'
      : confidence < 0.4
        ? 'low_confidence'
        : review_reasons.length > 0
          ? 'needs_review'
          : 'processed';

  const broker = extracted?.broker || {};
  const contacts = [];
  if (broker.phone) {
    contacts.push({ number: broker.phone, name: broker.name || null });
  }

  const entries = listings.map((l, i) => {
    const correctedPrice = correctPriceWithText(l.price_amount, rawMessage);
    return {
      type: l.type || null,
      property_type: l.bhk ? `${l.bhk} BHK` : (l.type?.replace('_', ' ') || null),
      location: l.location ? { city: 'Mumbai', area: l.area || null, sub_area: l.location } : null,
      area_sqft: l.size_sqft || null,
      price: correctedPrice,
      budget_min: null,
      budget_max: null,
      furnishing: l.furnishing || null,
      notes: [
        l.building ? `Building: ${l.building}` : null,
        l.floor ? `Floor: ${l.floor}` : null,
        l.deposit ? `Deposit: ${l.deposit}` : null,
        l.parking ? `Parking: ${l.parking}` : null,
      ].filter(Boolean),
      confidence: calculateEntryConfidence(l),
      contact_name: l.contact_name || broker.name || null,
      contact_phone: l.contact_phone || broker.phone || null,
      price_type: l.price_type || null,
      building: l.building || null,
      floor: l.floor || null,
      deposit: l.deposit || null,
      parking: l.parking || null,
      bhk: l.bhk || null,
    };
  });

  return {
    message_id: getMessageId(msg),
    whatsapp_message_id: msg?.key?.id || null,
    group_id: msg?.key?.remoteJid || null,
    group_name: groupName,
    sender_number: normalizeSenderNumber(msg?.key?.participant),
    message: cleaned?.original || extractMessageText(msg?.message),
    cleaned_message: cleaned?.cleaned || '',
    status,
    type: firstType,
    model: extracted?.engine || 'groq',
    entries,
    contacts,
    extraction_error: extractionError,
    review_required: status === 'needs_review',
    review_reasons,
    confidence,
    timestamp: getMessageTimestamp(msg),
    processed_at: new Date().toISOString(),
  };
}

function calculateEntryConfidence(listing) {
  const fields = ['type', 'location', 'size_sqft', 'price_amount', 'contact_phone'];
  let nonNull = 0;
  for (const f of fields) {
    if (listing[f] !== null && listing[f] !== undefined && listing[f] !== '') nonNull++;
  }
  return nonNull / fields.length;
}