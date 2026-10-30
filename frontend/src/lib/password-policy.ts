/** Keep new-password rules aligned with backend/src/utils/passwordPolicy.js. Login accepts legacy passwords. */
/** 常显提示只说规则本身；72字节上限仅在 PASSWORD_MESSAGE 触发时才解释。 */
export const PASSWORD_HINT = "至少8位";
export const PASSWORD_MESSAGE = "密码需至少8个字符，且不超过72字节";
export const isValidPassword = (value: string) =>
  Array.from(value).length >= 8 && new TextEncoder().encode(value).length <= 72;
