/** Keep new-password rules aligned with backend/src/utils/passwordPolicy.js. Login accepts legacy passwords. */
export const PASSWORD_MESSAGE = "密码需至少8个字符，且不超过72字节";
export const isValidPassword = (value: string) =>
  Array.from(value).length >= 8 && new TextEncoder().encode(value).length <= 72;
