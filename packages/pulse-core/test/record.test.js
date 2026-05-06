import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMessageRecord,
  getMessageId,
  getMessageTimestamp,
  getReviewReasons,
} from '../src/record.js';

function makeMessage(overrides = {}) {
  return {
    key: {
      id: 'ABC123',
      remoteJid: '120363@g.us',
      participant: '919999999999@s.whatsapp.net',
      ...overrides.key,
    },
    messageTimestamp: 1713200000,
    message: {
      conversation: '2 BHK Andheri West rent 50K',
    },
    ...overrides,
  };
}

describe('getMessageId', () => {
  it('combines group and WhatsApp message id', () => {
    assert.equal(getMessageId(makeMessage()), '120363@g.us:ABC123');
  });

  it('returns null when WhatsApp id is missing', () => {
    assert.equal(getMessageId(makeMessage({ key: { id: null } })), null);
  });
});

describe('getMessageTimestamp', () => {
  it('normalizes WhatsApp epoch seconds to ISO time', () => {
    assert.equal(getMessageTimestamp(makeMessage()), '2024-04-15T16:53:20.000Z');
  });
});

describe('buildMessageRecord', () => {
  it('marks messages with entries as processed', () => {
    const record = buildMessageRecord({
      msg: makeMessage(),
      groupName: 'Brokers',
      cleaned: {
        original: '2 BHK Andheri West rent 50K',
        cleaned: '2 BHK Andheri West rent 50K',
      },
      extracted: {
        type: 'listing_rent',
        model: 'qwen:3b',
        entries: [{ intent: 'rent', price: 50000, confidence: 0.91 }],
        contacts: ['919999999999'],
      },
    });

    assert.equal(record.message_id, '120363@g.us:ABC123');
    assert.equal(record.status, 'processed');
    assert.equal(record.review_required, false);
    assert.equal(record.sender_number, '919999999999');
    assert.equal(record.entries.length, 1);
    assert.equal(record.extraction_error, null);
  });

  it('marks extracted entries with low confidence as needs_review', () => {
    const record = buildMessageRecord({
      msg: makeMessage(),
      groupName: 'Brokers',
      cleaned: {
        original: '2 BHK Andheri West rent maybe 50K',
        cleaned: '2 BHK Andheri West rent maybe 50K',
      },
      extracted: {
        type: 'listing_rent',
        model: 'qwen:3b',
        entries: [{ intent: 'rent', price: 50000, confidence: 0.52 }],
        contacts: [],
      },
    });

    assert.equal(record.status, 'needs_review');
    assert.equal(record.review_required, true);
    assert.deepEqual(record.review_reasons, ['low_confidence']);
  });

  it('marks extracted entries with missing confidence as needs_review', () => {
    const record = buildMessageRecord({
      msg: makeMessage(),
      groupName: 'Brokers',
      cleaned: {
        original: '2 BHK Andheri West rent 50K',
        cleaned: '2 BHK Andheri West rent 50K',
      },
      extracted: {
        type: 'listing_rent',
        model: 'qwen:3b',
        entries: [{ intent: 'rent', price: 50000 }],
        contacts: [],
      },
    });

    assert.equal(record.status, 'needs_review');
    assert.deepEqual(record.review_reasons, ['missing_confidence']);
  });

  it('marks relevant messages with no entries as no_entries', () => {
    const record = buildMessageRecord({
      msg: makeMessage(),
      groupName: 'Brokers',
      cleaned: {
        original: 'rent around Andheri',
        cleaned: 'rent around Andheri',
      },
      extracted: {
        type: 'listing_rent',
        model: 'qwen:3b',
        entries: [],
        contacts: [],
      },
    });

    assert.equal(record.status, 'no_entries');
    assert.deepEqual(record.entries, []);
  });

  it('marks model failures as extraction_error', () => {
    const record = buildMessageRecord({
      msg: makeMessage(),
      groupName: null,
      cleaned: {
        original: 'sale 2cr',
        cleaned: 'sale 2cr',
      },
      extracted: {
        type: 'listing_sale',
        model: 'llama3:8b',
        entries: [],
        contacts: [],
        error: 'No JSON object found in model response',
      },
    });

    assert.equal(record.status, 'extraction_error');
    assert.equal(record.review_required, false);
    assert.equal(record.extraction_error, 'No JSON object found in model response');
  });
});

describe('getReviewReasons', () => {
  it('reports missing and low confidence independently', () => {
    assert.deepEqual(
      getReviewReasons([{ confidence: null }, { confidence: 0.4 }, { confidence: 0.9 }], null),
      ['missing_confidence', 'low_confidence'],
    );
  });
});
