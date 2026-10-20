/** Input: new password; Output: shared rules for every password write (never for login). */
const { createError } = require('../middleware/errorHandler');
const PASSWORD_MESSAGE = '密码需至少8个字符，且不超过72字节';
const isValidPassword = (value) => typeof value === 'string'
  && Array.from(value).length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
const assertPassword = (value) => {
  if (!isValidPassword(value)) throw createError(PASSWORD_MESSAGE, 400);
};
module.exports = { isValidPassword, assertPassword, PASSWORD_MESSAGE };
