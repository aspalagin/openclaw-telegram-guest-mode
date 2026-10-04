// Module guest-announce-fallback-skip. CONDITIONAL.
// Context: some operators run a separate "subagent-completion-silent-fallback" hotfix that sends a safety
// "⚠️ …" message into the requester's source conversation when a sub-agent completion turn produced no
// visible reply. For a guest session the "source conversation" resolved from the session record is the
// bot owner's chat (that is how a guest's result can leak), while the guest's result must only ever be
// edited into the guest's inline message (guest-announce-final-inline). This module makes both fallback
// senders (step A and the give-up step C) skip requester session keys containing ":guest:" with their own
// log line.
// Vanilla OpenClaw has no such fallback sender, so on a vanilla install there is nothing to skip: the module
// reports "not applicable" and leaves the chunk untouched. It is applied only when the marker of that
// hotfix is present in the announce-delivery chunk.
import { replaceOnce, contains, notContains, count } from "../lib/patch-helpers.mjs";
const MARK = "hotfix: guest-announce-fallback-skip";
const BASE_MARK = "hotfix: subagent-completion-silent-fallback";
export const label = "guest-announce-fallback-skip";
export const target = {
  key: "subagentAnnounceDelivery",
  label: "subagent announce delivery bundle",
  needles: ["function resolvePrivateCompletionDeliveryResult(response, origin) {", "async function sendSubagentAnnounceDirectly(params) {"],
};
const IS_GUEST = "typeof requesterSessionKey === \"string\" && requesterSessionKey.includes(\":guest:\")";
const A_OLD = "\t\tif (!target.deliver || !target.channel || !target.to) {\n\t\t\t__ocSilentFallbackLog(\"skip: no external source route for \" + requesterSessionKey);\n";
const A_NEW = `\t\tif (!target.deliver || !target.channel || !target.to || ${IS_GUEST}) { // ${MARK}\n\t\t\t__ocSilentFallbackLog((${IS_GUEST} ? "skip: guest session, final goes to the guest inline message only (${MARK}): " : "skip: no external source route for ") + requesterSessionKey);\n`;
const C_OLD = "\t\tif (!target.deliver || !target.channel || !target.to || !requesterSessionKey) {\n\t\t\t__ocSilentFallbackLog(\"give-up skip: no external source route for \" + requesterSessionKey);\n";
const C_NEW = `\t\tif (!target.deliver || !target.channel || !target.to || !requesterSessionKey || ${IS_GUEST}) { // ${MARK}\n\t\t\t__ocSilentFallbackLog((${IS_GUEST} ? "give-up skip: guest session, final goes to the guest inline message only (${MARK}): " : "give-up skip: no external source route for ") + requesterSessionKey);\n`;
export function applicable(source) {
  return source.includes(BASE_MARK) ? null : "not applicable: no silent-completion fallback sender in this build (vanilla OpenClaw) — nothing to skip";
}
export function patch(source) {
  if (!source.includes(BASE_MARK)) return source;
  let next = source;
  if (!next.includes(A_NEW)) next = replaceOnce(next, A_OLD, A_NEW, "silent-fallback step A route guard (guest skip)");
  if (!next.includes(C_NEW)) next = replaceOnce(next, C_OLD, C_NEW, "silent-fallback give-up (step C) route guard (guest skip)");
  return next;
}
const whenBase = (assertion) => (src, file) => src.includes(BASE_MARK) ? assertion(src, file) : null;
export const check = { assertions: [
  whenBase(contains(A_NEW, "guest skip in step A")),
  whenBase(contains(C_NEW, "guest skip in the give-up step C")),
  whenBase(notContains(A_OLD, "unpatched route guard of step A")),
  whenBase(notContains(C_OLD, "unpatched route guard of the give-up step")),
  whenBase((c) => count(c, MARK) === 4 ? null : `marker expected exactly 4 times (comment + log in A and C), found ${count(c, MARK)}`),
  whenBase((c) => count(c, "skip: no external source route for") === 2 && count(c, "give-up skip: no external source route for") === 1 ? null : "unexpected number of silent-fallback route guards (a new fallback sender without the guest skip?)"),
  // vanilla sanity: the announce delivery chunk must still exist in the expected shape
  contains("async function sendSubagentAnnounceDirectly(params) {", "sendSubagentAnnounceDirectly present"),
] };
