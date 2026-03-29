/**
 * Input: Agent credential secret / bearer token
 * Output: 解析与校验辅助函数
 * Pos: Agent 账号认证基础工具
 *
 * 安全说明：
 * - Agent secret 必须为高熵随机值，数据库仅存 hash，不存明文。
 * - 这里使用 sha256 是因为 token 为系统生成随机串，不是低熵人类密码。
 */

const crypto = require('node:crypto');

const AGENT_TOKEN_PREFIX = 'jsa_';
const SECRET_HASH_PREFIX = 'sha256:';

const hashAgentSecret = (secret) => {
  if (typeof secret !== 'string' || !secret.trim()) {
    throw new TypeError('Agent secret 不能为空');
  }

  const digest = crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
  return `${SECRET_HASH_PREFIX}${digest}`;
};

const verifyAgentSecret = (secret, storedHash) => {
  if (typeof secret !== 'string' || typeof storedHash !== 'string' || !storedHash.trim()) {
    return false;
  }

  if (!storedHash.startsWith(SECRET_HASH_PREFIX)) {
    return false;
  }

  const expected = Buffer.from(storedHash.slice(SECRET_HASH_PREFIX.length), 'hex');
  const actual = Buffer.from(
    crypto.createHash('sha256').update(secret, 'utf8').digest('hex'),
    'hex'
  );

  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
};

const parseAgentBearerToken = (token) => {
  if (typeof token !== 'string' || !token.startsWith(AGENT_TOKEN_PREFIX)) {
    return null;
  }

  const separatorIndex = token.indexOf('.');
  if (separatorIndex <= AGENT_TOKEN_PREFIX.length || separatorIndex === token.length - 1) {
    return null;
  }

  return {
    credentialKey: token.slice(AGENT_TOKEN_PREFIX.length, separatorIndex),
    secret: token.slice(separatorIndex + 1),
  };
};

module.exports = {
  AGENT_TOKEN_PREFIX,
  hashAgentSecret,
  verifyAgentSecret,
  parseAgentBearerToken,
};
