// Rewrite-модуль метки telegram-guest-mode-bot, часть 2/2: контекст/сессия/доставка гостевого сообщения в bot-message (2026.9.1)
// 2026-09-24 (переякорь под 2026.9.6): регион extensions/telegram/src/ingress.ts (с createTelegramIngressSubject — прежний якорь хелперов)
// уехал из bot-message в чанк progress-draft-preview-*.mjs (решение бандлера, bot-message его импортирует). Хелперы — самодостаточные
// function-декларации верхнего уровня (hoisting), ставятся перед регионом bot-message-context.session.ts, где считается sessionKey.
// Остальные 9 якорей в 9.6 байт-в-байт те же (по 1 вхождению; direct-messages — 2, replaceAll как и раньше).
// 2026-09-30 (переякорь под 2026.9.7, bot-message-D_h8xVny.mjs): апстрим aaf0be1026c (#159258) свернул инлайн-расчёт
// baseSessionKey + shouldUseTelegramDmThreadSession/resolveThreadSessionKeys в хелпер resolveTelegramTargetSession(...)
// (conversation-route-*.mjs, тело байт-в-байт прежнее) → якорь sessionKey переписан на вызов хелпера, семантика та же:
// threadedSessionKey = результат хелпера, гостю — суффикс :guest:<scope>. Там же sendTyping/sendRecordVoice слиты в
// sendChatAction(action) → строка direct-messages теперь одна (replaceAll ловит её), assertion ниже требует, чтобы
// НЕ осталось ни одного негардированного `if (threadSpec.scope === "direct-messages") return;` (новый путь chat action без isGuest).
import { replaceOnce, insertBefore, contains, notContains } from "../lib/patch-helpers.mjs";
export const label = "telegram-guest-mode-bot";
export const verdict = "rewrite";
export const target = { key: "bot", label: "Telegram bot-message bundle (message context + dispatch)", needles: ["async function buildTelegramInboundContextPayload(params) {", "const sendRecordVoice = async () => {", "function createDraftState(params) {"] };
export function patch(source) {
  if (source.includes("normalizeTelegramGuestSessionScope")) return source;
  let next = source;
  next = insertBefore(
    next,
    "//#region extensions/telegram/src/bot-message-context.session.ts\n",
    `function normalizeTelegramGuestSessionScope(value) {
\tconst normalized = String(value ?? "").trim().toLowerCase(); // 2026-09-19: self-contained; 9.4 bot-message no longer imports normalizeLowercaseStringOrEmpty
\tconst safe = normalized.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
\treturn safe.slice(0, 96) || "unknown";
}
function resolveTelegramGuestSessionKey(baseSessionKey, msg) {
\tconst guestQueryId = typeof msg.guest_query_id === "string" && msg.guest_query_id.trim() ? msg.guest_query_id.trim() : "";
\tif (!guestQueryId) return baseSessionKey;
\tconst callerChatId = msg.guest_bot_caller_chat?.id != null ? String(msg.guest_bot_caller_chat.id) : "";
\tconst callerUserId = msg.guest_bot_caller_user?.id != null ? String(msg.guest_bot_caller_user.id) : msg.from?.id != null ? String(msg.from.id) : "";
\tconst scope = callerChatId || callerUserId || guestQueryId;
\treturn \`\${baseSessionKey}:guest:\${normalizeTelegramGuestSessionScope(scope)}\`;
}
function resolveTelegramGuestQueryIdFromPayload(ctxPayload) {
\tconst value = ctxPayload?.GuestQueryId;
\treturn typeof value === "string" && value.trim() ? value.trim() : void 0;
}
`,
    "Telegram guest session helpers",
  );
  next = replaceOnce(
    next,
    `\tconst msg = primaryCtx.message;
\tconst chatId = msg.chat.id;
\tconst isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
\tconst senderId = msg.from?.id ? String(msg.from.id) : "";
\tconst isDirectMessagesChat = msg.chat.is_direct_messages === true;
\tconst reactionApi = typeof bot.api.setMessageReaction === "function" ? bot.api.setMessageReaction.bind(bot.api) : null;`,
    `\tconst msg = primaryCtx.message;
\tconst chatId = msg.chat.id;
\tconst guestQueryId = typeof msg.guest_query_id === "string" && msg.guest_query_id.trim() ? msg.guest_query_id.trim() : void 0;
\tconst isGuest = Boolean(guestQueryId);
\tconst isGroup = !isGuest && (msg.chat.type === "group" || msg.chat.type === "supergroup");
\tconst senderId = msg.from?.id ? String(msg.from.id) : msg.guest_bot_caller_user?.id != null ? String(msg.guest_bot_caller_user.id) : "";
\tconst isDirectMessagesChat = msg.chat.is_direct_messages === true;
\tconst reactionApi = !isGuest && typeof bot.api.setMessageReaction === "function" ? bot.api.setMessageReaction.bind(bot.api) : null;`,
    "Telegram guest message-context header",
  );
  next = replaceOnce(
    next,
    `\tconst senderUsername = msg.from?.username ?? "";`,
    `\tconst senderUsername = msg.from?.username ?? msg.guest_bot_caller_user?.username ?? "";`,
    "Telegram guest sender username",
  );
  next = next.replaceAll(
    `\t\tif (threadSpec.scope === "direct-messages") return;`,
    `\t\tif (isGuest || threadSpec.scope === "direct-messages") return;`,
  );
  next = replaceOnce(
    next,
    `\tconst sessionKey = resolveTelegramTargetSession({
\t\tcfg,
\t\troute,
\t\tchatId,
\t\tisGroup,
\t\tsenderId,
\t\tdmThreadId,
\t\tbotHasTopicsEnabled: threadSpec.scope === "dm" && msg.is_topic_message === true || resolveTelegramBotHasTopicsEnabled(primaryCtx.me)
\t});
\troute = {`,
    `\tconst threadedSessionKey = resolveTelegramTargetSession({
\t\tcfg,
\t\troute,
\t\tchatId,
\t\tisGroup,
\t\tsenderId,
\t\tdmThreadId,
\t\tbotHasTopicsEnabled: threadSpec.scope === "dm" && msg.is_topic_message === true || resolveTelegramBotHasTopicsEnabled(primaryCtx.me)
\t});
\tconst sessionKey = isGuest ? resolveTelegramGuestSessionKey(threadedSessionKey, msg) : threadedSessionKey;
\troute = {`,
    "Telegram guest session key",
  );
  next = replaceOnce(
    next,
    `\tconst ctxPayload = await sessionRuntime.buildChannelInboundEventContext({`,
    `\tconst effectiveInboundEventKind = msg.guest_query_id ? "guest_message" : inboundEventKind;
\tconst guestModeDeliveryHint = msg.guest_query_id ? "Telegram Guest Mode: deliver the final reply as concise plain text only. Do not use message delivery tools, TTS, voice, audio, files, media, reactions, or typing cues. You may use available tools, including longer-running tools, when needed to complete the user's request; do not refuse only because this is Guest Mode." : void 0;
\tconst ctxPayload = await sessionRuntime.buildChannelInboundEventContext({`,
    "Telegram guest delivery hint",
  );
  next = replaceOnce(
    next,
    `\t\tmessage: {
\t\t\tinboundEventKind,
\t\t\tbody,
\t\t\trawBody,
\t\t\tbodyForAgent: appendMediaUnavailableNotice(shouldRenderBufferedBody ? visibleBodyText : bodyText),`,
    `\t\tmessage: {
\t\t\tinboundEventKind: effectiveInboundEventKind,
\t\t\tbody,
\t\t\trawBody,
\t\t\tbodyForAgent: guestModeDeliveryHint ? \`\${appendMediaUnavailableNotice(shouldRenderBufferedBody ? visibleBodyText : bodyText)}\\n\\n\${guestModeDeliveryHint}\` : appendMediaUnavailableNotice(shouldRenderBufferedBody ? visibleBodyText : bodyText),`,
    "Telegram guest inbound payload",
  );
  next = replaceOnce(
    next,
    `\t\t\tForwardedFromMessageId: visibleForwardOrigin?.fromMessageId,
\t\t\tWasMentioned: isGroup ? effectiveWasMentioned : void 0,
\t\t\tSticker: allMedia[0]?.stickerMetadata,`,
    `\t\t\tForwardedFromMessageId: visibleForwardOrigin?.fromMessageId,
\t\t\tWasMentioned: isGroup ? effectiveWasMentioned : void 0,
\t\t\tGuestMode: msg.guest_query_id ? true : void 0,
\t\t\tGuestDeliveryHint: guestModeDeliveryHint,
\t\t\tGuestQueryId: typeof msg.guest_query_id === "string" ? msg.guest_query_id : void 0,
\t\t\tGuestBotCallerUserId: msg.guest_bot_caller_user?.id != null ? String(msg.guest_bot_caller_user.id) : void 0,
\t\t\tGuestBotCallerChatId: msg.guest_bot_caller_chat?.id != null ? String(msg.guest_bot_caller_chat.id) : void 0,
\t\t\tSticker: allMedia[0]?.stickerMetadata,`,
    "Telegram guest context extras",
  );
  next = replaceOnce(
    next,
    `\tconst streamDeliveryEnabled = !isRoomEvent && params.streamMode !== "off";`,
    `\tconst isGuestQuery = Boolean(resolveTelegramGuestQueryIdFromPayload(params.context.ctxPayload));
\tconst streamDeliveryEnabled = !isRoomEvent && !isGuestQuery && params.streamMode !== "off";`,
    "Telegram guest stream suppression",
  );
  next = replaceOnce(
    next,
    `\t\tlinkPreview: turn.telegramCfg.linkPreview,
\t\treplyQuoteMessageId: turn.replyQuoteMessageId,`,
    `\t\tlinkPreview: turn.telegramCfg.linkPreview,
\t\tguestQueryId: resolveTelegramGuestQueryIdFromPayload(turn.context.ctxPayload),
\t\treplyQuoteMessageId: turn.replyQuoteMessageId,`,
    "Telegram guest delivery option",
  );
  next = replaceOnce(
    next,
    `\tif (options?.durable && durableDelivery && projectionSequence.isFresh()) {`,
    `\tif (options?.durable && durableDelivery && projectionSequence.isFresh() && !resolveTelegramGuestQueryIdFromPayload(turn.context.ctxPayload)) {`,
    "Telegram guest durable suppression",
  );
  return next;
}
export const check = { gate: "required", assertions: [
  contains("resolveTelegramGuestSessionKey", "guest session key helper"),
  contains("const isGuest = Boolean(guestQueryId);", "guest mode flag"),
  contains("GuestMode: msg.guest_query_id ? true : void 0", "GuestMode context flag"),
  contains("GuestQueryId", "GuestQueryId context field"),
  contains('if (isGuest || threadSpec.scope === "direct-messages") return;', "guest typing/voice cue suppression"),
  contains("guestModeDeliveryHint", "guest delivery hint"),
  contains("guestQueryId: resolveTelegramGuestQueryIdFromPayload(turn.context.ctxPayload),", "guest delivery option"),
  contains("!isGuestQuery && params.streamMode", "guest stream suppression"),
  contains("const sessionKey = isGuest ? resolveTelegramGuestSessionKey(threadedSessionKey, msg) : threadedSessionKey;\n\troute = {", "guest session key feeds route.sessionKey (9.7: resolveTelegramTargetSession)"),
  notContains('\tif (threadSpec.scope === "direct-messages") return;', "unguarded chat-action path (new sendChatAction variant without isGuest)"),
  contains("if (options?.durable && durableDelivery && projectionSequence.isFresh() && !resolveTelegramGuestQueryIdFromPayload(turn.context.ctxPayload)) {", "guest durable suppression"),
  // 2026-09-30 (по запросу G2): durable-путь (telegramDeps.deliverStructuredInboundReplyWithMessageSendContext → core durable-delivery)
  // идёт мимо чанка delivery-* и гостевых портов там; закрыт только вставкой выше. Сторож дрейфа: в bot-message ровно одна ссылка на
  // durable-доставку и ровно один её вызов, и этот вызов находится внутри гостевого гейта (иначе — новый durable-путь в обход гостя).
  (c) => {
    const GATE = "if (options?.durable && durableDelivery && projectionSequence.isFresh() && !resolveTelegramGuestQueryIdFromPayload(turn.context.ctxPayload)) {";
    const refs = c.split("deliverStructuredInboundReplyWithMessageSendContext").length - 1;
    if (refs !== 1) return `expected exactly 1 reference to deliverStructuredInboundReplyWithMessageSendContext in bot-message, found ${refs} (new durable path may bypass guest suppression)`;
    const calls = c.split("await durableDelivery(").length - 1;
    if (calls !== 1) return `expected exactly 1 durableDelivery( call, found ${calls} (new durable path may bypass guest suppression)`;
    const bind = c.indexOf("const durableDelivery = turn.telegramDeps.deliverStructuredInboundReplyWithMessageSendContext;");
    const gate = c.indexOf(GATE); const call = c.indexOf("await durableDelivery(");
    if (bind < 0 || gate < 0 || !(bind < gate && gate < call)) return "durable delivery call is not inside the guest durable-suppression gate";
    const between = c.slice(gate, call);
    if (/\n\t\}\n/.test(between)) return "guest durable gate block closes before durableDelivery( call";
    return null;
  },
] };
