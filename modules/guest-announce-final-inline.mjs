// Portable OpenClaw 2026.10.9: guest-announce-final-inline.
import fs from "node:fs";
import path from "node:path";
import { replaceOnce, insertAfter, contains, notContains } from "../lib/patch-helpers.mjs";
const MARK = "hotfix: guest-announce-final-inline";
// v3: приватный completion-ход sessions_send follow-up (10.5) — не guest-announce (в 9.7 его runId был randomUUID).
const SESSIONS_SEND_COMPLETION_PREFIX = "announce:sessions-send:";
const RUN_IS_ANNOUNCE_V2 = `typeof opts.runId === "string" && opts.runId.startsWith("announce:")`;
const RUN_IS_GUEST_ANNOUNCE = `${RUN_IS_ANNOUNCE_V2} && !opts.runId.startsWith("${SESSIONS_SEND_COMPLETION_PREFIX}")`;
export const label = "guest-announce-final-inline";
export const verdict = "new";
export const target = { key: "command-yield-ack-custody", label: "agent command delivery runtime (deliverAgentCommandResult)", needles: ["async function deliverAgentCommandResult(params) {", "const effectiveSessionKey = outboundSession?.key ?? opts.sessionKey;"] };
// 9.7: `if (!deliver) {\n\t\tfor (…) logPayload(payload);\n\t\treturn completeDelivery();\n\t}`; 10.5: тот же префикс, return с message_tool_only.
const ANCHOR_OLD = "\tif (!deliver) {\n\t\tfor (const payload of deliveryPayloads) logPayload(payload);\n";
// v1 (04.10 06:16Z): ветка ПОСЛЕ `if (!deliver)` — не срабатывала при deliver=false (private completion). Хранится для апгрейда v1 → v2.
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
// Строка guest-признака announce-хода: v2 — любой `announce:`; v3 — без `announce:sessions-send:` (приватный ход sessions_send follow-up 10.5).
const ANNOUNCE_RUN_LINE_V2 = `\tconst guestAnnounceRun = ${RUN_IS_ANNOUNCE_V2};\n`;
const ANNOUNCE_RUN_LINE = `\tconst guestAnnounceRun = ${RUN_IS_GUEST_ANNOUNCE}; // ${MARK} v3 (2026-10-21): 10.5 sessions_send follow-up completion (${SESSIONS_SEND_COMPLETION_PREFIX}…:completion) is a private turn, not a guest announce — its final stays internal (9.7 parity: randomUUID runId)\n`;
const guestBlock = (announceRunLine) => `\t//#region ${MARK} v2 (2026-10-04): финал рана guest-сессии (announce/settle субагента, в т.ч. private completion с deliver=false) — в inline-сообщение гостя, не в чат адресата записи сессии и не «internal»
\tconst guestInlineSession = typeof effectiveSessionKey === "string" && effectiveSessionKey.includes(":guest:");
${announceRunLine}\tif (guestInlineSession && (deliveryRequested || guestAnnounceRun)) { // 10.5: deliveryRequested = opts.deliver === true (= deliver 9.7)
\t\tconst guestMode = deliveryRequested ? "deliver" : "private";
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
\t\t\treturn deliveryRequested ? completeDelivery({ requested: true, attempted: true, status: "sent", succeeded: true, resultCount: 1, reason: "guest_inline_append" }, true) : completeDelivery();
\t\t}
\t\tconst guestDropMessage = \`[hotfix][guest-announce-final] dropping guest-session final instead of \${deliveryRequested ? \`sending to \${deliveryChannel ?? "?"}:\${deliveryTarget ?? "?"}\` : "keeping it internal (deliver=false)"} (session=\${effectiveSessionKey} run=\${opts.runId ?? "?"} mode=\${guestMode} texts=\${guestTexts.length} media=\${guestMediaCount} reason=\${guestAppend?.reason ?? (globalThis.__openclawHotfixGuestAck ? "no inline message" : "guest-ack registry not loaded")})\`;
\t\truntime.error?.(guestDropMessage);
\t\tif (!runtime.error) runtime.log(guestDropMessage);
\t\treturn deliveryRequested ? completeDelivery({ requested: true, attempted: false, status: "suppressed", succeeded: true, reason: "guest_inline_unavailable", resultCount: 0 }, true) : completeDelivery();
\t}
\t//#endregion
`;
const GUEST_BLOCK_V2 = guestBlock(ANNOUNCE_RUN_LINE_V2); // v2 (2026-10-04…20): хранится для апгрейда v2 → v3 и notContains
const GUEST_BLOCK_PREVIOUS = guestBlock(ANNOUNCE_RUN_LINE);
const GUEST_BLOCK = "\t//#region hotfix: guest-announce-final-inline v2 (2026-10-04): exact owner + native per-item evidence\n\tconst guestInlineSession = typeof effectiveSessionKey === \"string\" && effectiveSessionKey.includes(\":guest:\");\n\tconst guestAnnounceRun = typeof opts.runId === \"string\" && opts.runId.startsWith(\"announce:\") && !opts.runId.startsWith(\"announce:sessions-send:\"); // hotfix: guest-announce-final-inline v3\n\tif (guestInlineSession && (deliveryRequested || guestAnnounceRun)) {\n\t\tlet guestAppend;\n\t\ttry { guestAppend = await globalThis.__openclawHotfixGuestAck?.deliverPayloads?.(effectiveSessionKey, deliveryPayloads, { runId: opts.runId, assertCurrent: params.assertDeliveryCurrent }); }\n\t\tcatch (error) { guestAppend = { delivered: false, reason: String(error), attempted: false }; }\n\t\tfor (const payload of deliveryPayloads) logPayload(payload);\n\t\tconst status = globalThis.__openclawHotfixGuestAck?.deliveryStatus?.(guestAppend, normalizedPayloads) ?? { requested: true, attempted: false, status: \"failed\", succeeded: false, resultCount: 0, error: true, reason: \"guest_inline_failed\" };\n\t\tif (!guestAppend?.delivered) runtime.error?.(\"[hotfix][guest-announce-final] dropping guest-session final: \" + (guestAppend?.reason ?? \"registry unavailable\"));\n\t\treturn completeDelivery(status, guestAppend?.delivered === true, guestAppend?.evidencePayloads);\n\t}\n\t//#endregion\n";
const EMPTY_ANCHOR = "\tif (deliveryPayloads.length === 0) {\n";
const emptyDiag = (runCond, tag) => `\t\tif (typeof effectiveSessionKey === "string" && effectiveSessionKey.includes(":guest:") && ${runCond}) runtime.log(\`[hotfix][guest-announce-final] guest-session announce final has no visible payload — nothing to append (session=\${effectiveSessionKey} run=\${opts.runId} deliver=\${deliveryRequested}\${deliver !== deliveryRequested ? "(message_tool_only)" : ""} suppressed=\${replyNormalization.kind === "suppress" ? replyNormalization.reason ?? "?" : "no"})\`); // ${MARK} ${tag}\n`;
const EMPTY_DIAG_V2 = emptyDiag(RUN_IS_ANNOUNCE_V2, "v2 (diag)");
const EMPTY_DIAG = emptyDiag(RUN_IS_GUEST_ANNOUNCE, `v3 (diag; ${SESSIONS_SEND_COMPLETION_PREFIX} excluded)`);
export function patch(source) {
  let next = source;
  if (!next.includes("receiptPayloads = normalizedPayloads")) {
    next = replaceOnce(next, "const completeDelivery = (status, deliverySucceeded) => {", "const completeDelivery = (status, deliverySucceeded, receiptPayloads = normalizedPayloads) => {", label);
    next = replaceOnce(next, "payloads: [...normalizedPayloads],", "payloads: [...receiptPayloads],", label);
    next = replaceOnce(next, "payloads: normalizedPayloads,", "payloads: receiptPayloads,", label);
  }
  if (next.includes(GUEST_BLOCK_PREVIOUS)) next = replaceOnce(next, GUEST_BLOCK_PREVIOUS, GUEST_BLOCK, "query-bound payload completion upgrade");
  if (!next.includes(GUEST_BLOCK)) {
    if (next.includes(GUEST_BLOCK_V2)) next = replaceOnce(next, GUEST_BLOCK_V2, GUEST_BLOCK, "guest guard v2 → v3 (announce:sessions-send excluded) in deliverAgentCommandResult");
    else if (next.includes(`${ANCHOR_OLD}${GUEST_BLOCK_V1}`)) next = replaceOnce(next, `${ANCHOR_OLD}${GUEST_BLOCK_V1}`, `${GUEST_BLOCK}${ANCHOR_OLD}`, "guest guard v1 → v3 (before `if (!deliver)`) in deliverAgentCommandResult");
    else next = replaceOnce(next, ANCHOR_OLD, `${GUEST_BLOCK}${ANCHOR_OLD}`, "guest guard before `if (!deliver)` in deliverAgentCommandResult");
  }
  if (!next.includes(EMPTY_DIAG)) {
    if (next.includes(EMPTY_DIAG_V2)) next = replaceOnce(next, EMPTY_DIAG_V2, EMPTY_DIAG, "guest announce no-payload diagnostic v2 → v3 in deliverAgentCommandResult");
    else next = insertAfter(next, EMPTY_ANCHOR, EMPTY_DIAG, "guest announce no-payload diagnostic in deliverAgentCommandResult");
  }
  return next;
}
// Сторож апстрима (v3): ключ `announce:sessions-send:<runId>:completion` по-прежнему формирует ровно один чанк dist (регион
// src/agents/tools/sessions-send-reply-flow.ts), и это всё ещё ПРИВАТНЫЙ ход (deliver:false, message_tool_only, privateCompletion:true).
// Иначе исключение v3 надо пересмотреть (ключ сменился → приватный ход снова попадёт в guest-ветку под `announce:`; ход стал видимым →
// возможно, его финал гостю нужен). Читает соседние чанки рядом с файлом порта (как linkGuard command-yield-ack-custody); кэш по каталогу.
const SS_REGION = "//#region src/agents/tools/sessions-send-reply-flow.ts\n";
const SS_NEEDLES = ["const idempotencyKey = `announce:sessions-send:${request.runId}:completion`;", "deliver: false,", "sourceReplyDeliveryMode: \"message_tool_only\",", "privateCompletion: true,"];
const ssGuardCache = new Map();
function sessionsSendCompletionKeyGuard(_source, file) {
  if (typeof file !== "string") return `${label}: sentinel needs the dist file path (sessions_send completion key not checked)`;
  const dir = path.dirname(file);
  if (ssGuardCache.has(dir)) return ssGuardCache.get(dir);
  let result;
  try {
    const names = fs.readdirSync(dir).filter((n) => n.endsWith(".mjs") || n.endsWith(".js"));
    const scan = (list) => list.filter((n) => fs.readFileSync(path.join(dir, n), "utf8").includes(SS_REGION));
    const preferred = names.filter((n) => n.startsWith("sessions-spawn-tool-"));
    let hits = scan(preferred);
    if (hits.length === 0) hits = scan(names.filter((n) => !n.startsWith("sessions-spawn-tool-")));
    if (hits.length !== 1) result = `${label}: upstream drift — region sessions-send-reply-flow.ts found in ${hits.length} chunks next to ${path.basename(file)} (v3 exclusion of ${SESSIONS_SEND_COMPLETION_PREFIX} needs review)`;
    else {
      const text = fs.readFileSync(path.join(dir, hits[0]), "utf8");
      const start = text.indexOf(SS_REGION); const end = text.indexOf("//#endregion", start);
      const region = text.slice(start, end === -1 ? undefined : end);
      const missing = SS_NEEDLES.filter((n) => !region.includes(n));
      result = missing.length ? `${label}: upstream drift in ${hits[0]} (sessions_send follow-up completion): missing ${missing.join(" | ")} — v3 exclusion of ${SESSIONS_SEND_COMPLETION_PREFIX} needs review` : null;
    }
  } catch (e) { result = `${label}: sessions_send completion sentinel failed: ${e instanceof Error ? e.message : String(e)}`; }
  ssGuardCache.set(dir, result);
  return result;
}
const count = (s, n) => s.split(n).length - 1;
export const check = { gate: "required", assertions: [
  contains(`${MARK} v2`, "маркер guest-announce-final-inline v2"),
  contains(`${MARK} v3`, "маркер guest-announce-final-inline v3 (исключение announce:sessions-send)"),
  contains(GUEST_BLOCK, "guest-ветка v3 deliverAgentCommandResult целиком"),
  contains(EMPTY_DIAG, "диагностика пустого payload announce-хода гостя (v3)"),
  notContains(GUEST_BLOCK_V2, "остаток guest-ветки v2 (announce:sessions-send:…:completion попадал бы в inline гостя)"),
  notContains(EMPTY_DIAG_V2, "остаток диагностики v2 (без исключения announce:sessions-send)"),
  contains("[hotfix][guest-announce-final] dropping guest-session final", "диагностика дропа"),
  notContains(GUEST_BLOCK_V1, "остаток guest-ветки v1 (после `if (!deliver)`)"),
  contains(ANCHOR_OLD, "штатный `if (!deliver)` сохранён"),
  // идентификаторы, которыми пользуется ветка, должны существовать в функции
  contains("const effectiveSessionKey = outboundSession?.key ?? opts.sessionKey;", "effectiveSessionKey"),
  contains("const deliveryRequested = opts.deliver === true;", "deliveryRequested (10.5: opts.deliver === true)"),
  contains("const deliver = deliveryRequested && !suppressAutomaticDelivery;", "deliver = deliveryRequested && !suppressAutomaticDelivery (10.5)"),
  contains("const replyNormalization = normalizeReplyPayloads(payloads);", "replyNormalization"),
  contains("const deliveryPayloads = projectOutboundPayloadPlanForOutbound(outboundPayloadPlan);", "deliveryPayloads"),
  contains("const completeDelivery = (status, deliverySucceeded, receiptPayloads = normalizedPayloads) => {", "completeDelivery(status, deliverySucceeded)"),
  contains("const { deliveryChannel, isDeliveryChannelKnown, defaultAccountId, resolvedAccountId, resolvedTarget, deliveryTarget, resolvedReplyToId, resolvedThreadTarget, deliveryPlugin } = deliveryRouting;", "deliveryChannel/deliveryTarget из deliveryRouting"),
  // порядок: объявление logPayload → guest-ветка v2 → `if (!deliver)` → первая платформенная отправка
  (c) => { const fn = c.indexOf("async function deliverAgentCommandResult(params) {"); const lp = c.indexOf("const logPayload = (payload) => {", fn); const g = c.indexOf(`${MARK} v2 (2026-10-04)`, fn); const nd = c.indexOf(ANCHOR_OLD, fn); const send = c.indexOf("send = await sendDurableMessageBatchCore({", fn); return fn >= 0 && lp >= 0 && g > lp && nd > g && send > nd ? null : "guest-ветка v2 не между объявлением logPayload и `if (!deliver)` (или sendDurableMessageBatchCore раньше)"; },
  (c) => { const fn = c.indexOf("async function deliverAgentCommandResult(params) {"); const empty = c.indexOf(EMPTY_ANCHOR, fn); const diag = c.indexOf(EMPTY_DIAG, fn); return fn >= 0 && empty >= 0 && diag === empty + EMPTY_ANCHOR.length ? null : "диагностика пустого payload не первой строкой блока `if (deliveryPayloads.length === 0)`"; },
  (c) => count(c, "async function deliverAgentCommandResult(params) {") === 1 && count(c, "send = await sendDurableMessageBatchCore({") === 1 ? null : "deliverAgentCommandResult/sendDurableMessageBatchCore встречаются не по одному разу (новый путь отправки в обход guest-ветки?)",
  (c) => count(c, "deliverPayloads") === 1 ? null : "appendBySession вызывается не один раз",
  (c) => count(c, `//#region ${MARK}`) === 1 ? null : "регион guest-announce-final-inline встречается не один раз (остаток v1?)",
  // v3: каждая проверка `announce:` в guest-коде этого чанка идёт в паре с исключением приватного хода sessions_send (ветка + диагностика)
  (c) => { const a = count(c, 'opts.runId.startsWith("announce:")'); const x = count(c, `!opts.runId.startsWith("${SESSIONS_SEND_COMPLETION_PREFIX}")`); return a === 2 && x === 2 ? null : `ожидалось 2 проверки runId announce: и 2 исключения ${SESSIONS_SEND_COMPLETION_PREFIX} (ветка + диагностика), найдено ${a}/${x}`; },
  // сторож апстрима — последним (читает соседний чанк; дешёвые проверки выше отсекают чужие файлы при fallback-локации по assertions)
  sessionsSendCompletionKeyGuard,
] };
