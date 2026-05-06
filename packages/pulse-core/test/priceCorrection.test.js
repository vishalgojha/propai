import { test } from 'node:test';
import assert from 'node:assert';
import { parsePricesFromText, correctPriceWithText } from '../src/normalizer.js';

test('parsePricesFromText extracts lakh prices', () => {
  const prices = parsePricesFromText('3 BHK Bandra West 1.3L/month');
  assert.strictEqual(prices.length, 1);
  assert.strictEqual(prices[0].value, 130000);
});

test('parsePricesFromText extracts crore prices', () => {
  const prices = parsePricesFromText('2 BHK Worli 2.5cr sale');
  assert.strictEqual(prices.length, 1);
  assert.strictEqual(prices[0].value, 25000000);
});

test('parsePricesFromText extracts k prices', () => {
  const prices = parsePricesFromText('1 BHK Andheri 45k rent');
  assert.strictEqual(prices.length, 1);
  assert.strictEqual(prices[0].value, 45000);
});

test('parsePricesFromText handles multiple prices', () => {
  const prices = parsePricesFromText('2BHK 1.5L rent, deposit 5L');
  assert.strictEqual(prices.length, 2);
  assert.strictEqual(prices[0].value, 150000);
  assert.strictEqual(prices[1].value, 500000);
});

test('parsePricesFromText handles ₹ symbol', () => {
  const prices = parsePricesFromText('₹1.3L/month');
  assert.strictEqual(prices.length, 1);
  assert.strictEqual(prices[0].value, 130000);
});

test('correctPriceWithText fixes 10x decimal errors', () => {
  // LLM reads "1.3L" as 1300000 instead of 130000
  const corrected = correctPriceWithText(1300000, '3 BHK D N Nagar 1.3L/month');
  assert.strictEqual(corrected, 130000);
});

test('correctPriceWithText leaves correct prices unchanged', () => {
  const corrected = correctPriceWithText(130000, '3 BHK D N Nagar 1.3L/month');
  assert.strictEqual(corrected, 130000);
});

test('correctPriceWithText handles no text match', () => {
  const corrected = correctPriceWithText(80000, 'some message without prices');
  assert.strictEqual(corrected, 80000);
});

test('correctPriceWithText handles null price', () => {
  const corrected = correctPriceWithText(null, '3 BHK 1.3L');
  assert.strictEqual(corrected, null);
});

test('correctPriceWithText catches high rental prices', () => {
  // LLM returns 8500000 for what should be 85k
  const corrected = correctPriceWithText(8500000, '1 BHK Andheri West 85k rent');
  assert.strictEqual(corrected, 85000);
});
