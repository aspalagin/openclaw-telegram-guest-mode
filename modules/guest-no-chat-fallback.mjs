// Метка guest-no-chat-fallback: port в delivery.replies — guest-сессия (sessionKey с ":guest:") без guestQueryId не должна
// проваливаться в обычную отправку в чат (утечка ответа гостю/в чужой чат); payload дропается с диагностикой.
// 2026-09-24 (переякорь под 2026.9.6): апстрим (8416d710158, #146361) разрезал deliverReplies на тонкие обёртки
// deliverReplies / deliverStructuredReplies → общий deliverReplyPlan(params, createPlan). Основной финальный путь
// bot-message (sendPayload) в 9.6 идёт через deliverStructuredReplies, deliverReplies — только deliverFallback и native-команды,
// поэтому сторож ставится в начало deliverReplyPlan (покрывает оба входа; createPlan вызывается позже — ранний выход без работы).
// params.sessionKeyForInternalHooks и params.guestQueryId по-прежнему приходят из createDeliveryBaseOptions (bot-message).
// Формат возврата {delivered:false} совместим с 9.6 ({delivered, receipt?}; вызывающие проверяют result.delivered).
// 2026-09-30 (ревью под 2026.9.7, чанк delivery-BE0K214i.mjs): лёг без изменений. Обёртки по-прежнему делегируют в deliverReplyPlan;
// новый путь апстрима settleFailedFinalDelivery (#155906, 61214694cc1) шлёт предупреждение через deliverFallback → deliverReplies →
// deliverReplyPlan, т.е. под этот же guard. В 9.7 {delivered:false} bot-message трактует как suppression "no_visible_result" →
// finalFailed → попытки warning/"Something went wrong" — все снова идут через deliverReplyPlan и так же дропаются (sendMessage нет).
// Добавлен сторож: новый экспорт чанка вида deliver*/send* (кроме двух обёрток) = новый вход доставки в обход guard'а.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label = "guest-no-chat-fallback";
export const verdict = "port";
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
