// Module guest-no-chat-fallback: port into delivery.replies. A guest session (sessionKey with ":guest:")
// without a guestQueryId must never fall through to a regular chat send (the reply would land in the chat
// the query was typed in, or in the operator's chat); the payload is dropped with a diagnostic.
// OpenClaw 2026.9.6 split deliverReplies into thin wrappers deliverReplies / deliverStructuredReplies over a
// shared deliverReplyPlan(params, createPlan). The main final path of bot-message (sendPayload) goes through
// deliverStructuredReplies, deliverReplies serves deliverFallback and native commands, so the guard sits at
// the head of deliverReplyPlan (covers both entries; createPlan is called later, so the early return does no
// work). params.sessionKeyForInternalHooks and params.guestQueryId still come from createDeliveryBaseOptions.
// 2026.9.7: unchanged. settleFailedFinalDelivery sends its warning through deliverFallback → deliverReplies →
// deliverReplyPlan, i.e. under the same guard; a {delivered:false} result is treated by bot-message as the
// "no_visible_result" suppression, whose follow-up warnings go through deliverReplyPlan again and are dropped
// the same way (there is no sendMessage path). Drift guard: a new chunk export named deliver*/send* (other
// than the two wrappers) would be a new delivery entry that bypasses the guard.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label = "guest-no-chat-fallback";
export const target = { key: "delivery", label: "Telegram delivery.replies bundle", needles: ["async function deliverTextReply(params) {", "async function deliverReplies(params) {", "async function deliverReplyPlan(params, createPlan) {", "function filterEmptyTelegramTextChunks(chunks) {"] };
export function patch(source) {
  if (source.includes("hotfix: guest-no-chat-fallback")) return source;
  return replaceOnce(
    source,
    "async function deliverReplyPlan(params, createPlan) {\n\tconst progress = {",
    [
      "async function deliverReplyPlan(params, createPlan) {",
      "\t//#region hotfix: guest-no-chat-fallback (2026-07-29; 2026-09-24 → deliverReplyPlan)",
      "\tif (!params.guestQueryId && typeof params.sessionKeyForInternalHooks === \"string\" && params.sessionKeyForInternalHooks.includes(\":guest:\")) {",
      "\t\tparams.runtime.log?.(`[hotfix][guest-no-chat-fallback] dropping guest-session payload without guest query id (chat=${params.chatId})`);",
      "\t\treturn { delivered: false };",
      "\t}",
      "\t//#endregion",
      "\tconst progress = {",
    ].join("\n"),
    "guest-no-chat-fallback delivery guard",
  );
}
// Placement guards: the guard must sit inside deliverReplyPlan (shared path of deliverReplies and
// deliverStructuredReplies) and both wrappers must delegate to deliverReplyPlan (otherwise one entry bypasses it).
const guardInReplyPlan = (src) => {
  const start = src.indexOf("async function deliverReplyPlan(params, createPlan) {");
  if (start < 0) return "deliverReplyPlan not found";
  const guard = src.indexOf("hotfix: guest-no-chat-fallback", start);
  const progress = src.indexOf("\tconst progress = {", start);
  if (guard < 0 || progress < 0 || guard > progress) return "guard is not at the head of deliverReplyPlan";
  return null;
};
const wrappersDelegate = (src) => {
  const m1 = /async function deliverReplies\(params\) \{\n\treturn deliverReplyPlan\(params,/.test(src);
  const m2 = /async function deliverStructuredReplies\(params\) \{\n\treturn deliverReplyPlan\(params,/.test(src);
  return m1 && m2 ? null : "deliverReplies/deliverStructuredReplies no longer delegate to deliverReplyPlan";
};
const noNewDeliveryExports = (src) => {
  const m = src.match(/\nexport \{([^}]*)\};\s*$/);
  if (!m) return "delivery chunk export list not found";
  const names = m[1].split(",").map((part) => part.trim().split(/\s+as\s+/)[0]).filter(Boolean);
  const extra = names.filter((name) => /^(deliver|send)/i.test(name) && name !== "deliverReplies" && name !== "deliverStructuredReplies");
  return extra.length ? `new delivery export(s) may bypass guest guard: ${extra.join(", ")}` : null;
};
export const check = { assertions: [ contains("hotfix: guest-no-chat-fallback", "guard marker"), contains("[hotfix][guest-no-chat-fallback]", "diagnostic log tag"), contains('if (!params.guestQueryId && typeof params.sessionKeyForInternalHooks === "string" && params.sessionKeyForInternalHooks.includes(":guest:")) {', "guard condition"), guardInReplyPlan, wrappersDelegate, noNewDeliveryExports ] };
