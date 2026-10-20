'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_MAX_FILE_BYTES = 16 * 1024 * 1024;

const normalizeMessage = (input) => {
  const capturedAt = input.capturedAt || new Date().toISOString();
  const message = {
    id: input.id || crypto.randomUUID(),
    groupName: String(input.groupName || '').trim(),
    sender: String(input.sender || '未知成员').trim(),
    kind: String(input.kind || 'text').trim(),
    text: String(input.text || '').trim(),
    isOwn: Boolean(input.isOwn),
    capturedAt,
    source: String(input.source || 'manual').trim(),
  };
  if (!message.groupName) throw new Error('groupName is required');
  if (!message.text && message.kind === 'text') throw new Error('text is required');
  message.fingerprint = input.fingerprint || crypto
    .createHash('sha256')
    .update([
      message.groupName,
      message.sender,
      message.kind,
      message.text,
      String(input.sourceFingerprint || ''),
    ].join('\0'))
    .digest('hex');
  return message;
};

class SecureJsonlMessageStore {
  constructor(rootDir, { maxFileBytes = DEFAULT_MAX_FILE_BYTES } = {}) {
    this.rootDir = path.resolve(rootDir);
    this.messagesPath = path.join(this.rootDir, 'messages.jsonl');
    this.statePath = path.join(this.rootDir, 'state.json');
    this.maxFileBytes = maxFileBytes;
    this.ensureStorage();
  }

  ensureStorage() {
    fs.mkdirSync(this.rootDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(this.rootDir, 0o700);
    if (!fs.existsSync(this.messagesPath)) {
      fs.writeFileSync(this.messagesPath, '', { mode: 0o600 });
    }
    fs.chmodSync(this.messagesPath, 0o600);
  }

  append(input) {
    const message = normalizeMessage(input);
    const recent = this.list({ groupName: message.groupName, limit: 500 });
    if (recent.some((item) => item.fingerprint === message.fingerprint)) {
      return { created: false, message };
    }
    const size = fs.statSync(this.messagesPath).size;
    if (size >= this.maxFileBytes) {
      throw new Error('wechat group message store reached its configured size limit');
    }
    fs.appendFileSync(this.messagesPath, `${JSON.stringify(message)}\n`, { mode: 0o600 });
    fs.chmodSync(this.messagesPath, 0o600);
    return { created: true, message };
  }

  list({ groupName, limit = 120, since = null } = {}) {
    if (!fs.existsSync(this.messagesPath)) return [];
    const content = fs.readFileSync(this.messagesPath, 'utf8');
    const rows = content.split('\n').filter(Boolean).flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
    const sinceMs = since ? Date.parse(since) : null;
    return rows
      .filter((item) => !groupName || item.groupName === groupName)
      .filter((item) => !sinceMs || Date.parse(item.capturedAt) >= sinceMs)
      .slice(-Math.max(1, Math.min(Number(limit) || 120, 500)));
  }

  readState() {
    if (!fs.existsSync(this.statePath)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
    } catch {
      return {};
    }
  }

  writeState(state) {
    const tempPath = `${this.statePath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(tempPath, 0o600);
    fs.renameSync(tempPath, this.statePath);
    fs.chmodSync(this.statePath, 0o600);
  }
}

module.exports = {
  SecureJsonlMessageStore,
  normalizeMessage,
};
