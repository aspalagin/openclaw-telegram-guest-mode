// Portable OpenClaw 2026.10.9: telegram-guest-mode-bot.1.
import { replaceOnce, contains, notContains } from "../lib/patch-helpers.mjs";
export const label = "telegram-guest-mode-bot";
export const verdict = "rewrite";
export const target = { key: "bot", label: "Telegram inbound pipeline bundle (bot-handlers.inbound-pipeline)", needles: ["function registerTelegramInboundHandlers({ bot, pipeline })", "function createTelegramInboundPipeline({ params: handlerParams, message: messageRuntime, authorization: authorizationRuntime })", "\tconst handleMessage = async (ctx, kind) => {\n\t\tconst isChannelPost = kind === \"channel_post\";"] };
const MARK = "hotfix: telegram-guest-mode-bot";
const HELPER_ANCHOR = "\tconst handleMessage = async (ctx, kind) => {\n\t\tconst isChannelPost = kind === \"channel_post\";\n\t\tconst msg = isChannelPost ? ctx.channelPost : ctx.message;\n\t\tif (!msg) return { kind: \"ignored\" };\n\t\tconst isGroup = isChannelPost || msg.chat.type === \"group\" || msg.chat.type === \"supergroup\";\n\t\tconst isForum = isChannelPost ? false : await resolveForumFlag(msg, isGroup);\n";
const HELPER_NEW = `\t// ${MARK} (guest_message, 10.5): нормализация гостевого сообщения для общего handleMessage
\tconst hotfixNormalizeTelegramGuestMessage = (ctx) => {
\t\tconst guestMsg = ctx.guestMessage ?? ctx.update?.guest_message;
\t\tif (!guestMsg) return;
\t\tconst guestQueryId = typeof guestMsg.guest_query_id === "string" && guestMsg.guest_query_id.trim() ? guestMsg.guest_query_id.trim() : void 0;
\t\tif (!guestQueryId) {
\t\t\tlogVerbose("telegram guest_message skipped: missing guest_query_id");
\t\t\treturn;
\t\t}
\t\tconst guestFrom = guestMsg.from ?? guestMsg.guest_bot_caller_user;
\t\treturn {
\t\t\t...guestMsg,
\t\t\t...guestFrom ? { from: guestFrom } : {}
\t\t};
\t};
\tconst handleMessage = async (ctx, kind) => {
\t\tconst isChannelPost = kind === "channel_post";
\t\tconst isGuestMessage = kind === "guest_message"; // ${MARK}
\t\tconst msg = isChannelPost ? ctx.channelPost : isGuestMessage ? hotfixNormalizeTelegramGuestMessage(ctx) : ctx.message;
\t\tif (!msg) return { kind: "ignored" };
\t\tconst isGroup = !isGuestMessage && (isChannelPost || msg.chat.type === "group" || msg.chat.type === "supergroup");
\t\tconst isForum = isChannelPost || isGuestMessage ? false : await resolveForumFlag(msg, isGroup);
`;
const OVERSIZE_OLD = "\t\t\t\tsendOversizeWarning: !isChannelPost,\n\t\t\t\toversizeLogMessage: isChannelPost ? \"channel post media exceeds size limit\" : \"media exceeds size limit\",\n";
const OVERSIZE_NEW = "\t\t\t\tsendOversizeWarning: !isChannelPost && !isGuestMessage,\n\t\t\t\toversizeLogMessage: isChannelPost ? \"channel post media exceeds size limit\" : isGuestMessage ? \"guest message media exceeds size limit\" : \"media exceeds size limit\",\n";
const ERROR_OLD = "\t\t\tconst errorMessage = isChannelPost ? \"channel_post handler failed\" : \"handler failed\";\n";
const ERROR_NEW = "\t\t\tconst errorMessage = isChannelPost ? \"channel_post handler failed\" : isGuestMessage ? \"guest_message handler failed\" : \"handler failed\";\n";
const DISPATCH_OLD = "\t\tif (ctx.message) return await handleMessage(ctx, \"message\");\n";
const DISPATCH_NEW = "\t\tif (ctx.message) return await handleMessage(ctx, \"message\");\n\t\tif (ctx.guestMessage ?? ctx.update?.guest_message) return await handleMessage(ctx, \"guest_message\"); // " + MARK + "\n";
const REGISTER_OLD = "\tbot.on([\n\t\t\"message\",\n\t\t\"edited_message\",\n\t\t\"channel_post\",\n\t\t\"edited_channel_post\"\n\t], pipeline.handle);";
const REGISTER_NEW = "\tbot.on([\n\t\t\"message\",\n\t\t\"edited_message\",\n\t\t\"channel_post\",\n\t\t\"edited_channel_post\",\n\t\t\"guest_message\"\n\t], pipeline.handle);";
export function patch(source) {
  if (source.includes(HELPER_NEW) && source.includes(DISPATCH_NEW) && source.includes(REGISTER_NEW) && source.includes(OVERSIZE_NEW) && source.includes(ERROR_NEW)) return source;
  let next = source;
  if (!next.includes(HELPER_NEW)) next = replaceOnce(next, HELPER_ANCHOR, HELPER_NEW, "Telegram guest_message kind in handleMessage(ctx, kind)");
  if (!next.includes(OVERSIZE_NEW)) next = replaceOnce(next, OVERSIZE_OLD, OVERSIZE_NEW, "Telegram guest oversize warning off");
  if (!next.includes(ERROR_NEW)) next = replaceOnce(next, ERROR_OLD, ERROR_NEW, "Telegram guest_message handler error label");
  if (!next.includes(DISPATCH_NEW)) next = replaceOnce(next, DISPATCH_OLD, DISPATCH_NEW, "Telegram inbound pipeline guest branch");
  if (!next.includes(REGISTER_NEW)) next = replaceOnce(next, REGISTER_OLD, REGISTER_NEW, "Telegram guest_message registration");
  return next;
}
// Дрейф 10.5: guest-ветка обязана жить внутри handleMessage (тело authorize→processInboundMessage общее) и диспетчиться сразу после message.
const guestInsideHandleMessage = (src) => {
  const start = src.indexOf("\tconst handleMessage = async (ctx, kind) => {");
  const edited = src.indexOf("\tconst handleEditedMessage = async (ctx, kind) => {", start);
  if (start < 0 || edited < 0) return "handleMessage/handleEditedMessage not found";
  const body = src.slice(start, edited);
  for (const needle of ["const isGuestMessage = kind === \"guest_message\";", "await authorizeInboundMessage({", "return await processInboundMessage({", "sendOversizeWarning: !isChannelPost && !isGuestMessage,", "isGuestMessage ? \"guest_message handler failed\""]) if (!body.includes(needle)) return `handleMessage body lost ${needle}`;
  return null;
};
export const check = { gate: "required", assertions: [
  contains(HELPER_NEW, "guest_message kind + normalizer in handleMessage"),
  contains(DISPATCH_NEW, "guest branch right after message branch in pipeline.handle"),
  contains(REGISTER_NEW, "guest_message in bot.on([...]) registration"),
  contains(OVERSIZE_NEW, "guest oversize warning suppressed"),
  contains(ERROR_NEW, "guest inbound error label"),
  notContains("\tconst isForum = isChannelPost ? false : await resolveForumFlag(msg, isGroup);\n", "unpatched forum resolution (guest chat getChat)"),
  contains("\t\tconst senderId = isChannelPost && msg.sender_chat?.id != null ? String(msg.sender_chat.id) : msg.from?.id != null ? String(msg.from.id) : \"\";", "senderId still from msg.from (guest caller via normalizer)"),
  contains("\t\t\t\trequireConfiguredGroup: isChannelPost,\n\t\t\t\tdmAccess: \"challenge\"", "authorizeInboundMessage contract (requireConfiguredGroup/dmAccess) unchanged"),
  guestInsideHandleMessage,
  (src) => (src.split("handleMessage(ctx, \"guest_message\")").length - 1) === 1 ? null : "guest dispatch must appear exactly once",
] };
