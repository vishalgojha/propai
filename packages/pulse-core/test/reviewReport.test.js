import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatReviewRecords,
  formatSummaryRecords,
  formatTable,
  parseReviewArgs,
  summarizeRecords,
} from '../src/reviewReport.js';

const records = [
  {
    message_id: 'group:msg1',
    timestamp: '2026-04-21T10:00:00.000Z',
    status: 'needs_review',
    review_reasons: ['low_confidence'],
    group_name: 'Brokers',
    sender_number: '919999999999',
    model: 'qwen:3b',
    cleaned_message: '2 BHK Andheri West rent maybe 50K',
    entries: [
      {
        intent: 'rent',
        property_type: '2 BHK',
        location: {
          city: 'Mumbai',
          area: 'Andheri West',
          sub_area: null,
        },
        area_sqft: null,
        price: 50000,
        budget_min: null,
        budget_max: null,
        confidence: 0.52,
      },
    ],
  },
];

const summaryRecords = [
  ...records,
  {
    message_id: 'group:msg2',
    timestamp: '2026-04-21T10:01:00.000Z',
    status: 'processed',
    review_reasons: [],
    group_id: 'group-2',
    model: 'llama3:8b',
    contacts: ['918888888888'],
    entries: [{ confidence: 0.9 }],
  },
  {
    message_id: 'group:msg3',
    timestamp: '2026-04-21T10:02:00.000Z',
    status: 'extraction_error',
    review_reasons: ['extraction_error'],
    group_id: 'group-2',
    model: 'qwen:3b',
    contacts: [],
    entries: [],
  },
];

describe('parseReviewArgs', () => {
  it('uses needs_review table defaults', () => {
    assert.deepEqual(parseReviewArgs([]), {
      status: 'needs_review',
      limit: 25,
      format: 'table',
    });
  });

  it('parses status, limit, format, and all-record options', () => {
    assert.deepEqual(parseReviewArgs(['--status', 'no_entries', '--limit=10', '--format', 'json']), {
      status: 'no_entries',
      limit: 10,
      format: 'json',
    });

    assert.equal(parseReviewArgs(['--all']).status, null);
  });

  it('falls back on invalid limits and formats', () => {
    assert.deepEqual(parseReviewArgs(['--limit', 'x', '--format', 'csv']), {
      status: 'needs_review',
      limit: 25,
      format: 'table',
    });
  });
});

describe('formatTable', () => {
  it('renders review records for terminal inspection', () => {
    const output = formatTable(records);

    assert.match(output, /status=needs_review/);
    assert.match(output, /review=low_confidence/);
    assert.match(output, /conf 0.52/);
    assert.match(output, /2 BHK Andheri West rent maybe 50K/);
  });

  it('handles empty results', () => {
    assert.equal(formatTable([]), 'No records found.');
  });
});

describe('formatReviewRecords', () => {
  it('exports JSON and JSONL', () => {
    assert.equal(JSON.parse(formatReviewRecords(records, 'json'))[0].message_id, 'group:msg1');
    assert.equal(formatReviewRecords(records, 'jsonl').split('\n').length, 1);
  });
});

describe('summarizeRecords', () => {
  it('counts records by health dimensions', () => {
    const summary = summarizeRecords(summaryRecords);

    assert.equal(summary.total_records, 3);
    assert.equal(summary.total_entries, 2);
    assert.equal(summary.records_with_entries, 2);
    assert.equal(summary.records_with_contacts, 1);
    assert.equal(summary.average_confidence, 0.71);
    assert.deepEqual(summary.by_status, [
      { name: 'extraction_error', count: 1 },
      { name: 'needs_review', count: 1 },
      { name: 'processed', count: 1 },
    ]);
    assert.deepEqual(summary.by_review_reason, [
      { name: 'extraction_error', count: 1 },
      { name: 'low_confidence', count: 1 },
    ]);
    assert.deepEqual(summary.by_model, [
      { name: 'qwen:3b', count: 2 },
      { name: 'llama3:8b', count: 1 },
    ]);
  });
});

describe('formatSummaryRecords', () => {
  it('renders table and JSON summaries', () => {
    const table = formatSummaryRecords(summaryRecords, 'table');
    const json = JSON.parse(formatSummaryRecords(summaryRecords, 'json'));

    assert.match(table, /PropAI Pulse Summary/);
    assert.match(table, /By Status/);
    assert.equal(json.total_records, 3);
  });
});
