// Portable OpenClaw 2026.10.9: guest-no-chat-fallback.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label = "guest-no-chat-fallback";
export const verdict = "port";
export const target = { key: "delivery", label: "Telegram delivery.replies bundle", needles: ["function createReplyDeliverer(config, sender, progress) {", "async function deliverReplies(params) {", "async function deliverReplyPlan(params, createPlan) {"] };
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
// Сторож на место: guard обязан стоять внутри deliverReplyPlan (общий путь deliverReplies + deliverStructuredReplies),
// а обе обёртки — делегировать в deliverReplyPlan (иначе один из входов обходит guard).
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
export const check = { gate: "required", assertions: [ contains("hotfix: guest-no-chat-fallback", "guard marker"), contains("[hotfix][guest-no-chat-fallback]", "diagnostic log tag"), contains('if (!params.guestQueryId && typeof params.sessionKeyForInternalHooks === "string" && params.sessionKeyForInternalHooks.includes(":guest:")) {', "guard condition"), guardInReplyPlan, wrappersDelegate, noNewDeliveryExports ] };
