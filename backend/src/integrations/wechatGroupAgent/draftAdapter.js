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
}

module.exports = {
  SecureDraftAdapter,
};
