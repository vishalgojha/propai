import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createReplyRecord } from '../src/replies.js';

describe('createReplyRecord', () => {
  it('creates a pending group reply record', () => {
    const reply = createReplyRecord({
      groupId: '120363@g.us',
      groupName: 'Brokers',
      sourceMessageId: '120363@g.us:ABC123',
      sourceSenderNumber: '919999999999',
      text: 'Available. Please share budget and move-in timeline.',
    });

    assert.match(reply.reply_id, /^[0-9a-f-]{36}$/);
    assert.equal(reply.group_id, '120363@g.us');
    assert.equal(reply.status, 'pending');
    assert.equal(reply.error, null);
    assert.equal(reply.whatsapp_message_id, null);
  });

  it('rejects invalid groups and empty text', () => {
    assert.throws(
      () => createReplyRecord({ groupId: '919999999999@s.whatsapp.net', text: 'Hello' }),
      /valid WhatsApp group id/i,
    );
    assert.throws(
      () => createReplyRecord({ groupId: '120363@g.us', text: '   ' }),
      /Reply text is required/i,
    );
  });
});
