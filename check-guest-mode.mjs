#!/usr/bin/env node
// Signature checker for the OpenClaw Telegram Guest Mode patch layer (apply-guest-mode.mjs).
// Locates every target chunk, runs each module's assertions (markers, anchors, drift guards) against the
// installed code and exits 1 when anything fails. Run it after applying the kit and after every OpenClaw
// package update. Conditional modules (telegram-guest-allowed-update, guest-announce-fallback-skip)
// report "n/a" when they do not apply to this build; the optional ultrafast set is checked only with
// --with-ultrafast.
//
//   node check-guest-mode.mjs [--package-root <dir>] [--with-ultrafast] [--json]
import path from "node:path";
import { KIT_VERSION, TAG, TESTED_OPENCLAW_VERSIONS, buildCorpora, loadModule, loadPlan, parseOptions, readPackageVersion } from "./lib/kit.mjs";

const options = parseOptions();
if (options.help) {
  console.log("usage: node check-guest-mode.mjs [--package-root <dir>] [--with-ultrafast] [--json]");
  process.exit(0);
}

async function main() {
  const { packageRoot } = options;
  const corpora = buildCorpora(packageRoot);
  const version = readPackageVersion(packageRoot);
  const plan = await loadPlan(options);
  const results = [];
  for (const entry of plan) {
    const corpus = corpora[entry.corpus];
    let file = null;
    for (const name of entry.modules) {
      const result = { key: entry.key, module: name, file: null, ok: false, na: false, failures: [] };
      results.push(result);
      try {
        const mod = await loadModule(name);
        if (!corpus) throw new Error(`corpus "${entry.corpus}" missing under ${packageRoot}`);
        const located = corpus.locateModule(mod, file);
        file = located.file;
        result.file = file;
        const content = corpus.read(file);
        const skipReason = typeof mod.applicable === "function" ? mod.applicable(content, file, { packageRoot }) : null;
        if (skipReason) result.na = skipReason;
        result.failures = (mod.check?.assertions ?? []).map((a) => a(content, file)).filter(Boolean);
        result.ok = result.failures.length === 0;
      } catch (err) {
        result.failures = [err instanceof Error ? err.message : String(err)];
      }
    }
  }
  const failed = results.filter((r) => !r.ok);
  if (options.json) {
    console.log(JSON.stringify({ kit: KIT_VERSION, openclaw: version, packageRoot, results, ok: failed.length === 0 }, null, 2));
  } else {
    console.log(`${TAG} openclaw@${version} kit=${KIT_VERSION} root=${packageRoot}`);
    if (!TESTED_OPENCLAW_VERSIONS.includes(version)) console.log(`${TAG} warn: version differs from tested baseline ${TESTED_OPENCLAW_VERSIONS.join(", ")}; review anchors before treating this as green`);
    for (const r of results) {
      const filePart = r.file ? ` ${path.relative(packageRoot, r.file)}` : "";
      console.log(`[${r.ok ? (r.na ? "n/a" : "ok") : "fail"}] ${r.key}/${r.module}${filePart}${r.na ? ` — ${r.na}` : ""}`);
      for (const f of r.failures) console.log(`  - ${f}`);
    }
    console.log(`${TAG} summary ok=${results.length - failed.length} failed=${failed.length}`);
  }
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`${TAG} ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
