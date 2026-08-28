'use strict';

const fs = require('node:fs');
const path = require('node:path');

class SecureDraftAdapter {
  constructor(rootDir) {
    this.rootDir = path.resolve(rootDir);
    this.draftPath = path.join(this.rootDir, 'latest-summary-draft.json');
  }

  async deliver({ groupName, summary, trigger }) {
    fs.mkdirSync(this.rootDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(this.rootDir, 0o700);
    const tempPath = `${this.draftPath}.tmp`;
    const payload = {
      groupName,
      summary,
      trigger: trigger ? { keyword: trigger.keyword, scope: trigger.scope } : null,
      createdAt: new Date().toISOString(),
      status: 'draft',
    };
    fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(tempPath, 0o600);
    fs.renameSync(tempPath, this.draftPath);
    fs.chmodSync(this.draftPath, 0o600);
    return { delivered: false, mode: 'draft', path: this.draftPath };
  }

  read() {
    if (!fs.existsSync(this.draftPath)) return null;
    return JSON.parse(fs.readFileSync(this.draftPath, 'utf8'));
  }

  markSent({ groupName, expectedCreatedAt }) {
    const draft = this.read();
    if (!draft) throw new Error('summary draft does not exist');
    if (draft.groupName !== groupName) throw new Error('summary draft group does not match');
    if (expectedCreatedAt && draft.createdAt !== expectedCreatedAt) {
      throw new Error('summary draft changed before delivery acknowledgement');
    }
    const tempPath = `${this.draftPath}.tmp`;
    const next = { ...draft, status: 'sent', sentAt: new Date().toISOString() };
    fs.writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(tempPath, 0o600);
    fs.renameSync(tempPath, this.draftPath);
    fs.chmodSync(this.draftPath, 0o600);
    return { status: next.status, sentAt: next.sentAt };
  }
}

module.exports = {
  SecureDraftAdapter,
};
