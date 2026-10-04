// Метка guest-suppress-verbose-payloads: port в agent-runner.runtime (completeReplyAgentRun, agent-runner-result-complete.ts); якоря те же, отступ на 1 таб меньше.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label = "guest-suppress-verbose-payloads";
export const verdict = "port";
export const target = { key: "agentRunner", label: "agent runner runtime bundle", needles: ["async function completeReplyAgentRun(input) {", "const prefixNotices = [];"] };
export function patch(source) {
  if (source.includes("hotfix: guest-suppress-verbose-payloads")) return source;
  let next = replaceOnce(
    source,
    "\tconst prefixNotices = [];\n\tif (verboseEnabled && activeIsNewSession) prefixNotices.push({ text: `🧭 New session: ${followupRun.run.sessionId}` });",
    "\t//#region hotfix: guest-suppress-verbose-payloads (2026-07-27)\n\tconst isGuestReplySession = typeof sessionKey === \"string\" && sessionKey.includes(\":guest:\");\n\t//#endregion\n\tconst prefixNotices = [];\n\tif (verboseEnabled && !isGuestReplySession && activeIsNewSession) prefixNotices.push({ text: `🧭 New session: ${followupRun.run.sessionId}` });",
    "guest-suppress-verbose new-session banner",
  );
  next = replaceOnce(
    next,
    "\t\tif (verboseEnabled) {\n\t\t\tconst suffix = typeof count === \"number\" ? ` (count ${count})` : \"\";\n\t\t\tprefixNotices.push({ text: `🧹 Auto-compaction complete${suffix}.` });",
    "\t\tif (verboseEnabled && !isGuestReplySession) {\n\t\t\tconst suffix = typeof count === \"number\" ? ` (count ${count})` : \"\";\n\t\t\tprefixNotices.push({ text: `🧹 Auto-compaction complete${suffix}.` });",
    "guest-suppress-verbose auto-compaction notice",
  );
  next = replaceOnce(
    next,
    "const trailingPluginStatusPayload = await buildReplyDiagnosticsPayload({",
    "const trailingPluginStatusPayload = isGuestReplySession ? void 0 : await buildReplyDiagnosticsPayload({",
    "guest-suppress-verbose trailing status payload",
  );
  return next;
}
export const check = { gate: "required", assertions: [
  contains("hotfix: guest-suppress-verbose-payloads", "marker"),
  contains('const isGuestReplySession = typeof sessionKey === "string" && sessionKey.includes(":guest:");', "guest session flag"),
  contains("if (verboseEnabled && !isGuestReplySession && activeIsNewSession)", "new-session banner gated"),
  contains("const trailingPluginStatusPayload = isGuestReplySession ? void 0 : await buildReplyDiagnosticsPayload({", "trailing status payload gated"),
] };
