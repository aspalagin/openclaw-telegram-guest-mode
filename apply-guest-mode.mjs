#!/usr/bin/env node
// OpenClaw Telegram Guest Mode — portable dist patch layer (apply).
//
// Adds Telegram Bot API guest-query support (supports_guest_queries / guest_message / answerGuestQuery)
// to an installed OpenClaw package by patching built dist bundles in place. Tested baseline: OpenClaw
// 2026.9.7. Review README.md and HOTFIX_NOTES.md before running this on a production host.
//
//   node apply-guest-mode.mjs [--dry-run|--check] [--package-root <dir>] [--backup-dir <dir>] [--with-ultrafast] [--allow-untested] [--json]
//   env: OPENCLAW_PACKAGE_ROOT, OPENCLAW_HOTFIX_BACKUP_DIR, OPENCLAW_GUEST_MODE_ULTRAFAST=1, OPENCLAW_GUEST_MODE_ALLOW_UNTESTED=1
//
// All-or-nothing: every plan entry is computed in memory first (locate → cascade patch → idempotency →
// assertions → node --check); nothing is written if any entry fails. Writes are preceded by a per-file
// backup. Re-running on a patched install reports every entry as unchanged; older module versions (the
// v1.1.x kit or earlier module revisions) are upgraded in place. An OpenClaw version outside
// TESTED_OPENCLAW_VERSIONS is refused unless --allow-untested is given: matching anchors on another
// version prove nothing about the runtime behaviour of the inserted code.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { KIT_VERSION, TAG, TESTED_OPENCLAW_VERSIONS, UsageError, buildCorpora, loadModule, loadPlan, parseOptions, readPackageVersion } from "./lib/kit.mjs";

const USAGE = "usage: node apply-guest-mode.mjs [--dry-run|--check] [--package-root <dir>] [--backup-dir <dir>] [--with-ultrafast] [--allow-untested] [--json]";
let options;
try {
  options = parseOptions();
} catch (err) {
  if (!(err instanceof UsageError)) throw err;
  console.error(`${TAG} ${err.message}\n${USAGE}`);
  process.exit(2);
}
if (options.help) {
  console.log(USAGE);
  process.exit(0);
}
const log = (msg) => { if (!options.json) console.log(`${TAG} ${msg}`); };
const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");
const timestamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
function nodeCheck(file) {
  const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  return r.status === 0 ? null : (r.stderr || r.stdout || "node --check failed").slice(0, 600);
}

async function main() {
  const { packageRoot, dryRun } = options;
  const corpora = buildCorpora(packageRoot);
  const version = readPackageVersion(packageRoot);
  const report = { kit: KIT_VERSION, openclaw: version, packageRoot, dryRun, withUltrafast: options.withUltrafast, allowUntested: options.allowUntested, entries: [], failures: [], warnings: [], backup: null, status: null };
  if (!TESTED_OPENCLAW_VERSIONS.includes(version)) {
    if (!options.allowUntested) {
      report.status = "refused";
      report.failures.push(`OpenClaw ${version} is not a tested baseline (${TESTED_OPENCLAW_VERSIONS.join(", ")})`);
      log(`refused: OpenClaw ${version} is not a tested baseline (${TESTED_OPENCLAW_VERSIONS.join(", ")}); matching anchors on another version are not a verified port. Re-run with --allow-untested (or OPENCLAW_GUEST_MODE_ALLOW_UNTESTED=1) to attempt it on a copy, then follow HOTFIX_NOTES.md "Porting".`);
      log(`complete status=refused changed=0 (nothing written) entries=0 openclaw=${version} kit=${KIT_VERSION} packageRoot=${packageRoot}`);
      if (options.json) console.log(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }
    report.warnings.push(`OpenClaw ${version} is not a tested baseline (${TESTED_OPENCLAW_VERSIONS.join(", ")}); --allow-untested given: the anchors refuse unmatched code, but a green run on another version is not a verified port`);
  }
  const plan = await loadPlan(options);
  const writes = [];

  for (const entry of plan) {
    const item = { key: entry.key, optional: entry.optional ?? null, file: null, modules: [], skipped: [], changed: false, status: "ok", error: null };
    report.entries.push(item);
    try {
      const corpus = corpora[entry.corpus];
      if (!corpus) throw new Error(`corpus "${entry.corpus}" missing (node_modules/@openclaw/ai/dist not found under ${packageRoot})`);
      const loaded = [];
      for (const name of entry.modules) {
        const mod = await loadModule(name);
        const { file, via } = corpus.locateModule(mod, item.file);
        if (item.file && file !== item.file) throw new Error(`${name}: located ${path.basename(file)} but earlier modules of "${entry.key}" located ${path.basename(item.file)}`);
        item.file = file;
        loaded.push({ name, mod, via });
      }
      const before = corpus.read(item.file);
      let src = before;
      const active = [];
      for (const { name, mod, via } of loaded) {
        const skipReason = typeof mod.applicable === "function" ? mod.applicable(src, item.file, { packageRoot }) : null;
        if (skipReason) { item.skipped.push({ name, reason: skipReason }); item.modules.push({ name, changed: false, skipped: true, via }); active.push({ name, mod }); continue; }
        const next = mod.patch(src);
        item.modules.push({ name, changed: next !== src, skipped: false, via });
        active.push({ name, mod });
        src = next;
      }
      let again = src;
      for (const { mod } of active) { if (typeof mod.applicable === "function" && mod.applicable(again, item.file, { packageRoot })) continue; again = mod.patch(again); }
      if (again !== src) throw new Error("composite is not idempotent (second pass changed the file)");
      item.changed = src !== before;
      if (item.changed) {
        const tmp = path.join(os.tmpdir(), `oc-guest-mode-${process.pid}-${path.basename(item.file)}`);
        fs.writeFileSync(tmp, src);
        const synErr = nodeCheck(tmp);
        fs.unlinkSync(tmp);
        if (synErr) throw new Error(`syntax: ${synErr}`);
        writes.push({ file: item.file, before, after: src, key: entry.key });
      }
      for (const { name, mod } of active) {
        for (const assertion of mod.check.assertions) {
          const failure = assertion(src, item.file);
          if (failure) throw new Error(`${name}: assertion failed after patch: ${failure}`);
        }
      }
    } catch (err) {
      item.status = "failed";
      item.error = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      report.failures.push(`${entry.key}: ${item.error}`);
    }
  }

  for (const item of report.entries) {
    if (item.status === "failed") { log(`${item.key}: FAILED — ${item.error}`); continue; }
    const rel = path.relative(packageRoot, item.file);
    const names = item.modules.map((m) => `${m.name}${m.skipped ? "(n/a)" : m.changed ? "*" : ""}`).join(", ");
    const allSkipped = item.modules.length > 0 && item.modules.every((m) => m.skipped);
    const suffix = item.changed ? "" : allSkipped ? " (n/a)" : " (already applied)";
    log(`${item.key} (${rel}): ${item.changed ? (dryRun ? "would patch" : "patch") : "ok"} [${names}]${suffix}`);
    for (const s of item.skipped) log(`  ${s.name}: ${s.reason}`);
  }
  for (const w of report.warnings) log(`warn: ${w}`);

  if (report.failures.length) {
    report.status = "failed";
  } else if (dryRun) {
    report.status = writes.length ? "dry-run" : "unchanged";
  } else if (writes.length === 0) {
    report.status = "unchanged";
  } else {
    const backupDir = path.join(options.backupRoot, timestamp());
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    for (const w of writes) {
      const rel = path.relative(packageRoot, w.file);
      const backupPath = path.join(backupDir, `${rel}.${sha256(w.before).slice(0, 12)}.bak`);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(backupPath, w.before, { mode: 0o600 });
    }
    fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify({ kit: KIT_VERSION, openclaw: version, packageRoot, files: writes.map((w) => ({ file: path.relative(packageRoot, w.file), key: w.key, sha256Before: sha256(w.before), sha256After: sha256(w.after) })) }, null, 2));
    report.backup = backupDir;
    for (const w of writes) {
      fs.writeFileSync(w.file, w.after, "utf8");
      const synErr = nodeCheck(w.file);
      if (synErr) {
        fs.writeFileSync(w.file, w.before, "utf8");
        throw new Error(`post-write syntax check failed for ${w.file}, restored original: ${synErr}`);
      }
    }
    report.status = "patched";
    log(`backup: ${backupDir}`);
  }
  // `changed` counts entries actually written (or, in dry-run, entries that would be written). A failed
  // run writes nothing, so it reports 0 even if some entries were patched in memory.
  const changed = report.status === "failed" ? 0 : report.entries.filter((e) => e.changed).length;
  log(`complete status=${report.status} changed=${changed}${report.status === "failed" ? " (nothing written)" : ""} entries=${report.entries.length} openclaw=${version} kit=${KIT_VERSION} packageRoot=${packageRoot}`);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  if (report.status === "failed") process.exitCode = 1;
}

main().catch((err) => {
  console.error(`${TAG} ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
