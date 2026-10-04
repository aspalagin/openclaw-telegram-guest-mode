// Метка guest-media-staging-runner (new 2026-10-04; чанк message-action-runner-*.mjs, src/infra/outbound/message-action-send.ts). Guest-модуль.
// Дефект B: бот не состоит в гостевом чате, прямой `message send` туда невозможен; гостю можно
// вложить только file_id уже загруженного файла (Bot API 10.3, inline-сообщение answerGuestQuery). Перехват в executeMessageSend (агентская
// сторона вызова инструмента; на gateway-стороне того же вызова input.gatewayOwnedDelivery=true → пропуск):
//   условия: канал telegram; input.sessionKey с `:guest:<callerId>-at-<chatId>` (guest-session-per-chat); у send есть медиа (media/mediaUrls/
//   path/filePath/fileUrl/image/buffer/attachments); target (после resolveActionTarget, явный или неявный из toolContext — для гостя это
//   сам гостевой чат) равен chatId гостя; реестр guest-ack загружен и правила media.enabled.
//   действие: `to` → staging-чат (registry.mediaRules().stagingChatId из файла <OPENCLAW_STATE_DIR | $HOME/.openclaw>/hotfix-guest-ack.json, дефолта нет), дальше
//   штатный путь (media roots, stageGatewayWorkspaceMedia, gateway send) без изменений; после ответа — messageId/chatId из payload.result
//   (+receipt.parts для альбомов) → file_id из globalThis.__openclawHotfixTelegramSentMedia (порт telegram-sent-media-file-ids) →
//   registry.attachMediaBySession(sessionKey, {kind, fileId, …, caption}) (порт guest-media-staging-delivery). Итог кладётся в payload
//   инструмента: payload.guestMediaDelivery = {delivered, guestChatId, stagingChatId, stagingTo, items:[…], note} — модель видит, дошло ли.
//   Явный target другого чата — обычная отправка. Побочный эффект: копия файла в staging-чате.
// Доступно в чанке: readToolStringParam, collectActionMediaSourceHints, formatErrorMessage, log (createSubsystemLogger("outbound/message-action")).
import { replaceOnce, insertBefore, contains, notContains } from "../lib/patch-helpers.mjs";
import { target as baseTarget } from "./message-inbound-turn-kind-normalize.mjs";
export const label = "guest-media-staging-runner";
export const verdict = "port";
export const target = baseTarget;
const MARK = "hotfix: guest-media-staging";
const HELPERS = `//#region ${MARK} (runner) 2026-10-04 — message send с медиа из guest-сессии → staging-чат → file_id → inline-сообщение гостя
const HOTFIX_GUEST_SESSION_RE = /:guest:(?:(\\d+)-at-)?(-?\\d+)$/;
function hotfixTelegramTargetChatId(value) {
\tlet text = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
\tfor (;;) {
\t\tconst next = text.replace(/^(?:telegram|tg|user|chat|group|channel):/i, "").trim();
\t\tif (next === text) break;
\t\ttext = next;
\t}
\tconst topic = /^(-?\\d+):(?:(?:direct-topic|topic):)?\\d+$/i.exec(text);
\treturn topic ? topic[1] : text;
}
// Локальный источник медиа (/abs, file:///abs) → абсолютный путь; URL/~/прочее → undefined (режим pipeline).
function hotfixGuestMediaLocalPath(value) {
\tconst text = typeof value === "string" ? value.trim() : "";
\tif (!text) return;
\tif (/^file:\\/\\//i.test(text)) {
\t\ttry {
\t\t\treturn path.resolve(decodeURIComponent(new URL(text).pathname));
\t\t} catch {
\t\t\treturn;
\t\t}
\t}
\tif (text.startsWith("/") && !text.startsWith("//")) return path.resolve(text);
\treturn;
}
// Режим direct: загрузка каждого локального файла в staging-чат через реестр guest-ack (Bot API multipart) и вложение гостю; штатный send не выполняется.
async function hotfixGuestMediaStagingDirect(ctx, staging) {
\tconst registry = globalThis.__openclawHotfixGuestAck;
\tconst items = [];
\tfor (const file of staging.localPaths) {
\t\tif (staging.denied.includes(file)) {
\t\t\titems.push({ path: file, delivered: false, reason: \`media path is outside the allowed local media roots (\${staging.roots.join(", ") || "none"})\` });
\t\t\tcontinue;
\t\t}
\t\ttry {
\t\t\tconst result = await registry.stageAndAttachMedia(staging.sessionKey, { path: file, fileName: staging.localPaths.length === 1 ? staging.fileName : void 0, mimeType: staging.localPaths.length === 1 ? staging.mimeType : void 0, caption: staging.caption, stagingChatId: staging.stagingTo, forceDocument: staging.forceDocument });
\t\t\titems.push({ path: file, ...result });
\t\t} catch (err) {
\t\t\titems.push({ path: file, delivered: false, reason: formatErrorMessage(err) });
\t\t}
\t}
\tconst delivered = items.some((item) => item.delivered);
\tconst failed = items.filter((item) => !item.delivered).map((item) => \`\${path.basename(item.path)}: \${item.reason}\`);
\tconst note = delivered
\t\t? \`Guest delivery: \${items.filter((i) => i.delivered).length} attachment(s) uploaded to the staging chat \${staging.stagingTo} and inserted into the guest's inline message (guest chat \${staging.guestChatId}).\${failed.length ? \` Not attached: \${failed.join("; ")}.\` : ""} Do not resend; mention the attachment briefly in your final text.\`
\t\t: \`Guest delivery FAILED: the file was NOT attached to the guest's message (\${failed.join("; ") || "unknown"}). Tell the guest in words what the file contains.\`;
\tlog.info(\`[hotfix][guest-media-staging] \${delivered ? "attached" : "not attached"} (direct): guestChat=\${staging.guestChatId} staging=\${staging.stagingTo} items=\${JSON.stringify(items)}\`);
\tconst stagingMessageIds = items.map((item) => item.stagingMessageId).filter(Boolean);
\treturn { ok: delivered, channel: ctx.channel, to: staging.stagingTo, messageId: stagingMessageIds.at(-1), stagingMessageIds, guestMediaDelivery: { delivered, mode: "direct", guestChatId: staging.guestChatId, stagingTo: staging.stagingTo, originalTo: staging.originalTo, items, ...(delivered ? {} : { reason: failed.join("; ") }), note } };
}
function hotfixResolveGuestMediaStaging(ctx, to) {
\ttry {
\t\tconst input = ctx?.input;
\t\tif (!input || input.gatewayOwnedDelivery === true || ctx.dryRun) return;
\t\tif ((ctx.channel ?? "") !== "telegram") return;
\t\tconst sessionKey = typeof input.sessionKey === "string" ? input.sessionKey : "";
\t\tconst match = HOTFIX_GUEST_SESSION_RE.exec(sessionKey);
\t\tif (!match) return;
\t\tconst registry = globalThis.__openclawHotfixGuestAck;
\t\tif (typeof registry?.attachMediaBySession !== "function" || typeof registry?.mediaRules !== "function") return;
\t\tconst rules = registry.mediaRules();
\t\tif (!rules?.enabled || !rules.stagingChatId) return;
\t\tconst hasBuffer = Boolean(readToolStringParam(ctx.params, "buffer", { trim: false }));
\t\tconst sources = collectActionMediaSourceHints(ctx.params, void 0, { structuredAttachments: "all" }).map((value) => String(value).trim()).filter(Boolean);
\t\tif (!hasBuffer && sources.length === 0) return;
\t\tconst guestChatId = match[2];
\t\tconst targetChatId = hotfixTelegramTargetChatId(to);
\t\tif (!guestChatId || targetChatId !== guestChatId) return;
\t\tconst stagingTo = String(rules.stagingChatId);
\t\tif (hotfixTelegramTargetChatId(stagingTo) === guestChatId) return;
\t\tconst caption = readToolStringParam(ctx.params, "caption", { trim: false }) ?? readToolStringParam(ctx.params, "message", { trim: false }) ?? "";
\t\t// v3: локальные файлы грузятся в staging напрямую Bot API (режим direct) — outbound-пайплайн у rich-аккаунта встраивает текст+локальное
\t\t// медиа в sendRichMessage (prefer-payload), и file_id в реестр не попадает. URL/buffer — прежний режим pipeline (штатный send, file_id из acceptMany).
\t\tconst localPaths = sources.map((value) => hotfixGuestMediaLocalPath(value)).filter((value) => value !== void 0);
\t\tconst direct = !hasBuffer && sources.length > 0 && localPaths.length === sources.length;
\t\tconst roots = Array.isArray(ctx.mediaAccess?.localRoots) ? ctx.mediaAccess.localRoots.map((root) => path.resolve(String(root))) : [];
\t\tconst denied = direct ? localPaths.filter((file) => !roots.some((root) => isPathInside(root, file))) : [];
\t\tlog.info(\`[hotfix][guest-media-staging] guest session media send rerouted: guestChat=\${guestChatId} target=\${to} → staging=\${stagingTo} mode=\${direct ? "direct" : "pipeline"} sources=\${sources.length}\${denied.length ? \` deniedByRoots=\${denied.length}\` : ""} session=\${sessionKey}\`);
\t\treturn { sessionKey, guestChatId, originalTo: to, stagingTo, caption, mode: direct ? "direct" : "pipeline", localPaths, denied, roots, forceDocument: readBooleanParam(ctx.params, "forceDocument") ?? readBooleanParam(ctx.params, "asDocument") ?? false, fileName: readToolStringParam(ctx.params, "filename"), mimeType: readToolStringParam(ctx.params, "contentType") ?? readToolStringParam(ctx.params, "mimeType") };
\t} catch (err) {
\t\tlog.warn(\`[hotfix][guest-media-staging] detection failed, sending normally: \${formatErrorMessage(err)}\`);
\t\treturn;
\t}
}
// Две формы результата send: Telegram actions.handleAction → jsonResult({ ok, messageId, chatId?, receipt:{threadId, replyToId} })
// (плоский, chatId бывает undefined, deliveryStatus нет); core-путь → { channel, to, result:{chatId, messageId, receipt:{parts, platformMessageIds}}, deliveryStatus }.
function hotfixGuestMediaSentIds(payload, fallbackChatId) {
\tconst out = [];
\tconst seen = new Set();
\tconst push = (chatId, messageId) => {
\t\tconst c = chatId == null || String(chatId).trim() === "" ? (fallbackChatId ?? "") : String(chatId).trim();
\t\tconst m = messageId == null ? "" : String(messageId).trim();
\t\tif (!m || m === "unknown" || m === "suppressed" || seen.has(\`\${c}:\${m}\`)) return;
\t\tseen.add(\`\${c}:\${m}\`);
\t\tout.push({ chatId: c, messageId: m });
\t};
\tconst root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : void 0;
\tif (!root) return out;
\tconst result = root.result && typeof root.result === "object" ? root.result : void 0;
\tif (result) {
\t\tpush(result.chatId, result.messageId);
\t\tfor (const part of result.receipt?.parts ?? []) push(result.chatId, part?.platformMessageId);
\t\tfor (const id of result.receipt?.platformMessageIds ?? []) push(result.chatId, id);
\t}
\tif (root.messageId != null) push(root.chatId, root.messageId);
\tfor (const part of root.receipt?.parts ?? []) push(root.chatId, part?.platformMessageId);
\tfor (const id of root.receipt?.platformMessageIds ?? []) push(root.chatId, id);
\treturn out;
}
// Запись file_id делает acceptMany в send-чанке до возврата результата; на всякий случай ждём до ~0.6 с и ищем по messageId без chatId.
async function hotfixGuestMediaLookupSent(sentMedia, id) {
\tif (!(sentMedia instanceof Map)) return;
\tfor (let attempt = 0; attempt < 4; attempt++) {
\t\tif (id.chatId) {
\t\t\tconst exact = sentMedia.get(\`\${id.chatId}:\${id.messageId}\`);
\t\t\tif (exact) return exact;
\t\t}
\t\tlet byMessage;
\t\tfor (const entry of sentMedia.values()) if (entry?.messageId === id.messageId && (!byMessage || (entry.at ?? 0) > (byMessage.at ?? 0))) byMessage = entry;
\t\tif (byMessage) return byMessage;
\t\tif (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 150));
\t}
}
async function hotfixGuestMediaStagingAfterSend(ctx, staging, payload) {
\tconst registry = globalThis.__openclawHotfixGuestAck;
\tconst sentMedia = globalThis.__openclawHotfixTelegramSentMedia;
\tconst items = [];
\tlet reason;
\ttry {
\t\tconst root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
\t\tconst status = root.deliveryStatus ?? root.status ?? (root.ok === true ? "ok" : void 0);
\t\tconst ids = hotfixGuestMediaSentIds(payload, hotfixTelegramTargetChatId(staging.stagingTo));
\t\tif (ids.length === 0) reason = \`staging send returned no message id (status=\${status ?? "unknown"}, keys=\${Object.keys(root).join(",") || "-"}\${root.error ? \`, error=\${root.error}\` : ""})\`;
\t\tfor (const id of ids) {
\t\t\tconst media = await hotfixGuestMediaLookupSent(sentMedia, id);
\t\t\tif (!media) continue;
\t\t\tconst attached = await registry.attachMediaBySession(staging.sessionKey, { ...media, caption: staging.caption });
\t\t\titems.push({ stagingMessageId: id.messageId, kind: media.kind, fileName: media.fileName, size: media.size, ...attached });
\t\t}
\t\tif (!reason && items.length === 0) reason = \`no media file_id recorded for the staged message(s) \${JSON.stringify(ids)} (text-only send, Telegram returned no media, or sent-media registry missing: \${sentMedia instanceof Map ? \`\${sentMedia.size} entries\` : "absent"})\`;
\t} catch (err) {
\t\treason = formatErrorMessage(err);
\t}
\tconst delivered = items.some((item) => item.delivered);
\tconst failed = items.filter((item) => !item.delivered).map((item) => item.reason).filter(Boolean);
\tconst note = delivered
\t\t? \`Guest delivery: \${items.filter((i) => i.delivered).length} attachment(s) inserted into the guest's inline message (guest chat \${staging.guestChatId}); a copy was sent to the staging chat \${staging.stagingTo}.\${failed.length ? \` Not attached: \${failed.join("; ")}.\` : ""} Do not resend; mention the attachment briefly in your final text.\`
\t\t: \`Guest delivery FAILED: the file was NOT attached to the guest's message (\${reason ?? failed.join("; ") ?? "unknown"}); a copy is in the staging chat \${staging.stagingTo} only. Tell the guest in words what the file contains.\`;
\tlog.info(\`[hotfix][guest-media-staging] \${delivered ? "attached" : "not attached"}: guestChat=\${staging.guestChatId} staging=\${staging.stagingTo} items=\${JSON.stringify(items)}\${reason ? \` reason=\${reason}\` : ""}\`);
\tconst guestMediaDelivery = { delivered, guestChatId: staging.guestChatId, stagingTo: staging.stagingTo, originalTo: staging.originalTo, items, ...(reason ? { reason } : {}), note };
\treturn payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload, guestMediaDelivery } : { payload, guestMediaDelivery };
}
//#endregion
`;
const TO_OLD = "\tconst to = readToolStringParam(params, \"to\", { required: true });\n\tlet sendPayload = await buildMessagePayload({\n";
// v1/v2 inline-вставка (без режима direct) — для апгрейда на пропатченном чанке.
const TO_V2 = `\tlet to = readToolStringParam(params, "to", { required: true });
\t//#region ${MARK} (runner): медиа гостю → staging-чат
\tconst guestMediaStaging = hotfixResolveGuestMediaStaging(ctx, to);
\tif (guestMediaStaging) {
\t\tto = guestMediaStaging.stagingTo;
\t\tparams.to = to;
\t}
\t//#endregion
\tlet sendPayload = await buildMessagePayload({
`;
const TO_NEW = `\tlet to = readToolStringParam(params, "to", { required: true });
\t//#region ${MARK} (runner): медиа гостю → staging-чат
\tconst guestMediaStaging = hotfixResolveGuestMediaStaging(ctx, to);
\tif (guestMediaStaging?.mode === "direct") return await annotateSourceDelivery({ kind: "send", channel, action, to: guestMediaStaging.stagingTo, handledBy: "plugin", payload: await hotfixGuestMediaStagingDirect(ctx, guestMediaStaging), dryRun }, ctx, false);
\tif (guestMediaStaging) {
\t\tto = guestMediaStaging.stagingTo;
\t\tparams.to = to;
\t}
\t//#endregion
\tlet sendPayload = await buildMessagePayload({
`;
const RET_GW_OLD = "\t\treturn await annotateSourceDelivery(withSendNormalization(gatewayPluginAction, sendPayload.normalization), ctx, reply?.source === \"explicit\");\n";
const RET_GW_NEW = `\t\treturn await annotateSourceDelivery(withSendNormalization(guestMediaStaging ? { ...gatewayPluginAction, payload: await hotfixGuestMediaStagingAfterSend(ctx, guestMediaStaging, gatewayPluginAction.payload) } : gatewayPluginAction, sendPayload.normalization), ctx, reply?.source === "explicit"); // ${MARK}\n`;
const RET_CORE_OLD = "\t\thandledBy: send.handledBy,\n\t\tpayload: send.payload,\n\t\t...send.deliveredText ? { deliveredText: send.deliveredText } : {},\n";
const RET_CORE_NEW = `\t\thandledBy: send.handledBy,\n\t\tpayload: guestMediaStaging ? await hotfixGuestMediaStagingAfterSend(ctx, guestMediaStaging, send.payload) : send.payload, // ${MARK}\n\t\t...send.deliveredText ? { deliveredText: send.deliveredText } : {},\n`;
const REGION_START = `//#region ${MARK} (runner)`;
const REGION_END = "//#endregion\n";
// Регион хелперов ставится перед UNRESOLVED_PREFIX_VAR_PATTERN; при апгрейде версии (v1 читал только core-форму результата) регион заменяется целиком.
function replaceHelpersRegion(source) {
  const start = source.indexOf(REGION_START);
  if (start === -1) return insertBefore(source, "const UNRESOLVED_PREFIX_VAR_PATTERN", HELPERS, "guest-media-staging runner helpers before executeMessageSend");
  const endIdx = source.indexOf(REGION_END, start);
  if (endIdx === -1) throw new Error("guest-media-staging-runner: helpers region without //#endregion");
  return `${source.slice(0, start)}${HELPERS}${source.slice(endIdx + REGION_END.length)}`;
}
export function patch(source) {
  if (source.includes(HELPERS) && source.includes(TO_NEW) && source.includes(RET_GW_NEW) && source.includes(RET_CORE_NEW)) return source;
  let next = source.includes(HELPERS) ? source : replaceHelpersRegion(source);
  if (!next.includes(TO_NEW)) next = next.includes(TO_V2) ? replaceOnce(next, TO_V2, TO_NEW, "executeMessageSend target rewrite v2 → v3 (direct mode)") : replaceOnce(next, TO_OLD, TO_NEW, "executeMessageSend target rewrite (guest media → staging)");
  if (!next.includes(RET_GW_NEW)) next = replaceOnce(next, RET_GW_OLD, RET_GW_NEW, "executeMessageSend gateway-action return (attach after send)");
  if (!next.includes(RET_CORE_NEW)) next = replaceOnce(next, RET_CORE_OLD, RET_CORE_NEW, "executeMessageSend core return (attach after send)");
  return next;
}
const count = (s, n) => s.split(n).length - 1;
export const check = { gate: "required", assertions: [
  contains(HELPERS, "хелперы guest-media-staging (регион целиком)"),
  contains(TO_NEW, "перенаправление target в executeMessageSend"),
  contains(RET_GW_NEW, "вложение после gateway send"),
  contains(RET_CORE_NEW, "вложение после core send"),
  notContains(TO_OLD, "старый const to без перехвата"),
  notContains(TO_V2, "inline-вставка v2 без режима direct"),
  (c) => count(c, "hotfixResolveGuestMediaStaging(") === 2 ? null : `hotfixResolveGuestMediaStaging ожидался 2 раза (объявление + вызов), найдено ${count(c, "hotfixResolveGuestMediaStaging(")}`,
  (c) => count(c, `${REGION_START} 2026-10-04`) === 1 ? null : `регион хелперов guest-media-staging (runner) ожидался 1 раз, найдено ${count(c, `${REGION_START} 2026-10-04`)} (апгрейд оставил старую версию?)`,
  (c) => count(c, "hotfixGuestMediaStagingAfterSend(") === 3 ? null : `hotfixGuestMediaStagingAfterSend ожидался 3 раза (объявление + 2 вызова), найдено ${count(c, "hotfixGuestMediaStagingAfterSend(")}`,
  contains("if (root.messageId != null) push(root.chatId, root.messageId);", "плоская форма результата telegram handleAction (messageId на верхнем уровне)"),
  contains("async function hotfixGuestMediaLookupSent(sentMedia, id) {", "поиск file_id по messageId с ожиданием записи"),
  contains("if (guestMediaStaging?.mode === \"direct\") return await annotateSourceDelivery({ kind: \"send\", channel, action, to: guestMediaStaging.stagingTo, handledBy: \"plugin\", payload: await hotfixGuestMediaStagingDirect(ctx, guestMediaStaging), dryRun }, ctx, false);", "режим direct: прямая загрузка без пайплайна (v3)"),
  contains("const denied = direct ? localPaths.filter((file) => !roots.some((root) => isPathInside(root, file))) : [];", "allowlist корней для direct-режима"),
  contains("import { r as isPathInside } from \"./path-guards-", "isPathInside импортирован"),
  contains("import path from \"node:path\";", "path импортирован"),
  contains("import { t as readBooleanParam } from \"./boolean-param-", "readBooleanParam импортирован"),
  // зависимости в чанке
  contains("h as readToolStringParam", "readToolStringParam импортирован"),
  contains("o as collectActionMediaSourceHints", "collectActionMediaSourceHints импортирован"),
  contains("const log = createSubsystemLogger(\"outbound/message-action\");", "логгер outbound/message-action в чанке"),
  contains("import { t as formatErrorMessage } from \"./errors-", "formatErrorMessage в чанке"),
  // перехват должен стоять до buildMessagePayload и до executeGatewayAction внутри executeMessageSend
  (c) => {
    const fn = c.indexOf("async function executeMessageSend(ctx) {");
    const rewrite = c.indexOf("const guestMediaStaging = hotfixResolveGuestMediaStaging(ctx, to);", fn);
    const build = c.indexOf("let sendPayload = await buildMessagePayload({", fn);
    const gw = c.indexOf("const gatewayPluginAction = requiresCoreDelivery ? null : await executeGatewayAction(ctx, {", fn);
    if (fn < 0 || rewrite < 0 || build < 0 || gw < 0) return "executeMessageSend / перехват / buildMessagePayload / executeGatewayAction не найдены";
    return fn < rewrite && rewrite < build && build < gw ? null : "перехват guest-media-staging должен стоять до buildMessagePayload и executeGatewayAction";
  },
] };
