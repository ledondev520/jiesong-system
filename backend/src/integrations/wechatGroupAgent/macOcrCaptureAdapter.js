'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

class MacOcrCaptureAdapter {
  constructor({ sourcePath, binaryPath }) {
    this.sourcePath = path.resolve(sourcePath);
    this.binaryPath = path.resolve(binaryPath);
  }

  compile() {
    fs.mkdirSync(path.dirname(this.binaryPath), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.dirname(this.binaryPath), 0o700);
    const result = spawnSync('/usr/bin/clang', [
      this.sourcePath,
      '-o',
      this.binaryPath,
      '-fobjc-arc',
      '-framework', 'AppKit',
      '-framework', 'CoreGraphics',
      '-framework', 'ScreenCaptureKit',
      '-framework', 'Vision',
    ], { encoding: 'utf8', timeout: 120_000 });
    if (result.status !== 0) {
      const details = (result.stderr || '').trim().slice(-2_000);
      throw new Error(`failed to compile macOS OCR helper: ${details}`);
    }
    fs.chmodSync(this.binaryPath, 0o700);
    return this.binaryPath;
  }

  ensureCompiled() {
    if (!fs.existsSync(this.binaryPath)) this.compile();
  }

  captureWechatWindow() {
    return this.run(['--wechat-window']);
  }

  captureImage(imagePath) {
    return this.run(['--image', path.resolve(imagePath)]);
  }

  run(args) {
    this.ensureCompiled();
    const result = spawnSync(this.binaryPath, args, {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.status !== 0) {
      throw new Error((result.stderr || 'macOS OCR helper failed').trim());
    }
    return JSON.parse(result.stdout);
  }
}

module.exports = {
  MacOcrCaptureAdapter,
};
