import { test } from 'node:test';
import assert from 'node:assert';

test('formatApprovalBox creates properly formatted approval display', () => {
  const replyText = '3 BHK available in Bandra West\nCarpet: 1017 sqft | Rent: ₹1.65L/month';
  const target = 'Mumbai Brokers Group';

  const box = formatApprovalBox(replyText, target);

  assert.ok(box.includes('DRAFT REPLY'));
  assert.ok(box.includes('Mumbai Brokers Group'));
  assert.ok(box.includes('YES to send'));
  assert.ok(box.includes('NO to cancel'));
  assert.ok(box.includes('3 BHK available'));
});

test('formatScheduledTime formats ISO time to IST display', () => {
  const isoTime = '2026-04-24T09:00:00+05:30';
  const formatted = formatScheduledTime(isoTime);

  assert.ok(formatted.includes('IST'));
  assert.ok(formatted.includes('09:00'));
});

test('formatSentLogEntry formats sent log correctly', () => {
  const entry = {
    sent_at: '2026-04-23T14:30:00+05:30',
    group_name: 'Bandra Brokers',
    text: '3 BHK available in Bandra West, Carpet 1017 sqft, Rent ₹1.65L/month, Contact: Rahul',
  };

  const formatted = formatSentLogEntry(entry);

  assert.ok(formatted.startsWith('[14:30]'));
  assert.ok(formatted.includes('Bandra Brokers'));
  assert.ok(formatted.includes('3 BHK available'));
});

test('formatSentLogEntry truncates long messages', () => {
  const entry = {
    sent_at: '2026-04-23T14:30:00+05:30',
    group_name: 'Test Group',
    text: 'A'.repeat(100),
  };

  const formatted = formatSentLogEntry(entry);

  assert.ok(formatted.includes('...'));
  assert.ok(!formatted.includes('A'.repeat(61)));
});

test('formatScheduledEntry formats scheduled reply correctly', () => {
  const entry = {
    created_at: '2026-04-23T10:00:00+05:30',
    group_name: 'Andheri Brokers',
    text: '2 BHK available in Andheri West',
    scheduled_for: '2026-04-24T09:00:00+05:30',
  };

  const formatted = formatScheduledEntry(entry);

  assert.ok(formatted.includes('[10:00]'));
  assert.ok(formatted.includes('Andheri Brokers'));
  assert.ok(formatted.includes('Scheduled for:'));
  assert.ok(formatted.includes('IST'));
});

function formatApprovalBox(replyText, target) {
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

function formatScheduledTime(isoTime) {
  const date = new Date(isoTime);
  const options = {
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

function formatTimeOnly(isoTime) {
  const date = new Date(isoTime);
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}

function formatSentLogEntry(entry) {
  const time = entry.sent_at ? formatTimeOnly(entry.sent_at) : '??:??';
  const target = entry.group_name || entry.target || 'Unknown';
  const text = entry.text || '';
  const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
  return `[${time}] → ${target} — "${preview}"`;
}

function formatScheduledEntry(entry) {
  const time = entry.created_at ? formatTimeOnly(entry.created_at) : '??:??';
  const target = entry.group_name || entry.target || 'Unknown';
  const text = entry.text || '';
  const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
  const scheduledFor = entry.scheduled_for ? formatScheduledTime(entry.scheduled_for) : 'Unknown';
  return `[${time}] → ${target} — "${preview}"\n  Scheduled for: ${scheduledFor}`;
}
