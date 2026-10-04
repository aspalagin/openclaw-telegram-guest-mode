// Module guest-announce-final-text-instruction (subagent-announce chunk, runSubagentAnnounceFlow).
// A completion turn of a sub-agent in a guest session receives the upstream buildAnnounceReplyInstruction ("…send a
// truthful user-facing update…") and does not know that the requester is a Telegram guest whose result is delivered
// only by editing the inline message (guest-ack-edit); the guest hint of bot-message never reaches the announce turn (it
// is built from the inbound guest message in ctxPayload). Fix: a wrapper over buildAnnounceReplyInstruction — with
// params.guestRequester the upstream instruction (any branch: subagent/expectsCompletionMessage/regular) gets
// HOTFIX_GUEST_ANNOUNCE_INSTRUCTION appended: "answer with the final text, it is delivered into the guest message; do not
// use message/messaging tools". At the call site guestRequester = targetRequesterSessionKey contains ":guest:" (session
// key of the announce recipient). Direct announce (subagent_announce); settle-wake is a separate module
// (guest-announce-final-text-settle-wake). The tool ban itself is guest-deny-delivery-tools.
// With completionTarget "parent" (private completion) a guest gets HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION + the guest
// instruction instead of the upstream SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION ("stays internal … messaging tool …
// NO_REPLY"); the final of the private turn is appended by guest-announce-final-inline.
import { replaceOnce, contains, notContains, count } from "../lib/patch-helpers.mjs";
import { HOTFIX_GUEST_ANNOUNCE_CONST_LINE, HOTFIX_GUEST_ANNOUNCE_INSTRUCTION, HOTFIX_GUEST_PRIVATE_COMPLETION_CONST_LINE, HOTFIX_GUEST_PRIVATE_COMPLETION_PREFIX } from "./guest-announce-instruction.shared.mjs";
const MARK = "hotfix: guest-announce-final-text";
export const label = "guest-announce-final-text-instruction";
export const target = { key: "subagentAnnounce", label: "subagent announce coordinator (runSubagentAnnounceFlow)", needles: ["function buildAnnounceReplyInstruction(params) {", "async function runSubagentAnnounceFlowBound(params) {"] };
const FN_OLD = "function buildAnnounceReplyInstruction(params) {\n";
const FN_V1 = [
  `//#region ${MARK} (2026-10-04): requester — Telegram guest-сессия → итог финальным текстом (правка inline-сообщения), не messaging tool`,
  HOTFIX_GUEST_ANNOUNCE_CONST_LINE.replace(/\n$/, ""),
  "function buildAnnounceReplyInstruction(params) {",
  "\tconst base = buildAnnounceReplyInstructionUpstream(params);",
  "\treturn params.guestRequester ? `${base} ${HOTFIX_GUEST_ANNOUNCE_INSTRUCTION}` : base;",
  "}",
  "//#endregion",
  "function buildAnnounceReplyInstructionUpstream(params) {",
  "",
].join("\n");
// kit v1.2.0 revision (Russian comments) — recognized for the in-place upgrade
const FN_V2 = [
  `//#region ${MARK} (2026-10-04; v2 private completion): requester — Telegram guest-сессия → итог финальным текстом (правка inline-сообщения), не messaging tool`,
  HOTFIX_GUEST_ANNOUNCE_CONST_LINE.replace(/\n$/, ""),
  HOTFIX_GUEST_PRIVATE_COMPLETION_CONST_LINE.replace(/\n$/, ""),
  "function buildAnnounceReplyInstruction(params) {",
  "\tif (params.guestRequester && params.completionTarget === \"parent\") return `${HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION} ${HOTFIX_GUEST_ANNOUNCE_INSTRUCTION}`; // v2: у гостя private completion без «stays internal»/NO_REPLY",
  "\tconst base = buildAnnounceReplyInstructionUpstream(params);",
  "\treturn params.guestRequester ? `${base} ${HOTFIX_GUEST_ANNOUNCE_INSTRUCTION}` : base;",
  "}",
  "//#endregion",
  "function buildAnnounceReplyInstructionUpstream(params) {",
  "",
].join("\n");
const FN_NEW = [
  `//#region ${MARK} v3: requester is a Telegram guest session → the result is the final text (inline message edit), not a messaging tool; private completion included`,
  HOTFIX_GUEST_ANNOUNCE_CONST_LINE.replace(/\n$/, ""),
  HOTFIX_GUEST_PRIVATE_COMPLETION_CONST_LINE.replace(/\n$/, ""),
  "function buildAnnounceReplyInstruction(params) {",
  "\tif (params.guestRequester && params.completionTarget === \"parent\") return `${HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION} ${HOTFIX_GUEST_ANNOUNCE_INSTRUCTION}`; // guest private completion without \"stays internal\"/NO_REPLY",
  "\tconst base = buildAnnounceReplyInstructionUpstream(params);",
  "\treturn params.guestRequester ? `${base} ${HOTFIX_GUEST_ANNOUNCE_INSTRUCTION}` : base;",
  "}",
  "//#endregion",
  "function buildAnnounceReplyInstructionUpstream(params) {",
  "",
].join("\n");
const CALL_OLD = "\t\tconst replyInstruction = buildAnnounceReplyInstruction({\n\t\t\trequesterIsSubagent,\n";
const CALL_NEW = `\t\tconst replyInstruction = buildAnnounceReplyInstruction({\n\t\t\tguestRequester: typeof targetRequesterSessionKey === "string" && targetRequesterSessionKey.includes(":guest:"), // ${MARK}\n\t\t\trequesterIsSubagent,\n`;
export function patch(source) {
  let next = source;
  const old = [FN_V2, FN_V1].find((candidate) => next.includes(candidate));
  if (old) next = replaceOnce(next, old, FN_NEW, "buildAnnounceReplyInstruction wrapper upgrade (earlier revision → v3)");
  if (!next.includes(FN_NEW)) next = replaceOnce(next, FN_OLD, FN_NEW, "buildAnnounceReplyInstruction wrapper (guest requester)");
  if (!next.includes(CALL_NEW)) next = replaceOnce(next, CALL_OLD, CALL_NEW, "buildAnnounceReplyInstruction call site (guestRequester)");
  return next;
}
export const check = { assertions: [
  contains(MARK, "guest-announce-final-text marker"),
  contains(FN_NEW, "buildAnnounceReplyInstruction wrapper with the guest branch (v3)"),
  notContains(FN_V1, "wrapper v1 remnant"),
  notContains(FN_V2, "wrapper v2 (kit v1.2.0) remnant"),
  contains(CALL_NEW, "guestRequester at the call site (targetRequesterSessionKey)"),
  contains(JSON.stringify(HOTFIX_GUEST_ANNOUNCE_INSTRUCTION), "guest instruction text (whole)"),
  contains(HOTFIX_GUEST_PRIVATE_COMPLETION_PREFIX, "guest private-completion instruction text"),
  notContains("function buildAnnounceReplyInstruction(params) {\n\tconst modelRouteInstruction", "unpatched buildAnnounceReplyInstruction"),
  (c) => count(c, "function buildAnnounceReplyInstruction(params) {") === 1 && count(c, "function buildAnnounceReplyInstructionUpstream(params) {") === 1 ? null : "wrapper/upstream function declared more than once",
  (c) => count(c, "buildAnnounceReplyInstruction({") === 1 ? null : `expected exactly one call buildAnnounceReplyInstruction({, found ${count(c, "buildAnnounceReplyInstruction({")}`,
  // completionTarget "parent" in the upstream function and SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION (used by the private constant) are chunk identifiers
  contains("if (params.completionTarget === \"parent\") return SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION;", "upstream completionTarget parent branch"),
  (c) => count(c, "SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION") >= 2 ? null : "SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION not imported/used in the chunk",
  // targetRequesterSessionKey must be declared in the same function before the call
  (c) => { const decl = c.indexOf("let targetRequesterSessionKey = params.requesterSessionKey;"); const call = c.indexOf(CALL_NEW); return decl >= 0 && call > decl ? null : "targetRequesterSessionKey not declared before the buildAnnounceReplyInstruction call"; },
] };
