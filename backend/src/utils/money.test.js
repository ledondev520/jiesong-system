const test = require('node:test');
const assert = require('node:assert/strict');
const { roundMoney, toCents } = require('./money');
const { roundUnitPrice } = require('../services/exportPricing');

test('roundMoney fixes binary float noise', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(1.255), 1.26);
  assert.equal(roundMoney(1000.005), 1000.01);
  assert.equal(roundMoney(0.285), 0.29);
  assert.equal(roundMoney(123456789.115), 123456789.12);
});

test('roundMoney rounds half away from zero (symmetric for negatives)', () => {
  assert.equal(roundMoney(-1.005), -1.01);
  assert.equal(roundMoney(-0.1 - 0.2), -0.3);
  assert.equal(roundMoney(-2.5), -2.5);
  assert.equal(roundMoney(0.004), 0);
  assert.equal(roundMoney(-0.004), 0);
  assert.equal(roundMoney(0.005), 0.01);
});

test('roundMoney maps non-finite and empty input to 0', () => {
  for (const v of [null, undefined, '', 'abc', NaN, Infinity, -Infinity]) assert.equal(roundMoney(v), 0);
  assert.equal(roundMoney('12.345'), 12.35);
});

test('toCents returns integer cents', () => {
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(-0.005), -1);
});

test('locked USD price rule stays single-sourced in exportPricing (13000 / 6.52 = 1993.87 -> 1995)', () => {
  assert.equal(roundUnitPrice(13000 / 6.52, 5), 1995);
});
