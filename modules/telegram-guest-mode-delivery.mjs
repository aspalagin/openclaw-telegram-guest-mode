// Module telegram-guest-mode-delivery: answerGuestQuery transport in the Telegram delivery.replies bundle
// (OpenClaw 2026.9.7: the text branch of deliverReplyPlan calls deliverTextReply(textReply), which ends in
// sender.sendText). Base of the delivery cascade (guest-plain-delivery-normalize, guest-single-answer-guard,
// guest-no-chat-fallback, guest-ack-edit-delivery, guest-media-staging-delivery build on the code inserted here).
//
// Inserted helpers: TELEGRAM_GUEST_TEXT_LIMIT / truncateTelegramGuestText (4096 with a fixed marker),
// buildTelegramGuestTextResult (InputTextMessageContent article), answerTelegramGuestQuery (bot.api →
// bot.api.raw → direct Bot API HTTP call against the bot's configured apiRoot), sendTelegramGuestText and
// hotfixTelegramApiRoot (apiRoot of the grammy bot: bot.clientConfig.apiRoot, the value OpenClaw passes from
// channels.telegram.apiRoot; default https://api.telegram.org). Every direct HTTP fallback of the kit
// (answerGuestQuery, editMessageText, editMessageMedia/Caption, multipart uploads) uses this helper, so a
// local Bot API server or proxy configured via apiRoot is honoured; the fallbacks only run when the bot
// object has no raw API (offline repros).
import { replaceOnce, insertBefore, contains, notContains } from "../lib/patch-helpers.mjs";
export const label = "telegram-guest-mode-delivery";
export const target = { key: "delivery", label: "Telegram delivery.replies bundle", needles: ["async function deliverTextReply(params) {", "async function deliverReplies(params) {", "function filterEmptyTelegramTextChunks(chunks) {"] };
export const GUEST_TRUNCATED_NOTE = "[Reply truncated: Telegram guest mode limit.]";
export const GUEST_MEDIA_UNAVAILABLE_TEXT = "[Media attachment is not available in Telegram guest mode.]";
export const API_ROOT_HELPER = `function hotfixTelegramApiRoot(bot) {
\tconst configured = typeof bot?.clientConfig?.apiRoot === "string" ? bot.clientConfig.apiRoot.trim().replace(/\\/+$/u, "") : "";
\treturn configured || "https://api.telegram.org";
}
`;
const HELPERS = `const TELEGRAM_GUEST_TEXT_LIMIT = 4096;
const TELEGRAM_GUEST_TRUNCATED_NOTE = ${JSON.stringify(GUEST_TRUNCATED_NOTE)};
const TELEGRAM_GUEST_QUERY_EXPIRED_RE = /query is too old|response timeout expired|query ID is invalid/i;
${API_ROOT_HELPER}function buildTelegramGuestResultId() {
\treturn \`oc-\${Date.now().toString(36)}\`;
}
function isTelegramGuestQueryExpiredError(err) {
\treturn TELEGRAM_GUEST_QUERY_EXPIRED_RE.test(formatErrorMessage(err));
}
function truncateTelegramGuestText(text) {
\tif (text.length <= TELEGRAM_GUEST_TEXT_LIMIT) return text;
\tconst suffix = \`\\n\\n\${TELEGRAM_GUEST_TRUNCATED_NOTE}\`;
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
\t\ttitle: "Reply",
\t\tinput_message_content: inputMessageContent,
\t\t...opts?.replyMarkup ? { reply_markup: opts.replyMarkup } : {}
\t};
}
async function answerTelegramGuestQueryViaOfficialApi(guestQueryId, result, token, apiRoot) {
\tif (!token?.trim()) throw new Error("telegram answerGuestQuery fallback unavailable: missing bot token");
\tconst res = await fetch(\`\${apiRoot}/bot\${token}/answerGuestQuery\`, {
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
\t\truntime?.log?.("telegram answerGuestQuery via direct Bot API fallback");
\t\treturn await answerTelegramGuestQueryViaOfficialApi(guestQueryId, result, opts.token, hotfixTelegramApiRoot(bot));
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
`;
// kit v1.2.0 pieces (Russian strings, fallback pinned to api.telegram.org), recognized for the in-place upgrade. The helper
// block is not contiguous on a patched install (guest-plain-delivery-normalize inserts its own helpers into it), so the
// upgrade replaces the individual pieces.
const HEAD_V120 = "const TELEGRAM_GUEST_TEXT_LIMIT = 4096;\nconst TELEGRAM_GUEST_QUERY_EXPIRED_RE = /query is too old|response timeout expired|query ID is invalid/i;\n";
const HEAD_NEW = `const TELEGRAM_GUEST_TEXT_LIMIT = 4096;
const TELEGRAM_GUEST_TRUNCATED_NOTE = ${JSON.stringify(GUEST_TRUNCATED_NOTE)};
const TELEGRAM_GUEST_QUERY_EXPIRED_RE = /query is too old|response timeout expired|query ID is invalid/i;
${API_ROOT_HELPER}`;
const TRUNCATE_V120 = "\tconst suffix = \"\\n\\n[Ответ обрезан из-за лимита Telegram guest mode.]\";\n";
const TRUNCATE_NEW = "\tconst suffix = `\\n\\n${TELEGRAM_GUEST_TRUNCATED_NOTE}`;\n";
const TITLE_V120 = "\t\ttitle: \"Ответ\",\n\t\tinput_message_content: inputMessageContent,\n";
const TITLE_NEW = "\t\ttitle: \"Reply\",\n\t\tinput_message_content: inputMessageContent,\n";
const OFFICIAL_V120 = `async function answerTelegramGuestQueryViaOfficialApi(guestQueryId, result, token) {
\tif (!token?.trim()) throw new Error("telegram answerGuestQuery fallback unavailable: missing bot token");
\tconst res = await fetch(\`https://api.telegram.org/bot\${token}/answerGuestQuery\`, {
`;
const OFFICIAL_NEW = `async function answerTelegramGuestQueryViaOfficialApi(guestQueryId, result, token, apiRoot) {
\tif (!token?.trim()) throw new Error("telegram answerGuestQuery fallback unavailable: missing bot token");
\tconst res = await fetch(\`\${apiRoot}/bot\${token}/answerGuestQuery\`, {
`;
const ANSWER_V120 = `\t\truntime?.log?.("telegram answerGuestQuery via official api fallback");
\t\treturn await answerTelegramGuestQueryViaOfficialApi(guestQueryId, result, opts.token);
`;
const ANSWER_NEW = `\t\truntime?.log?.("telegram answerGuestQuery via direct Bot API fallback");
\t\treturn await answerTelegramGuestQueryViaOfficialApi(guestQueryId, result, opts.token, hotfixTelegramApiRoot(bot));
`;
const MEDIA_TEXT_LINE = `\t\t\t\ttext: params.guestQueryId && !reply.text ? ${JSON.stringify(GUEST_MEDIA_UNAVAILABLE_TEXT)} : reply.text || ""\n`;
const MEDIA_TEXT_LINE_V120 = `\t\t\t\ttext: params.guestQueryId && !reply.text ? "[Медиа-вложение недоступно в Telegram guest mode.]" : reply.text || ""\n`;
export function patch(source) {
  if (source.includes("TELEGRAM_GUEST_TEXT_LIMIT")) {
    // already patched: upgrade the v1.2.0 helper block and strings in place (the guest branch of
    // deliverTextReply is owned by the cascade modules above and upgraded there)
    let next = source;
    for (const [from, to, label] of [[HEAD_V120, HEAD_NEW, "truncation note + hotfixTelegramApiRoot"], [TRUNCATE_V120, TRUNCATE_NEW, "truncation suffix"], [TITLE_V120, TITLE_NEW, "result title"], [OFFICIAL_V120, OFFICIAL_NEW, "direct Bot API fallback signature"], [ANSWER_V120, ANSWER_NEW, "fallback call with apiRoot"]]) {
      if (next.includes(from)) next = replaceOnce(next, from, to, `Telegram guest delivery v1.2.0 → v1.2.1: ${label}`);
    }
    if (next.includes(MEDIA_TEXT_LINE_V120)) next = replaceOnce(next, MEDIA_TEXT_LINE_V120, MEDIA_TEXT_LINE, "Telegram guest media-unavailable text v1.2.0 → v1.2.1");
    return next;
  }
  let next = source;
  next = insertBefore(next, "async function deliverTextReply(params) {", HELPERS, "Telegram guest delivery helpers");
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
\t\tconst text = guestChunks.length > 1 ? \`\${fallbackText.trimEnd()}\\n\\n\${TELEGRAM_GUEST_TRUNCATED_NOTE}\` : fallbackText;
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
  // 2026.9.7: upstream moved the text-branch arguments into `const textReply = {...}`, which is also spread
  // into deliverMediaReply. Guest fields are added only to the deliverTextReply call (not to textReply): the
  // media path and its inner deliverTextReply({...params}) calls (followUpText/voice fallback) never see the
  // guest branch; for a guest payload the media branch is unreachable.
  next = replaceOnce(
    next,
    `\t\t\tif (mediaList.length === 0 && resolvedReplyText) firstDeliveredMessageId = await deliverTextReply(textReply);\n`,
    `\t\t\tif (mediaList.length === 0 && resolvedReplyText || params.guestQueryId) firstDeliveredMessageId = await deliverTextReply({
\t\t\t\t...textReply,
\t\t\t\tbot: params.bot,
\t\t\t\ttoken: params.token,
\t\t\t\tguestQueryId: params.guestQueryId,
${MEDIA_TEXT_LINE}\t\t\t});\n`,
    "Telegram guest media text fallback",
  );
  return next;
}
// Drift guards (9.7): the guest branch is first in deliverTextReply (before sender.sendText); the text branch
// of deliverReplyPlan is the only call carrying guestQueryId and it intercepts guest payloads before the media
// branch; textReply itself carries no guest fields.
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
export const check = { assertions: [
  contains("answerGuestQuery", "answerGuestQuery API path"),
  contains("answerTelegramGuestQueryViaOfficialApi", "direct Bot API fallback"),
  contains(API_ROOT_HELPER, "hotfixTelegramApiRoot helper (bot.clientConfig.apiRoot)"),
  contains("answerTelegramGuestQueryViaOfficialApi(guestQueryId, result, opts.token, hotfixTelegramApiRoot(bot))", "answerGuestQuery fallback uses the configured apiRoot"),
  notContains("https://api.telegram.org/bot${", "direct Bot API call pinned to api.telegram.org (apiRoot ignored)"),
  contains("sendTelegramGuestText", "guest text sender"),
  contains("params.progress.guestAnswered", "guest duplicate-send guard"),
  contains("guestQueryId: params.guestQueryId,", "guest query id delivery option"),
  contains(MEDIA_TEXT_LINE, "guest media-unavailable text"),
  contains(`const TELEGRAM_GUEST_TRUNCATED_NOTE = ${JSON.stringify(GUEST_TRUNCATED_NOTE)};`, "truncation marker constant"),
  guestBranchFirst,
  guestCallBeforeMedia,
] };
