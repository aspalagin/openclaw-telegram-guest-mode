// Shared string-patching helpers for the module files in ../modules. Self-contained: the kit
// never imports anything from an operator's private hotfix layer.
export function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index === -1) throw new Error(`missing ${label}`);
  if (source.indexOf(before, index + before.length) !== -1) throw new Error(`ambiguous ${label}`);
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
}
export function insertBefore(source, before, insert, label) {
  if (source.includes(insert.trim())) return source;
  const index = source.indexOf(before);
  if (index === -1) throw new Error(`missing insertion point for ${label}`);
  return `${source.slice(0, index)}${insert}${source.slice(index)}`;
}
export function insertAfter(source, after, insert, label) {
  if (source.includes(insert.trim())) return source;
  const index = source.indexOf(after);
  if (index === -1) throw new Error(`missing insertion point for ${label}`);
  return `${source.slice(0, index + after.length)}${insert}${source.slice(index + after.length)}`;
}
// Region upsert: a module owns one `//#region <start> … //#endregion` block. On a pristine chunk the
// block is inserted before `anchor`; on a patched chunk (any earlier revision of the block) the whole
// region is replaced, which is how module versions are upgraded in place.
export function replaceRegion(source, { start, end = "//#endregion\n", body, anchor, label }) {
  const index = source.indexOf(start);
  if (index === -1) return insertBefore(source, anchor, body, label);
  if (source.indexOf(start, index + start.length) !== -1) throw new Error(`${label}: ambiguous region start`);
  const endIdx = source.indexOf(end, index);
  if (endIdx === -1) throw new Error(`${label}: region without ${end.trim()}`);
  return `${source.slice(0, index)}${body}${source.slice(endIdx + end.length)}`;
}
export function contains(needle, detail = needle) { return (content) => content.includes(needle) ? null : `missing ${detail}`; }
export function containsAny(needles, detail) { return (content) => needles.some((n) => content.includes(n)) ? null : `missing ${detail}`; }
export function notContains(needle, detail = needle) { return (content) => content.includes(needle) ? `unexpected ${detail}` : null; }
export function countAtLeast(needle, min, detail = needle) { return (content) => { const c = content.split(needle).length - 1; return c >= min ? null : `expected at least ${min} occurrences of ${detail}, found ${c}`; }; }
export function count(source, needle) { return source.split(needle).length - 1; }
// Assertion: `needle` occurs exactly `expected` times (declaration + call sites); the message names the module intent.
export function countExactly(needle, expected, detail = needle) { return (content) => { const c = count(content, needle); return c === expected ? null : `expected exactly ${expected} occurrence(s) of ${detail}, found ${c}`; }; }

// Runtime expression (JS source text) that resolves the rules file inside the patched bundle.
// Nothing is hard-coded for one host: env override first, then the OpenClaw state dir
// (OPENCLAW_STATE_DIR, else <home>/.openclaw) — the same resolution OpenClaw uses for its own state.
// The home directory comes from HOME (POSIX) or USERPROFILE (Windows); with neither set the path is
// relative to the filesystem root and the rules file is simply reported missing (built-in defaults).
export function rulesFileExpression(envName, baseName) {
  return `process.env.${envName} || \`\${process.env.OPENCLAW_STATE_DIR || \`\${process.env.HOME || process.env.USERPROFILE || ""}/.openclaw\`}/${baseName}\``;
}
