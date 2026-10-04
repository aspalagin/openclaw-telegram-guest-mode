// Module guest-announce-final-text-settle-wake (subagent-announce.requester-settle-wake chunk). Pair of
// guest-announce-final-text-instruction for the settle-wake path (sourceTool subagent_settle, runId
// `announce:requester-settle:…`): the wake text of buildRequesterSettleWakeMessage gets the line
// "[Subagent Context] <HOTFIX_GUEST_ANNOUNCE_INSTRUCTION>" before the findings when params.guestRequester; at the call
// site guestRequester = requesterSessionKey contains ":guest:".
// For parentOnly (private completion: the guest run called sessions_spawn with completionTarget "parent") the upstream
// SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION ("Process this result privately … Your final reply stays internal … send it
// through a messaging tool … Reply ONLY: NO_REPLY") is replaced by HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION for a guest
// (the result is the final text, it goes into the inline message; message is denied for guests in completion turns;
// the final of the private turn is appended by guest-announce-final-inline). Non-guest requesters get the upstream text
// byte for byte.
import { replaceOnce, insertBefore, contains, notContains, count } from "../lib/patch-helpers.mjs";
import { HOTFIX_GUEST_ANNOUNCE_CONST_LINE, HOTFIX_GUEST_ANNOUNCE_INSTRUCTION, HOTFIX_GUEST_PRIVATE_COMPLETION_CONST_LINE, HOTFIX_GUEST_PRIVATE_COMPLETION_PREFIX } from "./guest-announce-instruction.shared.mjs";
const MARK = "hotfix: guest-announce-final-text";
export const label = "guest-announce-final-text-settle-wake";
export const target = { key: "subagentRequesterSettleWake", label: "subagent requester settle-wake (buildRequesterSettleWakeMessage)", needles: ["function buildRequesterSettleWakeMessage(params) {", "sourceTool: \"subagent_settle\","] };
const FN_ANCHOR = "function buildRequesterSettleWakeMessage(params) {\n";
const CONST_BLOCK_V1 = `//#region ${MARK} (2026-10-04): settle-wake в guest-сессии — итог финальным текстом, не messaging tool\n${HOTFIX_GUEST_ANNOUNCE_CONST_LINE}//#endregion\n`;
const CONST_BLOCK_V2 = `//#region ${MARK} (2026-10-04; v2 private completion): settle-wake в guest-сессии — итог финальным текстом, не messaging tool\n${HOTFIX_GUEST_ANNOUNCE_CONST_LINE}${HOTFIX_GUEST_PRIVATE_COMPLETION_CONST_LINE}//#endregion\n`;
const CONST_BLOCK = `//#region ${MARK} v3: settle-wake in a guest session — the result is the final text, not a messaging tool; private completion included\n${HOTFIX_GUEST_ANNOUNCE_CONST_LINE}${HOTFIX_GUEST_PRIVATE_COMPLETION_CONST_LINE}//#endregion\n`;
const LINE_OLD = "\t\t...modelRouteChange ? [modelRouteChange, params.preserveModelRouteNotice ? \"[Subagent Context] Preserve this runtime-authored model-route change notice in your final answer.\" : \"[Subagent Context] Keep this runtime-authored model-route change notice internal on this shared surface.\"] : [],\n\t\t\"\",\n";
const GUEST_LINE = `\t\t...params.guestRequester ? [\`[Subagent Context] \${HOTFIX_GUEST_ANNOUNCE_INSTRUCTION}\`] : [], // ${MARK} (settle wake)\n`;
const LINE_NEW = LINE_OLD.replace("\t\t\"\",\n", `${GUEST_LINE}\t\t"",\n`);
const PRIVATE_OLD = "\t\tparams.parentOnly ? `[Subagent Context] ${SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION}` : params.requireVisibleReply ?";
const PRIVATE_V2 = "\t\tparams.parentOnly ? params.guestRequester ? `[Subagent Context] ${HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION}` /* " + MARK + " v2 (private completion у гостя) */ : `[Subagent Context] ${SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION}` : params.requireVisibleReply ?";
const PRIVATE_NEW = "\t\tparams.parentOnly ? params.guestRequester ? `[Subagent Context] ${HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION}` /* " + MARK + " (guest private completion) */ : `[Subagent Context] ${SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION}` : params.requireVisibleReply ?";
const CALL_OLD = "\tconst wakeMessage = buildRequesterSettleWakeMessage({\n\t\tfindings: preparedFindings.text,\n";
const CALL_NEW = `\tconst wakeMessage = buildRequesterSettleWakeMessage({\n\t\tguestRequester: typeof requesterSessionKey === "string" && requesterSessionKey.includes(":guest:"), // ${MARK}\n\t\tfindings: preparedFindings.text,\n`;
export function patch(source) {
  let next = source;
  const oldConst = [CONST_BLOCK_V2, CONST_BLOCK_V1].find((candidate) => next.includes(candidate));
  if (oldConst) next = replaceOnce(next, oldConst, CONST_BLOCK, "guest announce instruction const block upgrade (earlier revision → v3)");
  if (!next.includes(CONST_BLOCK)) next = insertBefore(next, FN_ANCHOR, CONST_BLOCK, "guest announce instruction const before buildRequesterSettleWakeMessage");
  if (!next.includes(GUEST_LINE)) next = replaceOnce(next, LINE_OLD, LINE_NEW, "guest line in buildRequesterSettleWakeMessage (before findings)");
  if (next.includes(PRIVATE_V2)) next = replaceOnce(next, PRIVATE_V2, PRIVATE_NEW, "parentOnly line upgrade (kit v1.2.0 → v1.2.1)");
  if (!next.includes(PRIVATE_NEW)) next = replaceOnce(next, PRIVATE_OLD, PRIVATE_NEW, "parentOnly line in buildRequesterSettleWakeMessage (guest private completion)");
  if (!next.includes(CALL_NEW)) next = replaceOnce(next, CALL_OLD, CALL_NEW, "buildRequesterSettleWakeMessage call site (guestRequester)");
  return next;
}
export const check = { assertions: [
  contains(MARK, "guest-announce-final-text marker (settle wake)"),
  contains(CONST_BLOCK, "guest instruction constants (v3)"),
  notContains(CONST_BLOCK_V1, "const block v1 remnant"),
  notContains(CONST_BLOCK_V2, "const block v2 (kit v1.2.0) remnant"),
  contains(GUEST_LINE, "guest line in the wake text"),
  contains(PRIVATE_NEW, "parentOnly line with the guest branch"),
  notContains(PRIVATE_OLD, "unpatched parentOnly line"),
  notContains(PRIVATE_V2, "parentOnly line of kit v1.2.0 remnant"),
  contains(CALL_NEW, "guestRequester at the call site (requesterSessionKey)"),
  contains(JSON.stringify(HOTFIX_GUEST_ANNOUNCE_INSTRUCTION), "guest instruction text (whole)"),
  contains(HOTFIX_GUEST_PRIVATE_COMPLETION_PREFIX, "guest private-completion instruction text"),
  notContains(LINE_OLD, "unpatched tail of the wake array"),
  (c) => count(c, "function buildRequesterSettleWakeMessage(params) {") === 1 && count(c, "buildRequesterSettleWakeMessage({") === 1 ? null : "function/call of buildRequesterSettleWakeMessage occurs more than once",
  (c) => count(c, "HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION") === 2 ? null : `HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION expected exactly 2 times (declaration + use), found ${count(c, "HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION")}`,
  // SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION is a chunk identifier (used by the private constant)
  (c) => count(c, "SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION") >= 2 ? null : "SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION not imported/used in the chunk",
  // the guest line must sit inside the array before findings and after the parentOnly line
  (c) => { const fn = c.indexOf("function buildRequesterSettleWakeMessage(params) {"); const g = c.indexOf(GUEST_LINE, fn); const f = c.indexOf("params.findings ?? \"(each child result was announced individually", fn); const p = c.indexOf(PRIVATE_NEW, fn); return fn >= 0 && p >= 0 && g > p && f > g ? null : "guest line is not between the parentOnly line and findings"; },
  // requesterSessionKey is the same identifier that goes into deliverSubagentAnnouncement
  contains("\t\t\t\trequesterSessionKey,\n\t\t\t\trequesterAgentId,\n\t\t\t\trequesterRunTimeoutSeconds:", "requesterSessionKey in the deliverSubagentAnnouncement call"),
] };
