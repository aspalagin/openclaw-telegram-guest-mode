// Portable OpenClaw 2026.10.9: guest-suppress-verbose-payloads.
import { replaceOnce, contains, notContains } from "../lib/patch-helpers.mjs";
export const label = "guest-suppress-verbose-payloads";
export const verdict = "port";
export const target = { key: "agentRunner", label: "agent runner runtime bundle", needles: ["async function completeReplyAgentRun(input) {", "const prefixNotices = [];"] };
const COMPACTION_OLD = "\t\tif (verboseEnabled) {\n\t\t\tconst suffix = typeof count === \"number\" ? ` (count ${count})` : \"\";\n\t\t\tprefixNotices.push(";
const COMPACTION_NEW = "\t\tif (verboseEnabled && !isGuestReplySession) {\n\t\t\tconst suffix = typeof count === \"number\" ? ` (count ${count})` : \"\";\n\t\t\tprefixNotices.push(";
export function patch(source) {
  if (source.includes("hotfix: guest-suppress-verbose-payloads")) return source;
  let next = replaceOnce(
    source,
    "\tconst prefixNotices = [];\n\tif (verboseEnabled && activeIsNewSession) prefixNotices.push({ text: `🧭 New session: ${followupRun.run.sessionId}` });",
    "\t//#region hotfix: guest-suppress-verbose-payloads (2026-07-27)\n\tconst isGuestReplySession = typeof sessionKey === \"string\" && sessionKey.includes(\":guest:\");\n\t//#endregion\n\tconst prefixNotices = [];\n\tif (verboseEnabled && !isGuestReplySession && activeIsNewSession) prefixNotices.push({ text: `🧭 New session: ${followupRun.run.sessionId}` });",
    "guest-suppress-verbose new-session banner",
  );
  next = replaceOnce(next, COMPACTION_OLD, COMPACTION_NEW, "guest-suppress-verbose auto-compaction notice");
  next = replaceOnce(
    next,
    "const trailingPluginStatusPayload = await buildReplyDiagnosticsPayload({",
    "const trailingPluginStatusPayload = isGuestReplySession ? void 0 : await buildReplyDiagnosticsPayload({",
    "guest-suppress-verbose trailing status payload",
  );
  return next;
}
// Все три гейта стоят внутри completeReplyAgentRun, а sessionKey там по-прежнему берётся из context (иначе флаг гостя всегда false).
const insideComplete = (src) => {
  const fn = src.indexOf("async function completeReplyAgentRun(input) {");
  if (fn < 0) return "completeReplyAgentRun not found";
  const end = src.indexOf("\n}\n", fn);
  const body = src.slice(fn, end);
  if (!/\n\tconst \{[^}\n]*\bsessionKey\b[^}\n]*\} = context;\n/.test(body)) return "completeReplyAgentRun больше не берёт sessionKey из context";
  for (const needle of ["const isGuestReplySession = ", "if (verboseEnabled && !isGuestReplySession && activeIsNewSession)", COMPACTION_NEW, "const trailingPluginStatusPayload = isGuestReplySession ? void 0 : "]) if (!body.includes(needle)) return `гейт вне completeReplyAgentRun: ${needle.slice(0, 60)}`;
  if (body.includes("\t\tif (verboseEnabled) {\n")) return "в completeReplyAgentRun появился новый негардированный verbose-блок";
  return null;
};
export const check = { gate: "required", assertions: [
  contains("hotfix: guest-suppress-verbose-payloads", "marker"),
  contains('const isGuestReplySession = typeof sessionKey === "string" && sessionKey.includes(":guest:");', "guest session flag"),
  contains("if (verboseEnabled && !isGuestReplySession && activeIsNewSession)", "new-session banner gated"),
  contains(COMPACTION_NEW, "auto-compaction notice gated"),
  notContains(COMPACTION_OLD, "негардированный notice авто-компакции"),
  contains("const trailingPluginStatusPayload = isGuestReplySession ? void 0 : await buildReplyDiagnosticsPayload({", "trailing status payload gated"),
  insideComplete,
] };
