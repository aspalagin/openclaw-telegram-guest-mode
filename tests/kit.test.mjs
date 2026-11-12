// Mutates only the explicitly supplied disposable npm package; never use a live install.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { kitRoot, walkJs, TESTED_OPENCLAW_VERSIONS } from "../lib/kit.mjs";

if (!process.argv[2]) throw new Error("Pass the root of a disposable, pristine npm package");
const root = fs.realpathSync(process.argv[2]);
assert.notEqual(root, "/usr/lib/node_modules/openclaw", "refusing the system install");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
assert.ok(TESTED_OPENCLAW_VERSIONS.includes(version), version);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guest-kit-test-"));
function run(file, args, expected = 0) {
  const result = spawnSync(process.execPath, [path.join(kitRoot, file), ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, expected, result.stderr + result.stdout);
  return result.stdout;
}
function digest() {
  const hash = createHash("sha256");
  for (const file of [...walkJs(path.join(root, "dist")), ...walkJs(path.join(root, "node_modules/@openclaw/ai/dist"))].sort()) {
    hash.update(file); hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}
const args = ["--package-root", root, "--with-ultrafast", "--json"];
try {
  run("check-guest-mode.mjs", args, 1);
  const before = digest();
  const dry = JSON.parse(run("apply-guest-mode.mjs", [...args, "--dry-run"]));
  assert.equal(dry.status, "dry-run");
  assert.equal(digest(), before, "dry run wrote a bundle");
  console.log(run("tests/rich-composition.test.mjs", [path.join(root, "dist")]).trim());
  const applied = JSON.parse(run("apply-guest-mode.mjs", [...args, "--backup-dir", tmp]));
  assert.equal(applied.status, "patched");
  assert.equal(JSON.parse(run("check-guest-mode.mjs", args)).ok, true);
  for (const file of ["tests/guest-ownership.test.mjs", "tests/guest-child-followup.test.mjs", "tests/guest-policy.test.mjs", "tests/guest-ultrafast.test.mjs"]) console.log(run(file, [path.join(root, "dist")]).trim());
  const after = digest();
  const repeated = JSON.parse(run("apply-guest-mode.mjs", [...args, "--backup-dir", tmp]));
  assert.equal(repeated.status, "unchanged");
  assert.equal(digest(), after, "second apply wrote a bundle");
  const foreign = path.join(tmp, "unsupported");
  fs.mkdirSync(path.join(foreign, "dist"), { recursive: true });
  fs.writeFileSync(path.join(foreign, "package.json"), JSON.stringify({ name: "openclaw", version: "0.0.0" }));
  const refused = JSON.parse(run("apply-guest-mode.mjs", ["--package-root", foreign, "--dry-run", "--json"], 1));
  assert.equal(refused.status, "refused");
  console.log(JSON.stringify({ version, ok: true, changed: applied.entries.filter(entry => entry.changed).length, dryRunUnchanged: true, idempotent: true, unsupportedRefused: true }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
