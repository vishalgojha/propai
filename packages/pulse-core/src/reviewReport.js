const DEFAULT_LIMIT = 25;
const FORMATS = new Set(['table', 'json', 'jsonl']);

export function parseReviewArgs(args) {
  const options = {
    status: 'needs_review',
    limit: DEFAULT_LIMIT,
    format: 'table',
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--all') {
      options.status = null;
      continue;
    }

    if (arg === '--status' && next) {
      options.status = next;
      index += 1;
      continue;
    }

    if (arg.startsWith('--status=')) {
      options.status = arg.slice('--status='.length) || null;
      continue;
    }

    if (arg === '--limit' && next) {
      options.limit = Number(next);
      index += 1;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.slice('--limit='.length));
      continue;
    }

    if (arg === '--format' && next) {
      options.format = next;
      index += 1;
      continue;
    }

    if (arg.startsWith('--format=')) {
      options.format = arg.slice('--format='.length);
    }
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    options.limit = DEFAULT_LIMIT;
  }

  options.limit = Math.min(Math.floor(options.limit), 500);

  if (!FORMATS.has(options.format)) {
    options.format = 'table';
  }

  return options;
}

function compact(value, maxLength = 90) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function formatEntry(entry) {
  const location = [entry.location?.sub_area, entry.location?.area].filter(Boolean).join(', ');
  const parts = [
    entry.intent,
    entry.property_type,
    location,
    entry.area_sqft ? `${entry.area_sqft} sqft` : null,
    entry.price ? `price ${entry.price}` : null,
    entry.budget_min || entry.budget_max
      ? `budget ${entry.budget_min || '?'}-${entry.budget_max || '?'}`
      : null,
    typeof entry.confidence === 'number' ? `conf ${entry.confidence}` : 'conf missing',
  ];

  return parts.filter(Boolean).join(' | ');
}

export function formatTable(records) {
  if (records.length === 0) {
    return 'No records found.';
  }

  return records
    .map((record, index) => {
      const entries = Array.isArray(record.entries) ? record.entries : [];
      const reasons = Array.isArray(record.review_reasons) ? record.review_reasons.join(', ') : '';
      const header = [
        `${index + 1}. ${record.timestamp || 'no timestamp'}`,
        record.status ? `status=${record.status}` : null,
        reasons ? `review=${reasons}` : null,
        record.group_name || record.group_id,
        record.sender_number,
      ]
        .filter(Boolean)
        .join(' | ');

      const entryLines = entries.length
        ? entries.map((entry, entryIndex) => `   entry ${entryIndex + 1}: ${formatEntry(entry)}`)
        : ['   entries: none'];

      return [
        header,
        `   id: ${record.message_id || record.whatsapp_message_id || 'unknown'}`,
        `   text: ${compact(record.cleaned_message || record.message)}`,
        ...entryLines,
        record.extraction_error ? `   error: ${record.extraction_error}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

export function formatJson(records) {
  return JSON.stringify(records, null, 2);
}

export function formatJsonl(records) {
  return records.map((record) => JSON.stringify(record)).join('\n');
}

export function formatReviewRecords(records, format) {
  if (format === 'json') {
    return formatJson(records);
  }

  if (format === 'jsonl') {
    return formatJsonl(records);
  }

  return formatTable(records);
}

function increment(map, key) {
  const safeKey = key || 'unknown';
  map.set(safeKey, (map.get(safeKey) || 0) + 1);
}

function sortCounts(map) {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function summarizeRecords(records) {
  const byStatus = new Map();
  const byReviewReason = new Map();
  const byGroup = new Map();
  const byModel = new Map();

  let totalEntries = 0;
  let recordsWithEntries = 0;
  let recordsWithContacts = 0;
  let totalConfidence = 0;
  let confidenceCount = 0;

  for (const record of records) {
    const entries = Array.isArray(record.entries) ? record.entries : [];
    const contacts = Array.isArray(record.contacts) ? record.contacts : [];

    increment(byStatus, record.status);
    increment(byGroup, record.group_name || record.group_id);
    increment(byModel, record.model);

    for (const reason of record.review_reasons || []) {
      increment(byReviewReason, reason);
    }

    totalEntries += entries.length;
    if (entries.length > 0) {
      recordsWithEntries += 1;
    }

    if (contacts.length > 0) {
      recordsWithContacts += 1;
    }

    for (const entry of entries) {
      if (typeof entry.confidence === 'number') {
        totalConfidence += entry.confidence;
        confidenceCount += 1;
      }
    }
  }

  return {
    total_records: records.length,
    total_entries: totalEntries,
    records_with_entries: recordsWithEntries,
    records_with_contacts: recordsWithContacts,
    average_confidence: confidenceCount
      ? Number((totalConfidence / confidenceCount).toFixed(2))
      : null,
    by_status: sortCounts(byStatus),
    by_review_reason: sortCounts(byReviewReason),
    by_group: sortCounts(byGroup),
    by_model: sortCounts(byModel),
  };
}

function formatCountSection(title, rows, limit = 10) {
  const visibleRows = rows.slice(0, limit);

  if (visibleRows.length === 0) {
    return `${title}\n  none`;
  }

  return [title, ...visibleRows.map((row) => `  ${row.name}: ${row.count}`)].join('\n');
}

export function formatSummary(summary) {
  return [
    'PropAI Pulse Summary',
    `  total records: ${summary.total_records}`,
    `  total entries: ${summary.total_entries}`,
    `  records with entries: ${summary.records_with_entries}`,
    `  records with contacts: ${summary.records_with_contacts}`,
    `  average confidence: ${summary.average_confidence ?? 'n/a'}`,
    '',
    formatCountSection('By Status', summary.by_status),
    '',
    formatCountSection('By Review Reason', summary.by_review_reason),
    '',
    formatCountSection('By Model', summary.by_model),
    '',
    formatCountSection('Top Groups', summary.by_group),
  ].join('\n');
}

export function formatSummaryRecords(records, format) {
  const summary = summarizeRecords(records);

  if (format === 'json') {
    return JSON.stringify(summary, null, 2);
  }

  return formatSummary(summary);
}
