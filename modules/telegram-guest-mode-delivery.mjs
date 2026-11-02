// Portable OpenClaw 2026.10.9: telegram-guest-mode-delivery.
import { replaceOnce, insertBefore, contains } from "../lib/patch-helpers.mjs";
export const API_ROOT_HELPER = `function hotfixTelegramApiRoot(bot) {
\tconst configured = typeof bot?.clientConfig?.apiRoot === "string" ? bot.clientConfig.apiRoot.trim().replace(/\\/+$/u, "") : "";
\treturn configured || "https://api.telegram.org";
}
`;
export const label = "telegram-guest-mode-delivery";
export const verdict = "rewrite";
export const target = { key: "delivery", label: "Telegram delivery.replies bundle", needles: ["function createReplyDeliverer(config, sender, progress) {", "async function deliverReplyPlan(params, createPlan) {", "const { deliverTextReply, deliverMediaReply } = createReplyDeliverer(params, sender, progress);"] };
const HELPER_ANCHOR = "function createReplyDeliverer(config, sender, progress) {";
// апстримные параметры планирования страниц deliverTextReply 10.5 (hotfixGuestPlanTextChunks повторяет их; сторож дрейфа ниже)
const UPSTREAM_PLAN = "\t\tconst chunks = planTelegramTextDeliveryPages({\n\t\t\ttext: params.text,\n\t\t\tmaxChars: config.richMessages === true ? Math.min(config.textLimit, TELEGRAM_RICH_TEXT_LIMIT) : Math.min(config.textLimit, 4e3),\n\t\t\tchunkMode: config.chunkMode ?? \"length\",\n\t\t\ttableMode: config.tableMode,\n\t\t\trichMessages: config.richMessages,\n\t\t\tskipEntityDetection: config.linkPreview === false,\n\t\t\t...config.textMode ? { textMode: config.textMode } : {}\n\t\t}).filter((chunk) => chunk.richMessage?.blocks.length || chunk.htmlText?.trim() || chunk.plainText.trim());\n";
const TEXT_ENTRY = "\tasync function deliverTextReply(params) {\n\t\tconst replyProgress = params.progress ?? progress;\n";
const COUNT_OLD = "\tconst deliveredCount = () => sender.parts.length + deliveredReactions;\n";
const COUNT_NEW = "\tconst deliveredCount = () => sender.parts.length + deliveredReactions + (progress.guestDeliveredCount ?? 0); // hotfix: telegram-guest-mode-delivery (inline-ответ гостя не в sender.parts)\n";
export function patch(source) {
  if (source.includes("TELEGRAM_GUEST_TEXT_LIMIT") && source.includes(COUNT_NEW)) return source;
  let next = source;
  next = insertBefore(
    next,
    HELPER_ANCHOR,
    `${API_ROOT_HELPER}const TELEGRAM_GUEST_TEXT_LIMIT = 4096;
const TELEGRAM_GUEST_QUERY_EXPIRED_RE = /query is too old|response timeout expired|query ID is invalid/i;
function buildTelegramGuestResultId() {
\treturn \`oc-\${Date.now().toString(36)}\`;
}
function isTelegramGuestQueryExpiredError(err) {
\treturn TELEGRAM_GUEST_QUERY_EXPIRED_RE.test(formatErrorMessage(err));
}
function truncateTelegramGuestText(text) {
\tif (text.length <= TELEGRAM_GUEST_TEXT_LIMIT) return text;
\tconst suffix = "\\n\\n[Reply truncated: Telegram guest mode limit.]";
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
\t\truntime?.log?.("telegram answerGuestQuery via official api fallback");
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
function hotfixGuestPlanTextChunks(config, text) {
\treturn planTelegramTextDeliveryPages({
\t\ttext,
\t\tmaxChars: config.richMessages === true ? Math.min(config.textLimit, TELEGRAM_RICH_TEXT_LIMIT) : Math.min(config.textLimit, 4e3),
\t\tchunkMode: config.chunkMode ?? "length",
\t\ttableMode: config.tableMode,
\t\trichMessages: config.richMessages,
\t\tskipEntityDetection: config.linkPreview === false,
\t\t...config.textMode ? { textMode: config.textMode } : {}
\t}).filter((chunk) => chunk.richMessage?.blocks.length || chunk.htmlText?.trim() || chunk.plainText.trim());
}
function hotfixGuestMarkDelivered(progress) {
\tprogress.guestDeliveredCount = (progress.guestDeliveredCount ?? 0) + 1;
}
`,
    "Telegram guest delivery helpers",
  );
  next = replaceOnce(
    next,
    TEXT_ENTRY,
    `\tasync function deliverTextReply(params) {
\t\tif (params.guestQueryId) {
\t\t\tif (progress.guestAnswered) return;
\t\t\tconst guestChunks = hotfixGuestPlanTextChunks(config, params.text);
\t\t\tconst firstChunk = guestChunks[0];
\t\t\tconst useHtml = Boolean(firstChunk?.htmlText?.trim()) && !firstChunk?.richMessage?.blocks?.length;
\t\t\tconst fallbackText = (useHtml ? firstChunk?.htmlText : firstChunk?.plainText) ?? params.text;
\t\t\tconst text = guestChunks.length > 1 ? \`\${fallbackText.trimEnd()}\\n\\n[Reply truncated: Telegram guest mode limit.]\` : fallbackText;
\t\t\tlet guestDeliveredMessageId;
\t\t\ttry {
\t\t\t\tguestDeliveredMessageId = await sendTelegramGuestText(config.bot, params.guestQueryId, text, config.runtime, {
\t\t\t\t\tparseMode: useHtml ? "HTML" : void 0,
\t\t\t\t\tlinkPreview: config.linkPreview,
\t\t\t\t\treplyMarkup: params.replyMarkup,
\t\t\t\t\ttoken: config.token
\t\t\t\t});
\t\t\t} catch (err) {
\t\t\t\tif (!isTelegramGuestQueryExpiredError(err)) throw err;
\t\t\t\tconfig.runtime.log?.(\`telegram guest query expired; falling back to sendMessage: \${formatErrorMessage(err)}\`);
\t\t\t}
\t\t\tif (guestDeliveredMessageId != null) {
\t\t\t\tprogress.guestAnswered = true;
\t\t\t\thotfixGuestMarkDelivered(progress);
\t\t\t\treturn guestDeliveredMessageId;
\t\t\t}
\t\t}
\t\tconst replyProgress = params.progress ?? progress;
`,
    "Telegram guest deliverTextReply",
  );
  next = replaceOnce(next, COUNT_OLD, COUNT_NEW, "Telegram guest delivered count");
  // 2026.9.7: апстрим (#158164/#158923/#160032, deslop) вынес аргументы текстовой ветки в `const textReply = {...}`, который
  // спредится и в deliverMediaReply. Guest-поля добавляются только в вызов deliverTextReply (не в textReply) — медиа-путь и его
  // внутренние deliverTextReply({...params}) (followUpText/voice fallback) guest-ветку не видят; для guest медиа-ветка недостижима.
  // 10.5: bot/token в вызов больше не нужны — guest-ветка берёт их из config замыкания createReplyDeliverer.
  next = replaceOnce(
    next,
    `\t\t\tif (mediaList.length === 0 && resolvedReplyText) firstDeliveredMessageId = await deliverTextReply(textReply);\n`,
    `\t\t\tif (mediaList.length === 0 && resolvedReplyText || params.guestQueryId) firstDeliveredMessageId = await deliverTextReply({
\t\t\t\t...textReply,
\t\t\t\tguestQueryId: params.guestQueryId,
\t\t\t\ttext: params.guestQueryId && !reply.text ? "[Media attachment is not available in Telegram guest mode.]" : reply.text || ""
\t\t\t});\n`,
    "Telegram guest media text fallback",
  );
  return next;
}
// Дрейф-сторожа (9.7): guest-ветка стоит первой в deliverTextReply (до sender.sendText); текстовая ветка deliverReplyPlan — единственный
// вызов с guestQueryId, и он перехватывает guest-payload раньше медиа-ветки; textReply сам guest-полей не несёт.
const guestBranchFirst = (src) => {
  const start = src.indexOf("\tasync function deliverTextReply(params) {\n\t\tif (params.guestQueryId) {");
  if (start < 0) return "guest branch is not the first statement of deliverTextReply (createReplyDeliverer)";
  const factory = src.lastIndexOf("function createReplyDeliverer(config, sender, progress) {", start);
  const plan = src.indexOf("const chunks = planTelegramTextDeliveryPages({", start);
  const send = src.indexOf("return sender.sendText({", start);
  if (factory < 0 || plan < 0 || send < 0 || !(start < plan && plan < send)) return "guest branch is not ahead of page planning / sender.sendText inside createReplyDeliverer";
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
  contains("function hotfixGuestPlanTextChunks(config, text) {", "guest page planner (10.5)"),
  contains(COUNT_NEW, "guest inline answer counted in deliveredCount (10.5)"),
  contains(UPSTREAM_PLAN, "upstream deliverTextReply page planning unchanged (hotfixGuestPlanTextChunks mirrors it)"),
  (src) => /^import \{[^\n]*\bas planTelegramTextDeliveryPages\b[^\n]*\} from "\.\/send-[A-Za-z0-9_-]+\.mjs";$/m.test(src) ? null : "planTelegramTextDeliveryPages not imported from send-* (guest planner)",
  (src) => /^import \{[^\n]*\bas TELEGRAM_RICH_TEXT_LIMIT\b[^\n]*\} from "\.\/text-chunk-limit-[A-Za-z0-9_-]+\.mjs";$/m.test(src) ? null : "TELEGRAM_RICH_TEXT_LIMIT not imported (guest planner)",
  contains("\tconst { deliverTextReply, deliverMediaReply } = createReplyDeliverer(params, sender, progress);\n", "createReplyDeliverer gets deliverReplyPlan params as config and the shared progress"),
  contains("answerTelegramGuestQueryViaOfficialApi", "official API fallback"),
  contains("sendTelegramGuestText", "guest text sender"),
  contains("if (progress.guestAnswered) return;", "guest duplicate-send guard"),
  contains("guestQueryId: params.guestQueryId,", "guest query id delivery option"),
  contains('text: params.guestQueryId && !reply.text ? "[Media attachment is not available in Telegram guest mode.]" : reply.text || ""', "guest media-unavailable text"),
  guestBranchFirst,
  guestCallBeforeMedia,
] };
