import { test } from 'node:test';
import assert from 'node:assert';
import { formatPrice } from '../src/utils.js';

test('formatPrice displays amounts below 1 crore in lakhs', () => {
  assert.strictEqual(formatPrice(8500000), '₹85L');
  assert.strictEqual(formatPrice(165000), '₹1.65L');
  assert.strictEqual(formatPrice(50000), '₹50K');
});

test('formatPrice displays amounts at or above 1 crore in crores', () => {
  assert.strictEqual(formatPrice(10000000), '₹1Cr');
  assert.strictEqual(formatPrice(12000000), '₹1.2Cr');
  assert.strictEqual(formatPrice(25000000), '₹2.5Cr');
});

test('formatPrice adds /month suffix when isMonthly is true', () => {
  assert.strictEqual(formatPrice(165000, true), '₹1.65L/month');
  assert.strictEqual(formatPrice(50000, true), '₹50K/month');
  assert.strictEqual(formatPrice(12000000, true), '₹1.2Cr/month');
});

test('formatPrice handles edge cases', () => {
  assert.strictEqual(formatPrice(null), 'N/A');
  assert.strictEqual(formatPrice(undefined), 'N/A');
  assert.strictEqual(formatPrice('abc'), 'N/A');
  assert.strictEqual(formatPrice(0), '₹0');
});
