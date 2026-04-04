const crypto = require('node:crypto');
const config = require('../config');

const getOpenAgentRuntimeToken = () => {
  return crypto
    .createHash('sha256')
    .update(`${config.jwt.secret}:open-agent-runtime`)
    .digest('hex');
};

const isValidOpenAgentRuntimeToken = (token) => {
  if (typeof token !== 'string' || !token) {
    return false;
  }
  return token === getOpenAgentRuntimeToken();
};

module.exports = {
  getOpenAgentRuntimeToken,
  isValidOpenAgentRuntimeToken,
};
