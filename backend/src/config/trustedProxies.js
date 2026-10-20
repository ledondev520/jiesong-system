/** Input: explicit proxy IP/CIDR allowlist; Output: validated Express trust list. Default: no trust. */
const { isIP } = require('node:net');

function parseTrustedProxyCidrs(value = '') {
  if (!value.trim()) return [];
  const entries = value.split(',').map((entry) => entry.trim());
  for (const entry of entries) {
    const [address, prefix, extra] = entry.split('/');
    const family = isIP(address);
    // No boolean, hop count, named range, wildcard or /0 trust. Bad config fails at startup.
    if (!family || extra !== undefined || (prefix !== undefined &&
        (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw new Error('TRUSTED_PROXY_CIDRS 仅允许明确的代理 IP/CIDR 白名单，禁止全网信任');
    }
  }
  return [...new Set(entries)];
}

module.exports = { parseTrustedProxyCidrs };
