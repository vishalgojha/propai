import crypto from 'node:crypto';

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

export function createReplyRecord({
  groupId,
  groupName = null,
  sourceMessageId = null,
  sourceSenderNumber = null,
  text,
}) {
  const normalizedGroupId = String(groupId || '').trim();
  const normalizedText = normalizeText(text);

  if (!normalizedGroupId || !normalizedGroupId.endsWith('@g.us')) {
    throw new Error('A valid WhatsApp group id is required');
  }

  if (!normalizedText) {
    throw new Error('Reply text is required');
  }

  if (normalizedText.length > 4096) {
    throw new Error('Reply text is too long');
  }

  const timestamp = new Date().toISOString();

  return {
    reply_id: crypto.randomUUID(),
    group_id: normalizedGroupId,
    group_name: groupName ? String(groupName).trim() : null,
    source_message_id: sourceMessageId ? String(sourceMessageId).trim() : null,
    source_sender_number: sourceSenderNumber ? String(sourceSenderNumber).trim() : null,
    text: normalizedText,
    status: 'pending',
    error: null,
    created_at: timestamp,
    updated_at: timestamp,
    claimed_at: null,
    sent_at: null,
    whatsapp_message_id: null,
  };
}
