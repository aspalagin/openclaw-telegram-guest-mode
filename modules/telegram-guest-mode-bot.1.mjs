// Module telegram-guest-mode-bot, part 1/2: guest_message registration in the Telegram ingress drain-factory.
// OpenClaw 2026.9.7: the telegram-ingress-drain-factory chunk is merged into transport-status-*.mjs (same
// createTelegramInboundHandlers). Upstream merged handleEditedChannelPost into handleEditedMessage(ctx, kind) — the
// insertion anchor targets the new signature `handleEditedMessage = async (ctx, kind) =>` (the 9.6 one is kept as a
// fallback). The guest_message handler semantics are unchanged: handleInboundMessageLike still takes isForum from the
// event; messageThreadId is no longer read from the event in 9.7 (harmless, kept for parity).
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label = "telegram-guest-mode-bot";
export const target = { key: "bot", label: "Telegram ingress drain-factory bundle (inbound handlers)", needles: ["function registerTelegramInboundHandlers({ bot, pipeline })", "function createTelegramInboundPipeline({ params, message, authorization })", "const handleInboundMessageLike = async (event) => {"] };
const EDIT_ANCHOR_97 = "\tconst handleEditedMessage = async (ctx, kind) => {";
const EDIT_ANCHOR_96 = "\tconst handleEditedMessage = async (ctx) => {";
export function patch(source) {
  if (source.includes('bot.on("guest_message", pipeline.handle)')) return source;
  let next = source;
  const editAnchor = next.includes(EDIT_ANCHOR_97) ? EDIT_ANCHOR_97 : EDIT_ANCHOR_96;
  next = replaceOnce(
    next,
    editAnchor,
    `\tconst handleGuestMessage = async (ctx) => {
\t\tconst msg = ctx.guestMessage ?? ctx.update?.guest_message;
\t\tif (!msg) return { kind: "ignored" };
\t\tconst guestQueryId = typeof msg.guest_query_id === "string" && msg.guest_query_id.trim() ? msg.guest_query_id.trim() : void 0;
\t\tif (!guestQueryId) {
\t\t\tlogVerbose("telegram guest_message skipped: missing guest_query_id");
\t\t\treturn { kind: "ignored" };
\t\t}
\t\tconst guestFrom = msg.from ?? msg.guest_bot_caller_user;
\t\tconst normalizedMsg = withResolvedTelegramForumFlag({
\t\t\t...msg,
\t\t\t...(guestFrom ? { from: guestFrom } : {})
\t\t}, false);
\t\tconst botUserId = resolveBotUserId(ctx);
\t\tif (normalizedMsg.from?.id != null && normalizedMsg.from.id === botUserId) return { kind: "ignored" };
\t\treturn await handleInboundMessageLike({
\t\t\tctxForDedupe: ctx,
\t\t\tctx: buildSyntheticContext(ctx, normalizedMsg),
\t\t\tbotUserId,
\t\t\tmsg: normalizedMsg,
\t\t\tchatId: normalizedMsg.chat.id,
\t\t\tisGroup: false,
\t\t\tisForum: false,
\t\t\tmessageThreadId: void 0,
\t\t\tsenderId: normalizedMsg.from?.id != null ? String(normalizedMsg.from.id) : "",
\t\t\tsenderUsername: normalizedMsg.from?.username ?? "",
\t\t\trequireConfiguredGroup: false,
\t\t\tsendOversizeWarning: false,
\t\t\toversizeLogMessage: "guest message media exceeds size limit",
\t\t\terrorMessage: "guest_message handler failed"
\t\t});
\t};
${editAnchor}`,
    "Telegram guest_message handler (drain-factory)",
  );
  next = replaceOnce(
    next,
    "\treturn {\n\t\thandleMessage,\n\t\thandleEditedMessage,",
    "\treturn {\n\t\thandleMessage,\n\t\thandleGuestMessage,\n\t\thandleEditedMessage,",
    "Telegram inbound handlers export",
  );
  next = replaceOnce(
    next,
    "\t\tif (ctx.message) return await handlers.handleMessage(ctx);",
    "\t\tif (ctx.message) return await handlers.handleMessage(ctx);\n\t\tif (ctx.guestMessage ?? ctx.update?.guest_message) return await handlers.handleGuestMessage(ctx);",
    "Telegram inbound pipeline guest branch",
  );
  next = replaceOnce(
    next,
    '\tbot.on("message", pipeline.handle);',
    '\tbot.on("message", pipeline.handle);\n\tbot.on("guest_message", pipeline.handle);',
    "Telegram guest_message registration",
  );
  return next;
}
export const check = { assertions: [
  contains('bot.on("guest_message"', "guest_message handler"),
  contains("handlers.handleGuestMessage(ctx)", "guest pipeline branch"),
  contains('errorMessage: "guest_message handler failed"', "guest inbound event"),
  // drift 9.7: pipeline.handle must route the guest branch right after message; the handler sits next to handleEditedMessage.
  contains("\t\tif (ctx.message) return await handlers.handleMessage(ctx);\n\t\tif (ctx.guestMessage ?? ctx.update?.guest_message) return await handlers.handleGuestMessage(ctx);", "guest branch right after message branch"),
  contains("\treturn {\n\t\thandleMessage,\n\t\thandleGuestMessage,", "guest handler exported from createTelegramInboundHandlers"),
  // handleInboundMessageLike must still accept the event shape the guest handler passes
  contains("const handleInboundMessageLike = async (event) => {", "handleInboundMessageLike(event) contract"),
  contains("\t\t\t\tisForum: event.isForum,\n\t\t\t\tsenderId: event.senderId,", "authorizeInboundMessage still reads event.isForum/senderId"),
] };
