// Метка guest-announce-final-inline (2026-10-04, слой 2026.9.7, guest-модуль INCLUDE_GUEST=1; чанк delivery.runtime-DrfEYUf8.mjs,
// ядро: src/agents/command/delivery.ts deliverAgentCommandResult).
// Корень 3/3 утечки финала (v1): финал completion-хода субагента (announce/settle, deliver:true) в guest-сессии отправляет ЯДРО —
// deliverAgentCommandResult → sendDurableMessageBatchCore в адресат записи сессии, минуя Telegram-путь deliverReplyPlan (bot-message),
// где стоят guest-no-chat-fallback и поздний append guest-ack-edit.
// Второй корень (v2): гостевой главный ран вызвал sessions_spawn с completionTarget "parent" → settle-wake идёт как private completion
// (subagent-announce-delivery: parentOnly → deliveryTarget {deliver:false}, privateCompletion:true; agent-turn-service требует
// request.deliver === false) → в deliverAgentCommandResult `deliver=false` → ранний `if (!deliver) { logPayload; return completeDelivery(); }`
// ДО guest-ветки v1 → итоговый текст (~3,5 тыс. символов) только в журнале/транскрипте, гостю ничего. Для обычных сессий «final reply stays
// internal» — замысел private completion (модель шлёт update через message); у гостя message запрещён (deny v3), inline-сообщение — единственный канал.
// Фикс v2: guest-ветка стоит ПЕРЕД `if (!deliver)` и срабатывает для sessionKey с ":guest:" при deliver=true (как v1) ИЛИ при
// runId с префиксом "announce:" (completion-ходы announce/settle, в т.ч. private). При deliver=false после append/дропа возвращается
// completeDelivery() без статуса — как штатный internal-путь (классификатор private completion статус доставки не читает); при deliver=true —
// статусы v1 ("sent"/resultCount 1 → automaticFinalDelivered; "suppressed"/guest_inline_unavailable → terminal без повторов).
// Обычные ходы гостя (bot-message, runId без "announce:", deliver=false) ветку не трогают — их финал идёт штатным reply-путём (deliverReplyPlan).
// Диагностика: `… appended … mode=deliver|private`, `… dropping … mode=…`, а при пустом visible payload announce-хода гостя (NO_REPLY/suppress) —
// `… has no visible payload — nothing to append` (отличать «модель промолчала» от «путь не достигнут»).
// Не-guest сессии (нет ":guest:" в effectiveSessionKey) — ветка не исполняется.
import { replaceOnce, insertAfter, contains, notContains } from "../lib/patch-helpers.mjs";
const MARK = "hotfix: guest-announce-final-inline";
export const label = "guest-announce-final-inline";
export const verdict = "new";
export const target = { key: "command-yield-ack-custody", label: "agent command delivery runtime (deliverAgentCommandResult)", needles: ["async function deliverAgentCommandResult(params) {", "const effectiveSessionKey = outboundSession?.key ?? opts.sessionKey;"] };
const ANCHOR_OLD = "\tif (!deliver) {\n\t\tfor (const payload of deliveryPayloads) logPayload(payload);\n\t\treturn completeDelivery();\n\t}\n";
// v1: ветка ПОСЛЕ `if (!deliver)` — не срабатывала при deliver=false (private completion). Хранится для апгрейда v1 → v2.
const GUEST_BLOCK_V1 = `\t//#region ${MARK} (2026-10-04): финал рана guest-сессии (announce/settle субагента) — в inline-сообщение гостя, не в чат адресата записи сессии
\tif (typeof effectiveSessionKey === "string" && effectiveSessionKey.includes(":guest:")) {
\t\tconst guestTexts = deliveryPayloads.map((payload) => typeof payload?.text === "string" ? payload.text : "").filter((text) => text.trim());
\t\tconst guestMediaCount = deliveryPayloads.filter((payload) => payload?.mediaUrl || Array.isArray(payload?.mediaUrls) && payload.mediaUrls.length > 0).length;
\t\tlet guestAppend;
\t\ttry {
\t\t\tguestAppend = await globalThis.__openclawHotfixGuestAck?.appendBySession?.(effectiveSessionKey, guestTexts, { runId: opts.runId });
\t\t} catch (err) {
\t\t\tguestAppend = { delivered: false, reason: \`append threw: \${String(err)}\` };
\t\t}
\t\tfor (const payload of deliveryPayloads) logPayload(payload);
\t\tif (guestAppend?.delivered === true) {
\t\t\truntime.log(\`[hotfix][guest-announce-final] guest-session final appended to inline message (session=\${effectiveSessionKey} run=\${opts.runId ?? "?"} texts=\${guestTexts.length} media_dropped=\${guestMediaCount} inline=\${guestAppend.inlineMessageId ?? "?"})\`);
\t\t\treturn completeDelivery({ requested: true, attempted: true, status: "sent", succeeded: true, resultCount: 1, reason: "guest_inline_append" }, true);
\t\t}
\t\tconst guestDropMessage = \`[hotfix][guest-announce-final] dropping guest-session final instead of sending to \${deliveryChannel ?? "?"}:\${deliveryTarget ?? "?"} (session=\${effectiveSessionKey} run=\${opts.runId ?? "?"} texts=\${guestTexts.length} media=\${guestMediaCount} reason=\${guestAppend?.reason ?? (globalThis.__openclawHotfixGuestAck ? "no inline message" : "guest-ack registry not loaded")})\`;
\t\truntime.error?.(guestDropMessage);
\t\tif (!runtime.error) runtime.log(guestDropMessage);
\t\treturn completeDelivery({ requested: true, attempted: false, status: "suppressed", succeeded: true, reason: "guest_inline_unavailable", resultCount: 0 }, true);
\t}
\t//#endregion
`;
const GUEST_BLOCK = `\t//#region ${MARK} v2 (2026-10-04): финал рана guest-сессии (announce/settle субагента, в т.ч. private completion с deliver=false) — в inline-сообщение гостя, не в чат адресата записи сессии и не «internal»
\tconst guestInlineSession = typeof effectiveSessionKey === "string" && effectiveSessionKey.includes(":guest:");
\tconst guestAnnounceRun = typeof opts.runId === "string" && opts.runId.startsWith("announce:");
\tif (guestInlineSession && (deliver || guestAnnounceRun)) {
\t\tconst guestMode = deliver ? "deliver" : "private";
\t\tconst guestTexts = deliveryPayloads.map((payload) => typeof payload?.text === "string" ? payload.text : "").filter((text) => text.trim());
\t\tconst guestMediaCount = deliveryPayloads.filter((payload) => payload?.mediaUrl || Array.isArray(payload?.mediaUrls) && payload.mediaUrls.length > 0).length;
\t\tlet guestAppend;
\t\ttry {
\t\t\tguestAppend = await globalThis.__openclawHotfixGuestAck?.appendBySession?.(effectiveSessionKey, guestTexts, { runId: opts.runId });
\t\t} catch (err) {
\t\t\tguestAppend = { delivered: false, reason: \`append threw: \${String(err)}\` };
\t\t}
\t\tfor (const payload of deliveryPayloads) logPayload(payload);
\t\tif (guestAppend?.delivered === true) {
\t\t\truntime.log(\`[hotfix][guest-announce-final] guest-session final appended to inline message (session=\${effectiveSessionKey} run=\${opts.runId ?? "?"} mode=\${guestMode} texts=\${guestTexts.length} media_dropped=\${guestMediaCount} inline=\${guestAppend.inlineMessageId ?? "?"})\`);
\t\t\treturn deliver ? completeDelivery({ requested: true, attempted: true, status: "sent", succeeded: true, resultCount: 1, reason: "guest_inline_append" }, true) : completeDelivery();
\t\t}
\t\tconst guestDropMessage = \`[hotfix][guest-announce-final] dropping guest-session final instead of \${deliver ? \`sending to \${deliveryChannel ?? "?"}:\${deliveryTarget ?? "?"}\` : "keeping it internal (deliver=false)"} (session=\${effectiveSessionKey} run=\${opts.runId ?? "?"} mode=\${guestMode} texts=\${guestTexts.length} media=\${guestMediaCount} reason=\${guestAppend?.reason ?? (globalThis.__openclawHotfixGuestAck ? "no inline message" : "guest-ack registry not loaded")})\`;
\t\truntime.error?.(guestDropMessage);
\t\tif (!runtime.error) runtime.log(guestDropMessage);
\t\treturn deliver ? completeDelivery({ requested: true, attempted: false, status: "suppressed", succeeded: true, reason: "guest_inline_unavailable", resultCount: 0 }, true) : completeDelivery();
\t}
\t//#endregion
`;
const EMPTY_ANCHOR = "\tif (deliveryPayloads.length === 0) {\n";
const EMPTY_DIAG = `\t\tif (typeof effectiveSessionKey === "string" && effectiveSessionKey.includes(":guest:") && typeof opts.runId === "string" && opts.runId.startsWith("announce:")) runtime.log(\`[hotfix][guest-announce-final] guest-session announce final has no visible payload — nothing to append (session=\${effectiveSessionKey} run=\${opts.runId} deliver=\${deliver} suppressed=\${replyNormalization.kind === "suppress" ? replyNormalization.reason ?? "?" : "no"})\`); // ${MARK} v2 (diag)\n`;
export function patch(source) {
  let next = source;
  if (!next.includes(GUEST_BLOCK)) {
    if (next.includes(`${ANCHOR_OLD}${GUEST_BLOCK_V1}`)) next = replaceOnce(next, `${ANCHOR_OLD}${GUEST_BLOCK_V1}`, `${GUEST_BLOCK}${ANCHOR_OLD}`, "guest guard v1 → v2 (before `if (!deliver)`) in deliverAgentCommandResult");
    else next = replaceOnce(next, ANCHOR_OLD, `${GUEST_BLOCK}${ANCHOR_OLD}`, "guest guard before `if (!deliver)` in deliverAgentCommandResult");
  }
  if (!next.includes(EMPTY_DIAG)) next = insertAfter(next, EMPTY_ANCHOR, EMPTY_DIAG, "guest announce no-payload diagnostic in deliverAgentCommandResult");
  return next;
}
const count = (s, n) => s.split(n).length - 1;
export const check = { gate: "required", assertions: [
  contains(`${MARK} v2`, "маркер guest-announce-final-inline v2"),
  contains(GUEST_BLOCK, "guest-ветка v2 deliverAgentCommandResult целиком"),
  contains(EMPTY_DIAG, "диагностика пустого payload announce-хода гостя"),
  contains("[hotfix][guest-announce-final] dropping guest-session final", "диагностика дропа"),
  notContains(GUEST_BLOCK_V1, "остаток guest-ветки v1 (после `if (!deliver)`)"),
  contains(ANCHOR_OLD, "штатный `if (!deliver)` сохранён"),
  // идентификаторы, которыми пользуется ветка, должны существовать в функции
  contains("const effectiveSessionKey = outboundSession?.key ?? opts.sessionKey;", "effectiveSessionKey"),
  contains("const deliver = opts.deliver === true;", "deliver"),
  contains("const replyNormalization = normalizeReplyPayloads(payloads);", "replyNormalization"),
  contains("const deliveryPayloads = projectOutboundPayloadPlanForOutbound(outboundPayloadPlan);", "deliveryPayloads"),
  contains("const completeDelivery = (status, deliverySucceeded) => {", "completeDelivery(status, deliverySucceeded)"),
  contains("const { deliveryChannel, isDeliveryChannelKnown, defaultAccountId, resolvedAccountId, resolvedTarget, deliveryTarget, resolvedReplyToId, resolvedThreadTarget, deliveryPlugin } = deliveryRouting;", "deliveryChannel/deliveryTarget из deliveryRouting"),
  // порядок: объявление logPayload → guest-ветка v2 → `if (!deliver)` → первая платформенная отправка
  (c) => { const fn = c.indexOf("async function deliverAgentCommandResult(params) {"); const lp = c.indexOf("const logPayload = (payload) => {", fn); const g = c.indexOf(`${MARK} v2 (2026-10-04)`, fn); const nd = c.indexOf(ANCHOR_OLD, fn); const send = c.indexOf("send = await sendDurableMessageBatchCore({", fn); return fn >= 0 && lp >= 0 && g > lp && nd > g && send > nd ? null : "guest-ветка v2 не между объявлением logPayload и `if (!deliver)` (или sendDurableMessageBatchCore раньше)"; },
  (c) => { const fn = c.indexOf("async function deliverAgentCommandResult(params) {"); const empty = c.indexOf(EMPTY_ANCHOR, fn); const diag = c.indexOf(EMPTY_DIAG, fn); return fn >= 0 && empty >= 0 && diag === empty + EMPTY_ANCHOR.length ? null : "диагностика пустого payload не первой строкой блока `if (deliveryPayloads.length === 0)`"; },
  (c) => count(c, "async function deliverAgentCommandResult(params) {") === 1 && count(c, "send = await sendDurableMessageBatchCore({") === 1 ? null : "deliverAgentCommandResult/sendDurableMessageBatchCore встречаются не по одному разу (новый путь отправки в обход guest-ветки?)",
  (c) => count(c, "appendBySession") === 1 ? null : "appendBySession вызывается не один раз",
  (c) => count(c, `//#region ${MARK}`) === 1 ? null : "регион guest-announce-final-inline встречается не один раз (остаток v1?)",
] };
