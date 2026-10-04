// Rewrite-модуль метки telegram-guest-mode-delivery: answerGuestQuery-доставка в delivery.replies.ts (2026.9.1; deliverTextReply → sender.sendText)
// 2026-09-30 (переякорь под 2026.9.7, чанк delivery-BE0K214i.mjs): вызов текстовой ветки теперь deliverTextReply(textReply) — см. ниже.
import { replaceOnce, insertBefore, contains } from "../lib/patch-helpers.mjs";
export const label = "telegram-guest-mode-delivery";
export const verdict = "rewrite";
export const target = { key: "delivery", label: "Telegram delivery.replies bundle", needles: ["async function deliverTextReply(params) {", "async function deliverReplies(params) {", "function filterEmptyTelegramTextChunks(chunks) {"] };
export function patch(source) {
  if (source.includes("TELEGRAM_GUEST_TEXT_LIMIT")) return source;
  let next = source;
  next = insertBefore(
    next,
    "async function deliverTextReply(params) {",
    `const TELEGRAM_GUEST_TEXT_LIMIT = 4096;
const TELEGRAM_GUEST_QUERY_EXPIRED_RE = /query is too old|response timeout expired|query ID is invalid/i;
function buildTelegramGuestResultId() {
\treturn \`oc-\${Date.now().toString(36)}\`;
}
function isTelegramGuestQueryExpiredError(err) {
\treturn TELEGRAM_GUEST_QUERY_EXPIRED_RE.test(formatErrorMessage(err));
}
function truncateTelegramGuestText(text) {
\tif (text.length <= TELEGRAM_GUEST_TEXT_LIMIT) return text;
\tconst suffix = "\\n\\n[Ответ обрезан из-за лимита Telegram guest mode.]";
\treturn \`\${text.slice(0, Math.max(1, TELEGRAM_GUEST_TEXT_LIMIT - suffix.length - 1)).trimEnd()}…\${suffix}\`;
}
function buildTelegramGuestTextResult(text, opts) {
\tconst inputMessageContent = {
\t\tmessage_text: truncateTelegramGuestText(text),
\t\t...(opts?.parseMode ? { parse_mode: opts.parseMode } : {}),
\t\t...((opts?.linkPreview ?? true) ? {} : { link_preview_options: { is_disabled: true } })
\t};
\treturn {
\t\ttype: "article",
\t\tid: buildTelegramGuestResultId(),
\t\ttitle: "Ответ",
\t\tinput_message_content: inputMessageContent,
\t\t...opts?.replyMarkup ? { reply_markup: opts.replyMarkup } : {}
\t};
}
async function answerTelegramGuestQueryViaOfficialApi(guestQueryId, result, token) {
\tif (!token?.trim()) throw new Error("telegram answerGuestQuery fallback unavailable: missing bot token");
\tconst res = await fetch(\`https://api.telegram.org/bot\${token}/answerGuestQuery\`, {
\t\tmethod: "POST",
\t\theaders: { "content-type": "application/json" },
\t\tbody: JSON.stringify({
\t\t\tguest_query_id: guestQueryId,
\t\t\tresult
\t\t})
\t});
\tconst data = await res.json().catch(() => null);
\tif (!res.ok || !data?.ok) {
\t\tconst description = typeof data?.description === "string" ? data.description : \`HTTP \${res.status}\`;
\t\tthrow new Error(\`telegram answerGuestQuery failed: \${description}\`);
\t}
\treturn data.result;
}
async function answerTelegramGuestQuery(bot, guestQueryId, result, runtime, opts) {
\tif (typeof bot?.api?.answerGuestQuery === "function") return await bot.api.answerGuestQuery(guestQueryId, result);
\tif (typeof bot?.api?.raw?.answerGuestQuery === "function") return await bot.api.raw.answerGuestQuery({
\t\tguest_query_id: guestQueryId,
\t\tresult
\t});
\tif (opts?.token) {
\t\truntime?.log?.("telegram answerGuestQuery via official api fallback");
\t\treturn await answerTelegramGuestQueryViaOfficialApi(guestQueryId, result, opts.token);
\t}
\tthrow new Error("telegram answerGuestQuery unavailable");
}
async function sendTelegramGuestText(bot, guestQueryId, text, runtime, opts) {
\tif (!guestQueryId.trim() || !text.trim()) return;
\tconst result = buildTelegramGuestTextResult(text, {
\t\tparseMode: opts?.parseMode,
\t\tlinkPreview: opts?.linkPreview,
\t\treplyMarkup: opts?.replyMarkup
\t});
\tconst sent = await answerTelegramGuestQuery(bot, guestQueryId, result, runtime, { token: opts?.token });
\tconst inlineMessageId = sent?.inline_message_id;
\truntime?.log?.(\`telegram answerGuestQuery ok inline_message_id=\${inlineMessageId ?? "unknown"}\`);
\treturn inlineMessageId ?? "guest";
}
`,
    "Telegram guest delivery helpers",
  );
  next = replaceOnce(
    next,
    `async function deliverTextReply(params) {
\tconst chunks = filterEmptyTelegramTextChunks(params.chunkText(params.text));
\tconst suppressReply = chunks.length > 1 && isSingleUseReplyToMode(params.replyToMode);`,
    `async function deliverTextReply(params) {
\tif (params.guestQueryId) {
\t\tif (params.progress.guestAnswered) return;
\t\tconst guestChunks = filterEmptyTelegramTextChunks(params.chunkText(params.text));
\t\tconst firstChunk = guestChunks[0];
\t\tconst useHtml = Boolean(firstChunk?.htmlText?.trim()) && !firstChunk?.richMessage?.blocks?.length;
\t\tconst fallbackText = (useHtml ? firstChunk?.htmlText : firstChunk?.plainText) ?? params.text;
\t\tconst text = guestChunks.length > 1 ? \`\${fallbackText.trimEnd()}\\n\\n[Ответ обрезан из-за лимита Telegram guest mode.]\` : fallbackText;
\t\tlet guestDeliveredMessageId;
\t\ttry {
\t\t\tguestDeliveredMessageId = await sendTelegramGuestText(params.bot, params.guestQueryId, text, params.runtime, {
\t\t\t\tparseMode: useHtml ? "HTML" : void 0,
\t\t\t\tlinkPreview: params.linkPreview,
\t\t\t\treplyMarkup: params.replyMarkup,
\t\t\t\ttoken: params.token
\t\t\t});
\t\t} catch (err) {
\t\t\tif (!isTelegramGuestQueryExpiredError(err)) throw err;
\t\t\tparams.runtime.log?.(\`telegram guest query expired; falling back to sendMessage: \${formatErrorMessage(err)}\`);
\t\t}
\t\tif (guestDeliveredMessageId != null) {
\t\t\tparams.progress.guestAnswered = true;
\t\t\tmarkDelivered(params.progress);
\t\t\treturn guestDeliveredMessageId;
\t\t}
\t}
\tconst chunks = filterEmptyTelegramTextChunks(params.chunkText(params.text));
\tconst suppressReply = chunks.length > 1 && isSingleUseReplyToMode(params.replyToMode);`,
    "Telegram guest deliverTextReply",
  );
  // 2026.9.7: апстрим (#158164/#158923/#160032, deslop) вынес аргументы текстовой ветки в `const textReply = {...}`, который
  // спредится и в deliverMediaReply. Guest-поля добавляются только в вызов deliverTextReply (не в textReply) — медиа-путь и его
  // внутренние deliverTextReply({...params}) (followUpText/voice fallback) guest-ветку не видят; для guest медиа-ветка недостижима.
  next = replaceOnce(
    next,
    `\t\t\tif (mediaList.length === 0 && resolvedReplyText) firstDeliveredMessageId = await deliverTextReply(textReply);\n`,
    `\t\t\tif (mediaList.length === 0 && resolvedReplyText || params.guestQueryId) firstDeliveredMessageId = await deliverTextReply({
\t\t\t\t...textReply,
\t\t\t\tbot: params.bot,
\t\t\t\ttoken: params.token,
\t\t\t\tguestQueryId: params.guestQueryId,
\t\t\t\ttext: params.guestQueryId && !reply.text ? "[Медиа-вложение недоступно в Telegram guest mode.]" : reply.text || ""
\t\t\t});\n`,
    "Telegram guest media text fallback",
  );
  return next;
}
// Дрейф-сторожа (9.7): guest-ветка стоит первой в deliverTextReply (до sender.sendText); текстовая ветка deliverReplyPlan — единственный
// вызов с guestQueryId, и он перехватывает guest-payload раньше медиа-ветки; textReply сам guest-полей не несёт.
const guestBranchFirst = (src) => {
  const start = src.indexOf("async function deliverTextReply(params) {");
  if (start < 0) return "deliverTextReply not found";
  const guest = src.indexOf("\tif (params.guestQueryId) {", start);
  const send = src.indexOf("params.sender.sendText(", start);
  if (guest < 0 || send < 0 || guest > send) return "guest branch is not ahead of sender.sendText in deliverTextReply";
  return null;
};
const guestCallBeforeMedia = (src) => {
  const call = src.indexOf("if (mediaList.length === 0 && resolvedReplyText || params.guestQueryId) firstDeliveredMessageId = await deliverTextReply({");
  if (call < 0) return "guest text call missing";
  const media = src.indexOf("await deliverMediaReply({", call);
  if (media < 0) return "media branch after guest text call not found";
  const between = src.slice(call, media);
  if (!/\n\t\t\telse if \(mediaList\.length > 0\) \{\n/.test(between)) return "media branch is no longer an else-branch of the guest text call";
  if ((src.match(/guestQueryId: params\.guestQueryId/g) || []).length !== 1) return "guestQueryId forwarded more than once (new path?)";
  const tr = src.indexOf("const textReply = {");
  if (tr >= 0 && /guestQueryId/.test(src.slice(tr, src.indexOf("};", tr)))) return "textReply carries guest fields (media path would inherit them)";
  return null;
};
export const check = { gate: "required", assertions: [
  contains("answerGuestQuery", "answerGuestQuery API path"),
  contains("answerTelegramGuestQueryViaOfficialApi", "official API fallback"),
  contains("sendTelegramGuestText", "guest text sender"),
  contains("params.progress.guestAnswered", "guest duplicate-send guard"),
  contains("guestQueryId: params.guestQueryId,", "guest query id delivery option"),
  contains('text: params.guestQueryId && !reply.text ? "[Медиа-вложение недоступно в Telegram guest mode.]" : reply.text || ""', "guest media-unavailable text"),
  guestBranchFirst,
  guestCallBeforeMedia,
] };
