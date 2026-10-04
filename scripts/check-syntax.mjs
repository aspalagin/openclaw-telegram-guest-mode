#!/usr/bin/env node
// Cross-platform `node --check` over every kit source file (replaces the former shell loop in package.json).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = ["apply-guest-mode.mjs", "check-guest-mode.mjs", path.join("scripts", "check-syntax.mjs")];
for (const dir of ["lib", "modules"]) for (const name of fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".mjs")).sort()) files.push(path.join(dir, name));
let failed = 0;
for (const rel of files) {
  const r = spawnSync(process.execPath, ["--check", path.join(root, rel)], { encoding: "utf8" });
  if (r.status !== 0) { failed++; console.error(`${rel}: ${(r.stderr || r.stdout || "node --check failed").trim()}`); }
}
console.log(`check:syntax ${files.length - failed}/${files.length} ok`);
process.exitCode = failed ? 1 : 0;
