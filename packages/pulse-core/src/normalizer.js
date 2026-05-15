const AREA_BY_SUBAREA = new Map([
  ['carter road', 'Bandra West'],
  ['hill road', 'Bandra West'],
  ['linking road', 'Bandra West'],
  ['link road', 'Andheri West'],
  ['off link road', 'Andheri West'],
  ['pali hill', 'Bandra West'],
  ['turner road', 'Bandra West'],
  ['waterfield road', 'Bandra West'],
  ['dn nagar', 'Andheri West'],
  ['lokhandwala', 'Andheri West'],
  ['lokhandwala market', 'Andheri West'],
  ['four bungalows', 'Andheri West'],
  ['versova', 'Andheri West'],
  ['amboli', 'Andheri West'],
  ['model town', 'Andheri West'],
]);

const ALLOWED_ENTRY_KEYS = new Set([
  'intent',
  'property_type',
  'location',
  'area_sqft',
  'price',
  'budget_min',
  'budget_max',
  'furnishing',
  'notes',
  'confidence',
]);

export function stripUnknownEntryFields(entry) {
  const clean = {};

  for (const key of ALLOWED_ENTRY_KEYS) {
    if (Object.hasOwn(entry || {}, key)) {
      clean[key] = entry[key];
    }
  }

  return clean;
}

export function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  const raw = String(value)
    .trim()
    .toLowerCase()
    .replace(/[₹,]/g, '')
    .replace(/\s+/g, ' ');

  const direct = Number(raw);
  if (Number.isFinite(direct)) {
    return Math.round(direct);
  }

  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const base = Number(match[1]);
  if (!Number.isFinite(base)) {
    return null;
  }

  if (raw.includes('crore') || /\bcr\b/.test(raw) || /\d(?:\.\d+)?cr\b/.test(raw)) {
    return Math.round(base * 10000000);
  }

  if (raw.includes('lakh') || raw.includes(' lac') || /\d(?:\.\d+)?l\b/.test(raw)) {
    return Math.round(base * 100000);
  }

  if (/\d(?:\.\d+)?k\b/.test(raw)) {
    return Math.round(base * 1000);
  }

  return Math.round(base);
}

export function titleCase(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeLocationString(value) {
  return String(value || '')
    .replace(/[|]/g, ',')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeLocation(location) {
  const fallback = {
    city: 'Mumbai',
    area: null,
    sub_area: null,
  };

  if (!location) {
    return fallback;
  }

  if (typeof location === 'string') {
    const parts = normalizeLocationString(location)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 2) {
      return normalizeLocation({
        sub_area: parts[0],
        area: parts[parts.length - 1],
      });
    }

    return normalizeLocation({
      area: parts[0] || location,
    });
  }

  const areaRaw = normalizeLocationString(location.area);
  const subAreaRaw = normalizeLocationString(location.sub_area);
  const cityRaw = normalizeLocationString(location.city) || 'Mumbai';

  let area = areaRaw ? titleCase(areaRaw) : null;
  let subArea = subAreaRaw ? titleCase(subAreaRaw) : null;

  if (!area && subArea) {
    const mappedArea = AREA_BY_SUBAREA.get(subArea.toLowerCase());
    if (mappedArea) {
      area = mappedArea;
    }
  }

  if (!subArea && area) {
    const mappedArea = AREA_BY_SUBAREA.get(area.toLowerCase());
    if (mappedArea) {
      subArea = area;
      area = mappedArea;
    }
  }

  return {
    city: titleCase(cityRaw),
    area,
    sub_area: subArea,
  };
}

export function inferIntent(type) {
  if (type === 'requirement') {
    return 'buy';
  }

  if (type === 'listing_rent') {
    return 'rent';
  }

  if (type === 'listing_sale') {
    return 'sell';
  }

  return null;
}

export function normalizePropertyType(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim().toLowerCase();
  const bhk = raw.match(/(\d+(?:\.\d+)?)\s*bhk/);
  if (bhk) {
    return `${bhk[1]} BHK`;
  }

  const rk = raw.match(/(\d+)\s*rk/);
  if (rk) {
    return `${rk[1]} RK`;
  }

  return titleCase(raw);
}

export function normalizeConfidence(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const raw = typeof value === 'number' ? value : Number(String(value).replace('%', '').trim());
  if (!Number.isFinite(raw)) {
    return null;
  }

  const scaled = raw > 1 ? raw / 100 : raw;
  return Math.max(0, Math.min(1, Number(scaled.toFixed(2))));
}

export function normalizeEntry(entry, classifiedType) {
  const clean = stripUnknownEntryFields(entry);
  const normalized = {
    intent: clean.intent || inferIntent(classifiedType),
    property_type: normalizePropertyType(clean.property_type),
    location: normalizeLocation(clean.location),
    area_sqft: toNumber(clean.area_sqft),
    price: toNumber(clean.price),
    budget_min: toNumber(clean.budget_min),
    budget_max: toNumber(clean.budget_max),
    furnishing: clean.furnishing ? String(clean.furnishing).trim().toLowerCase() : null,
    notes: clean.notes ? String(clean.notes).trim() : null,
    confidence: normalizeConfidence(clean.confidence),
  };

  if (normalized.budget_min && normalized.budget_max && normalized.budget_min > normalized.budget_max) {
    const originalMin = normalized.budget_min;
    normalized.budget_min = normalized.budget_max;
    normalized.budget_max = originalMin;
  }

  return normalized;
}

export function hasUsefulEntryData(entry) {
  return Boolean(
    entry?.location?.area ||
      entry?.price ||
      entry?.budget_min ||
      entry?.budget_max ||
      entry?.property_type ||
      entry?.area_sqft,
  );
}

function entryKey(entry) {
  return [
    entry.intent || '',
    entry.property_type || '',
    entry.location?.city || '',
    entry.location?.area || '',
    entry.location?.sub_area || '',
    entry.area_sqft || '',
    entry.price || '',
    entry.budget_min || '',
    entry.budget_max || '',
  ]
    .join('|')
    .toLowerCase();
}

export function dedupeEntries(entries) {
  const seen = new Set();
  const deduped = [];

  for (const entry of entries) {
    const key = entryKey(entry);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

export function normalizeEntries(entries, classifiedType) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return dedupeEntries(
    entries
      .map((entry) => normalizeEntry(entry, classifiedType))
      .filter(hasUsefulEntryData),
  );
}

export function parsePricesFromText(text) {
  if (!text) return [];

  const prices = [];
  const raw = String(text).toLowerCase();
  const usedIndices = new Set();

  // Match patterns with suffixes first (most specific)
  const suffixPatterns = [
    { regex: /(\d+(?:\.\d+)?)\s*(?:lakh|lac|lacs)\b/g, multiplier: 100000 },
    { regex: /(\d+(?:\.\d+)?)\s*cr(?:ore)?\b/g, multiplier: 10000000 },
    { regex: /(\d+(?:\.\d+)?)\s*k\b/g, multiplier: 1000 },
    { regex: /(\d+(?:\.\d+)?)\s*l\b/g, multiplier: 100000 },
  ];

  for (const { regex, multiplier } of suffixPatterns) {
    let match;
    while ((match = regex.exec(raw)) !== null) {
      const num = parseFloat(match[1]);
      if (!Number.isFinite(num)) continue;

      const value = Math.round(num * multiplier);
      prices.push({ value, raw: match[0], num });

      // Mark indices as used to avoid double-matching
      for (let i = match.index; i < match.index + match[0].length; i++) {
        usedIndices.add(i);
      }
    }
  }

  // Match bare numbers that weren't already captured
  const bareRegex = /(?:₹|rs\.?|inr)?\s*(\d{4,}(?:\.\d+)?)\b/g;
  let match;
  while ((match = bareRegex.exec(raw)) !== null) {
    if (usedIndices.has(match.index)) continue;
    const num = parseFloat(match[1]);
    if (!Number.isFinite(num)) continue;
    prices.push({ value: Math.round(num), raw: match[0], num });
  }

  return prices;
}

export function correctPriceWithText(llmPrice, text) {
  if (llmPrice == null || !text) return llmPrice;

  const prices = parsePricesFromText(text);
  if (prices.length === 0) return llmPrice;

  // Check if any parsed price from text is 10x smaller than LLM price
  // This catches the common "1.3L → 1300000" error
  for (const p of prices) {
    if (p.value * 10 === llmPrice) {
      return p.value;
    }
    // Also check if LLM price is exactly the parsed value
    if (p.value === llmPrice) {
      return p.value;
    }
  }

  // For rentals, if LLM price is suspiciously high (> 50L/month),
  // check if any text price is more reasonable
  if (llmPrice > 5000000) {
    const reasonablePrices = prices.filter(p => p.value <= 5000000);
    if (reasonablePrices.length > 0) {
      return reasonablePrices[0].value;
    }
  }

  return llmPrice;
}
