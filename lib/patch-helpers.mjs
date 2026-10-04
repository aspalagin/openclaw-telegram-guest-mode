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
export function contains(needle, detail = needle) { return (content) => content.includes(needle) ? null : `missing ${detail}`; }
export function containsAny(needles, detail) { return (content) => needles.some((n) => content.includes(n)) ? null : `missing ${detail}`; }
export function notContains(needle, detail = needle) { return (content) => content.includes(needle) ? `unexpected ${detail}` : null; }
export function countAtLeast(needle, min, detail = needle) { return (content) => { const c = content.split(needle).length - 1; return c >= min ? null : `expected at least ${min} occurrences of ${detail}, found ${c}`; }; }
export function count(source, needle) { return source.split(needle).length - 1; }

// Runtime expression (JS source text) that resolves the rules file inside the patched bundle.
// Nothing is hard-coded for one host: env override first, then the OpenClaw state dir
// (OPENCLAW_STATE_DIR, else $HOME/.openclaw) — the same resolution OpenClaw uses for its own state.
export function rulesFileExpression(envName, baseName) {
  return `process.env.${envName} || \`\${process.env.OPENCLAW_STATE_DIR || \`\${process.env.HOME || "/root"}/.openclaw\`}/${baseName}\``;
}
