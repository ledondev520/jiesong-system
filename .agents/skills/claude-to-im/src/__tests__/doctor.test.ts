import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("doctor reports missing config instead of aborting", () => {
  const fakeHome = mkdtempSync(join(tmpdir(), "cti-doctor-home-"));
  const result = spawnSync("bash", ["scripts/doctor.sh"], {
    cwd: process.cwd(),
    env: { ...process.env, HOME: fakeHome },
    encoding: "utf8",
  });

  assert.equal(result.status, 1, `unexpected exit status: ${result.status}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /config\.env exists/, "doctor should report that config.env is missing");
});
