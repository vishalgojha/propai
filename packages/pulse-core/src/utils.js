export function extractMessageText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    message?.documentMessage?.caption ||
    ''
  );
}

export function normalizeSenderNumber(participant) {
  return (participant || '').replace(/@s\.whatsapp\.net$/, '');
}

export function formatLog(record) {
  const time = new Date(record.timestamp).toISOString();
  const groupLabel = record.group_name || record.group_id;

  return [
    `[${time}] [${groupLabel}]`,
    `STATUS: ${record.status}`,
    record.review_reasons?.length ? `REVIEW: ${record.review_reasons.join(', ')}` : null,
    `RAW: ${record.message}`,
    `TYPE: ${record.type}`,
    `ENTRIES: ${JSON.stringify(record.entries)}`,
    `CONTACTS: ${JSON.stringify(record.contacts)}`,
    record.extraction_error ? `ERROR: ${record.extraction_error}` : null,
  ].filter(Boolean).join('\n');
}

export function formatPrice(amount, isMonthly = false) {
  if (amount == null) return 'N/A';
  const num = Number(amount);
  if (Number.isNaN(num)) return 'N/A';

  if (num >= 10000000) {
    const crores = (num / 10000000).toFixed(num % 10000000 === 0 ? 0 : 1);
    return `₹${crores}Cr${isMonthly ? '/month' : ''}`;
  }

  if (num >= 100000) {
    const lakhs = (num / 100000).toFixed(num % 100000 === 0 ? 0 : 2);
    return `₹${lakhs}L${isMonthly ? '/month' : ''}`;
  }

  if (num >= 1000) {
    return `₹${(num / 1000).toFixed(0)}K${isMonthly ? '/month' : ''}`;
  }

  return `₹${num}${isMonthly ? '/month' : ''}`;
}

export function formatListingDisplay(entry, record) {
  const building = entry.building_name || entry.project_name || '';
  const location = [entry.location?.sub_area, entry.location?.area].filter(Boolean).join(', ') || 'Unknown';
  const config = entry.property_type || entry.intent || 'N/A';
  const carpet = entry.area_sqft ? `${entry.area_sqft} sqft` : 'N/A';
  const furnishing = entry.furnishing || 'N/A';
  const parking = entry.parking || 'N/A';

  const priceRaw = entry.price || '';
  const priceNum = parsePriceToNumber(priceRaw);
  const price = priceNum ? formatPrice(priceNum, true) : priceRaw || 'N/A';

  const broker = (Array.isArray(record.contacts) ? record.contacts[0] : null) || 'N/A';
  const posted = record.timestamp ? timeAgo(record.timestamp) : 'Unknown';

  let line = '';
  if (building) line += `${building} — ${location}\n`;
  else line += `${location}\n`;

  line += `Config: ${config} | Rent/Price: ${price} | Carpet: ${carpet}\n`;
  line += `Furnishing: ${furnishing} | Parking: ${parking}\n`;
  line += `Broker: ${broker}\n`;
  line += `Posted: ${posted}`;

  return line;
}

function parsePriceToNumber(priceStr) {
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

function timeAgo(timestamp) {
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

export function buildAgentContext(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return 'No listings available.';
  }

  const lines = [`LISTINGS CONTEXT (${records.length} records):`];

  for (const record of records) {
    const group = record.group_name || record.group_id || 'unknown';
    const time = record.timestamp ? new Date(record.timestamp).toLocaleString() : 'unknown';
    const type = record.type || 'unknown';
    const status = record.status || 'unknown';
    const message = (record.cleaned_message || record.message || '').slice(0, 120);

    lines.push(`\n[${group}] ${time} | ${type} | ${status}`);
    lines.push(`RAW: ${message}`);

    const entries = Array.isArray(record.entries) ? record.entries : [];
    if (entries.length === 0) {
      if (record.extraction_error) {
        lines.push(`  ERROR: ${record.extraction_error}`);
      } else {
        lines.push(`  NO_ENTRIES`);
      }
    } else {
      for (const entry of entries) {
        const intent = entry.intent || '';
        const propertyType = entry.property_type || '';
        const subArea = entry.location?.sub_area || '';
        const area = entry.location?.area || '';
        const price = entry.price || '';
        const budgetMin = entry.budget_min || '';
        const budgetMax = entry.budget_max || '';
        const sqft = entry.area_sqft || '';
        const confidence = entry.confidence !== undefined ? entry.confidence : '?';

        let entryLine = `  ${intent} ${propertyType}`.trim();
        if (subArea || area) entryLine += ` | ${[subArea, area].filter(Boolean).join(', ')}`;
        if (price) entryLine += ` | price ${price}`;
        if (budgetMin || budgetMax) entryLine += ` | budget ${budgetMin}${budgetMax ? `-${budgetMax}` : ''}`;
        if (sqft) entryLine += ` | ${sqft} sqft`;
        entryLine += ` | conf ${confidence}`;

        lines.push(entryLine);
      }
    }

    if (Array.isArray(record.contacts) && record.contacts.length > 0) {
      lines.push(`  CONTACTS: ${record.contacts.join(', ')}`);
    }
  }

  return lines.join('\n');
}
