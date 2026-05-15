import { test } from 'node:test';
import assert from 'node:assert';
import { computeMostActiveGroups, computeRecentListings, computeTopBrokers, computeActivityTrends, computeInsights } from '../src/insights.js';

const now = Date.now();
const makeRecord = (overrides) => ({
  timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  group_name: 'Mumbai Brokers',
  group_id: '123@g.us',
  contacts: ['Rahul 9876543210'],
  entries: [],
  ...overrides,
});

test('computeMostActiveGroups ranks groups by post count', () => {
  const records = [
    makeRecord({ group_name: 'Group A', timestamp: new Date(now - 1 * 60 * 60 * 1000).toISOString(), entries: [{ intent: 'listing' }] }),
    makeRecord({ group_name: 'Group A', timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(), entries: [{ intent: 'listing' }] }),
    makeRecord({ group_name: 'Group B', timestamp: new Date(now - 3 * 60 * 60 * 1000).toISOString(), entries: [{ intent: 'listing' }] }),
  ];

  const result = computeMostActiveGroups(records, 'this_week');
  assert.strictEqual(result[0].name, 'Group A');
  assert.strictEqual(result[0].posts7d, 2);
  assert.strictEqual(result[1].name, 'Group B');
  assert.strictEqual(result[1].posts7d, 1);
});

test('computeRecentListings counts residential vs commercial', () => {
  const records = [
    makeRecord({
      entries: [
        { intent: 'listing_rent', property_type: '2 BHK' },
        { intent: 'listing_rent', property_type: 'office' },
      ],
    }),
  ];

  const result = computeRecentListings(records);
  assert.strictEqual(result.last24h.total, 2);
  assert.strictEqual(result.last24h.residential, 1);
  assert.strictEqual(result.last24h.commercial, 1);
});

test('computeTopBrokers extracts broker info from contacts', () => {
  const records = [
    makeRecord({ contacts: ['Rahul 9876543210'], entries: [{}, {}] }),
    makeRecord({ contacts: ['Rahul 9876543210'], entries: [{}] }),
    makeRecord({ contacts: ['Priya 9123456789'], entries: [{}] }),
  ];

  const result = computeTopBrokers(records, 'this_week');
  assert.strictEqual(result[0].name, 'Rahul');
  assert.strictEqual(result[0].phone, '9876543210');
  assert.strictEqual(result[0].listingsShared, 3);
});

test('computeActivityTrends calculates weekly stats', () => {
  const records = [
    makeRecord({ timestamp: new Date(now - 1 * 60 * 60 * 1000).toISOString() }),
    makeRecord({ timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString() }),
    makeRecord({ timestamp: new Date(now - 3 * 60 * 60 * 1000).toISOString() }),
  ];

  const result = computeActivityTrends(records);
  assert.strictEqual(result.totalCurrentWeek, 3);
  assert.ok(result.avgPerDay >= 0);
  assert.ok(['up', 'down', 'stable'].includes(result.trend));
});

test('computeInsights returns all sections', () => {
  const records = [
    makeRecord({
      entries: [{ intent: 'listing_rent', property_type: '2 BHK', location: 'Bandra West' }],
    }),
  ];

  const result = computeInsights(records, 'this_week');
  assert.ok(Array.isArray(result.mostActiveGroups));
  assert.ok(result.recentListings.last24h);
  assert.ok(Array.isArray(result.topBrokers));
  assert.ok(result.activityTrends);
});
