const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidPassword, assertPassword } = require('./passwordPolicy');
test('new passwords enforce eight Unicode characters and bcrypt 72-byte boundary', () => {
  for (const value of [undefined, null, {}, 'short', 'a'.repeat(73), '密'.repeat(25)]) {
    assert.equal(isValidPassword(value), false); assert.throws(() => assertPassword(value), { statusCode: 400 });
  }
  for (const value of ['test-only-new-password', 'a'.repeat(72), '密'.repeat(24), '🙂'.repeat(8)]) assert.equal(isValidPassword(value), true);
});
