// Kit runtime shared by apply-guest-mode.mjs and check-guest-mode.mjs: CLI options, dist corpus
// locator (content needles, never chunk hashes), plan loading and the module contract.
//
// Module contract (modules/<name>.mjs):
//   export const label   — module id (equals the file name)
//   export const target  — { key, label, needles[] } content locator of the dist chunk
//   export function patch(source) — pure, idempotent transform; may cascade (import and call the
//                                   patch() of the module it extends)
//   export const check   — { gate, assertions: [(source, file) => null | "failure"] }
//   export function applicable?(source, file, ctx) — optional: return a reason string to skip the
//                                   module on this install (conditional modules), null to apply
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const KIT_VERSION = "1.2.0";
export const TESTED_OPENCLAW_VERSIONS = ["2026.9.7"];
export const TAG = "[openclaw-guest-mode]";
export const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseOptions(argv = process.argv.slice(2)) {
  const opt = (name, dflt) => { const i = argv.indexOf(name); return i === -1 ? dflt : argv[i + 1]; };
  const has = (name) => argv.includes(name);
  return {
    dryRun: has("--dry-run") || has("--check"),
    json: has("--json"),
    packageRoot: path.resolve(opt("--package-root", process.env.OPENCLAW_PACKAGE_ROOT || "/usr/lib/node_modules/openclaw")),
    backupRoot: opt("--backup-dir", process.env.OPENCLAW_HOTFIX_BACKUP_DIR || "./backups"),
    withUltrafast: has("--with-ultrafast") || process.env.OPENCLAW_GUEST_MODE_ULTRAFAST === "1",
    help: has("--help") || has("-h"),
  };
}

// The standalone updater bundle (dist/package-update-activation-recovery.mjs) duplicates almost the
// whole gateway and would make every needle ambiguous; it is not part of the gateway runtime.
const EXCLUDED_DIST_FILES = new Set(["package-update-activation-recovery.mjs"]);
export function walkJs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (!(path.basename(dir) === "dist" && e.name === "worker")) out.push(...walkJs(f)); }
    else if (e.isFile() && /\.(?:js|mjs)$/.test(e.name) && !EXCLUDED_DIST_FILES.has(e.name)) out.push(f);
  }
  return out;
}

export class Corpus {
  constructor(files) { this.files = files; this.cache = new Map(); }
  read(f) { let c = this.cache.get(f); if (c === undefined) { c = fs.readFileSync(f, "utf8"); this.cache.set(f, c); } return c; }
  findOne(label, needles) {
    const m = this.files.filter((f) => needles.every((n) => this.read(f).includes(n)));
    if (m.length === 0) throw new Error(`could not find ${label}`);
    if (m.length > 1) throw new Error(`found multiple ${label}: ${m.map((f) => path.basename(f)).join(", ")}`);
    return m[0];
  }
  locate(target) { return this.findOne(target.label, target.needles); }
  assertionsPass(mod, file) { const as = mod.check?.assertions ?? []; if (!as.length) return false; const c = this.read(file); return as.every((a) => a(c, file) === null); }
  // Needles describe pristine code; on an already-patched install a module may have rewritten its own
  // anchors, so fall back to the file other modules of the same plan entry located, or to the single
  // file on which the module's assertions already pass.
  locateModule(mod, hint = null) {
    try { return { file: this.locate(mod.target), via: "needles" }; } catch (e) {
      if (!/could not find/.test(e.message)) throw e;
      if (hint && this.assertionsPass(mod, hint)) return { file: hint, via: "hint+assertions" };
      const m = this.files.filter((f) => this.assertionsPass(mod, f));
      if (m.length === 1) return { file: m[0], via: "assertions" };
      throw new Error(`${e.message}; already-patched fallback: ${m.length === 0 ? "no file passes module assertions" : `multiple files pass assertions: ${m.map((f) => path.basename(f)).join(", ")}`}`);
    }
  }
}

export async function loadModule(name) {
  const file = path.join(kitRoot, "modules", `${name}.mjs`);
  const mod = await import(pathToFileURL(file).href);
  if (typeof mod.patch !== "function" || !mod.target || !mod.check) throw new Error(`${name}: module contract violated (patch/target/check)`);
  return mod;
}

export async function loadPlan(options) {
  const { PLAN, AI_PLAN, ULTRAFAST_PLAN, ULTRAFAST_AI_PLAN } = await import(pathToFileURL(path.join(kitRoot, "lib", "plan.mjs")).href);
  const entries = [];
  for (const [key, mods] of Object.entries(PLAN)) entries.push({ key, corpus: "dist", modules: mods });
  for (const [key, mods] of Object.entries(AI_PLAN)) entries.push({ key, corpus: "ai", modules: mods });
  if (options.withUltrafast) {
    for (const [key, mods] of Object.entries(ULTRAFAST_PLAN)) entries.push({ key, corpus: "dist", modules: mods, optional: "ultrafast" });
    for (const [key, mods] of Object.entries(ULTRAFAST_AI_PLAN)) entries.push({ key, corpus: "ai", modules: mods, optional: "ultrafast" });
  }
  return entries;
}

export function readPackageVersion(packageRoot) {
  try { return JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).version ?? "unknown"; } catch { return "unknown"; }
}

export function buildCorpora(packageRoot) {
  const distDir = path.join(packageRoot, "dist");
  if (!fs.existsSync(distDir)) throw new Error(`dist directory does not exist: ${distDir}`);
  const aiDistDir = path.join(packageRoot, "node_modules/@openclaw/ai/dist");
  return {
    dist: new Corpus(walkJs(distDir)),
    ai: fs.existsSync(aiDistDir) ? new Corpus(walkJs(aiDistDir)) : null,
  };
}
