/** Input: private Alibaba Cloud environment; Output: transactional registration/recovery email. */
const { createHmac } = require('node:crypto');
const { createError } = require('../middleware/errorHandler');
const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const isConfigured = () => Boolean(process.env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim()
  && process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim() && process.env.JIESONG_EMAIL_FROM?.trim());

// Same Hangzhou DirectMail RPC interface as Keya; no SDK or automatic retries.
async function sendCode(email, code, id, purpose) {
  if (!isConfigured()) throw createError('邮箱注册服务暂不可用，请联系管理员', 503);
  const params = {
    AccessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID.trim(), Action: 'SingleSendMail',
    Version: '2015-11-23', RegionId: 'cn-hangzhou', Format: 'JSON',
    SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0', SignatureNonce: id,
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    AccountName: process.env.JIESONG_EMAIL_FROM.trim(), AddressType: '1', ReplyToAddress: 'false',
    FromAlias: '捷淞', ToAddress: email, Subject: `捷淞${purpose}验证码`,
    TextBody: `你的捷淞${purpose}验证码是：${code}。\n\n验证码 10 分钟内有效，请勿向他人提供。${purpose === '邮箱注册' ? '注册后需由管理员审核开通。' : '重置密码后，已有登录会话将失效。'}\n如果不是你本人操作，请忽略这封邮件。`,
  };
  if (process.env.ALIBABA_CLOUD_SECURITY_TOKEN?.trim()) params.SecurityToken = process.env.ALIBABA_CLOUD_SECURITY_TOKEN.trim();
  const canonical = Object.keys(params).sort().map((key) => `${encode(key)}=${encode(params[key])}`).join('&');
  params.Signature = createHmac('sha1', `${process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET.trim()}&`)
    .update(`POST&%2F&${encode(canonical)}`).digest('base64');
  try {
    const response = await fetch('https://dm.aliyuncs.com/', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(), signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (!response.ok) throw new Error('delivery failed');
    const receipt = await response.json();
    if (!receipt.RequestId || !receipt.EnvId || receipt.Code) throw new Error('missing receipt');
  } catch {
    // Never pass upstream bodies, credentials, recipient or verification code to logs.
    throw createError('验证码发送未确认，请稍后重试', 503);
  }
}
const sendRegistrationCode = (email, code, id) => sendCode(email, code, id, '邮箱注册');
const sendPasswordResetCode = (email, code, id) => sendCode(email, code, id, '密码重置');
module.exports = { isConfigured, sendRegistrationCode, sendPasswordResetCode };
