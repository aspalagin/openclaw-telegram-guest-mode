#!/usr/bin/env node
// OpenClaw Telegram Guest Mode — portable dist patch layer.
//
// Adds Telegram Bot API guest-query support (supports_guest_queries /
// guest_message / answerGuestQuery) to an installed OpenClaw package by
// patching built dist/*.js bundles in place. Tested baseline: OpenClaw
// 2026.7.1-2. Review README.md and HOTFIX_NOTES.md before running this on a
// production host.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const packageRoot = process.env.OPENCLAW_PACKAGE_ROOT || "/usr/lib/node_modules/openclaw";
const distDir = path.join(packageRoot, "dist");
const backupRoot = process.env.OPENCLAW_HOTFIX_BACKUP_DIR || "./backups";
const dryRun = process.argv.includes("--dry-run") || process.argv.includes("--check");
const expectedVersion = "2026.7.1-2";

function fail(message) {
  console.error(`[openclaw-guest-mode] ${message}`);
  process.exitCode = 1;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function walkJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function findOne(files, label, needles) {
  const matches = [];
  for (const file of files) {
    const content = read(file);
    if (needles.every((needle) => content.includes(needle))) matches.push(file);
  }
  if (matches.length === 0) throw new Error(`could not find ${label}`);
  if (matches.length > 1) throw new Error(`found multiple ${label}: ${matches.join(", ")}`);
  return matches[0];
}

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index === -1) throw new Error(`missing ${label}`);
  if (source.indexOf(before, index + before.length) !== -1) throw new Error(`ambiguous ${label}`);
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
}

function insertBefore(source, before, insert, label) {
  if (source.includes(insert.trim())) return source;
  const index = source.indexOf(before);
  if (index === -1) throw new Error(`missing insertion point for ${label}`);
  return `${source.slice(0, index)}${insert}${source.slice(index)}`;
}

function backupFile(file, before) {
  const rel = path.relative(packageRoot, file);
  const backupPath = path.join(backupRoot, timestamp(), `${rel}.${sha256(before).slice(0, 12)}.bak`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(backupPath, before, { mode: 0o600 });
  return backupPath;
}

// Dry-run keeps transformations cumulative in memory so that the cascade
// patches (guest-plain-bot-hint, guest-plain-delivery-normalize) see the
// output of the patches they depend on without writing package files.
const pendingContents = new Map();

function applyFile(file, label, patch) {
  const before = pendingContents.get(file) ?? read(file);
  const after = patch(before);
  if (after === before) {
    console.log(`[openclaw-guest-mode] ${label}: ok`);
    return { label, file, changed: false };
  }
  if (dryRun) {
    pendingContents.set(file, after);
    console.log(`[openclaw-guest-mode] ${label}: would patch ${file}`);
    return { label, file, changed: true };
  }
  const backupPath = backupFile(file, before);
  fs.writeFileSync(file, after, "utf8");
  console.log(`[openclaw-guest-mode] ${label}: patched ${file}; backup=${backupPath}`);
  return { label, file, changed: true, backupPath };
}

function patchAllowedUpdates(source) {
  if (source.includes('updates.includes("guest_message")')) return source;
  return replaceOnce(
    source,
    '\tif (!updates.includes("message_reaction")) updates.push("message_reaction");',
    '\tif (!updates.includes("guest_message")) updates.push("guest_message");\n\tif (!updates.includes("message_reaction")) updates.push("message_reaction");',
    "guest_message allowed update",
  );
}

function patchBot(source) {
  if (source.includes("normalizeTelegramGuestSessionScope")) return source;
  const replaceOnce = (src, before, after, label) => {
    const index = src.indexOf(before);
    if (index === -1) throw new Error(`missing ${label}`);
    if (src.indexOf(before, index + before.length) !== -1) throw new Error(`ambiguous ${label}`);
    return `${src.slice(0, index)}${after}${src.slice(index + before.length)}`;
  };
  const insertBefore = (src, before, insert, label) => {
    if (src.includes(insert.trim())) return src;
    const index = src.indexOf(before);
    if (index === -1) throw new Error(`missing insertion point for ${label}`);
    return `${src.slice(0, index)}${insert}${src.slice(index)}`;
  };
  const insertAfter = (src, after, insert, label) => {
    if (src.includes(insert.trim())) return src;
    const index = src.indexOf(after);
    if (index === -1) throw new Error(`missing insertion point for ${label}`);
    return `${src.slice(0, index + after.length)}${insert}${src.slice(index + after.length)}`;
  };
  let next = source;
  next = insertAfter(
    next,
    'function createTelegramIngressSubject(senderId) {\n\treturn { stableId: senderId };\n}\n',
    `function normalizeTelegramGuestSessionScope(value) {
\tconst normalized = normalizeLowercaseStringOrEmpty(value);
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
`,
    "Telegram guest session helpers",
  );
  next = insertBefore(
    next,
    '\tbot.on("edited_message", async (ctx) => {',
    `\tbot.on("guest_message", async (ctx) => {
\t\tconst msg = ctx.guestMessage ?? ctx.update?.guest_message;
\t\tif (!msg) return;
\t\tconst guestQueryId = typeof msg.guest_query_id === "string" && msg.guest_query_id.trim() ? msg.guest_query_id.trim() : void 0;
\t\tif (!guestQueryId) {
\t\t\tlogVerbose("telegram guest_message skipped: missing guest_query_id");
\t\t\treturn;
\t\t}
\t\tconst guestFrom = msg.from ?? msg.guest_bot_caller_user;
\t\tconst normalizedMsg = withResolvedTelegramForumFlag({
\t\t\t...msg,
\t\t\t...(guestFrom ? { from: guestFrom } : {})
\t\t}, false);
\t\tif (normalizedMsg.from?.id != null && normalizedMsg.from.id === ctx.me?.id) return;
\t\tawait handleInboundMessageLike({
\t\t\tctxForDedupe: ctx,
\t\t\tctx: buildSyntheticContext(ctx, normalizedMsg),
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
\t});
`,
    "Telegram guest_message handler",
  );
  if (!next.includes("const isGuest = Boolean(guestQueryId);")) {
    next = replaceOnce(
      next,
      `\tconst msg = primaryCtx.message;
\tconst chatId = msg.chat.id;
\tconst isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
\tconst senderId = msg.from?.id ? String(msg.from.id) : "";
\tconst messageThreadId = msg.message_thread_id;
\tconst reactionApi = typeof bot.api.setMessageReaction === "function" ? bot.api.setMessageReaction.bind(bot.api) : null;`,
      `\tconst msg = primaryCtx.message;
\tconst chatId = msg.chat.id;
\tconst guestQueryId = typeof msg.guest_query_id === "string" && msg.guest_query_id.trim() ? msg.guest_query_id.trim() : void 0;
\tconst isGuest = Boolean(guestQueryId);
\tconst isGroup = !isGuest && (msg.chat.type === "group" || msg.chat.type === "supergroup");
\tconst senderId = msg.from?.id ? String(msg.from.id) : msg.guest_bot_caller_user?.id != null ? String(msg.guest_bot_caller_user.id) : "";
\tconst messageThreadId = msg.message_thread_id;
\tconst reactionApi = !isGuest && typeof bot.api.setMessageReaction === "function" ? bot.api.setMessageReaction.bind(bot.api) : null;`,
      "Telegram guest message-context header",
    );
  }
  next = next.replaceAll(
    `\tconst senderUsername = msg.from?.username ?? "";`,
    `\tconst senderUsername = msg.from?.username ?? msg.guest_bot_caller_user?.username ?? "";`,
  );
  if (!next.includes(`\tconst sendTyping = async () => {
\t\tif (isGuest) return;`)) {
    next = replaceOnce(
      next,
      `\tconst sendTyping = async () => {
\t\tawait withTelegramApiErrorLogging({`,
      `\tconst sendTyping = async () => {
\t\tif (isGuest) return;
\t\tawait withTelegramApiErrorLogging({`,
      "Telegram guest typing suppression",
    );
  }
  if (!next.includes(`\tconst sendRecordVoice = async () => {
\t\tif (isGuest) return;`)) {
    next = replaceOnce(
      next,
      `\tconst sendRecordVoice = async () => {
\t\ttry {`,
      `\tconst sendRecordVoice = async () => {
\t\tif (isGuest) return;
\t\ttry {`,
      "Telegram guest voice cue suppression",
    );
  }
  if (!next.includes("resolveTelegramGuestSessionKey(threadedSessionKey, msg)")) {
    next = replaceOnce(
      next,
      `\tconst sessionKey = (shouldUseTelegramDmThreadSession({
\t\tdmThreadId,
\t\tbotHasTopicsEnabled: resolveTelegramBotHasTopicsEnabled(primaryCtx.me)
\t}) && dmThreadId != null ? resolveThreadSessionKeys({
\t\tbaseSessionKey,
\t\tthreadId: \`\${chatId}:\${dmThreadId}\`
\t}) : null)?.sessionKey ?? baseSessionKey;`,
      `\tconst threadedSessionKey = (shouldUseTelegramDmThreadSession({
\t\tdmThreadId,
\t\tbotHasTopicsEnabled: resolveTelegramBotHasTopicsEnabled(primaryCtx.me)
\t}) && dmThreadId != null ? resolveThreadSessionKeys({
\t\tbaseSessionKey,
\t\tthreadId: \`\${chatId}:\${dmThreadId}\`
\t}) : null)?.sessionKey ?? baseSessionKey;
\tconst sessionKey = isGuest ? resolveTelegramGuestSessionKey(threadedSessionKey, msg) : threadedSessionKey;`,
      "Telegram guest session key",
    );
  }
  if (!next.includes("GuestDeliveryHint")) {
    // 2026.7.1-2: inboundEventKind is classified with an inline conversation-kind
    // argument and reaches buildTelegramInboundContextPayload via params (both `msg`
    // and `inboundEventKind` are destructured there and in scope at the ctxPayload
    // call). Existence assertion replaces the old identity replaceOnce on the
    // `conversationKind` adjacency, which no longer exists.
    if (!next.includes('const inboundEventKind = classifyChannelInboundEvent({\n\t\tconversation: { kind: isGroup ? "group" : "direct" },')) {
      throw new Error("missing Telegram inbound event anchor");
    }
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
\t\t\tbodyForAgent: bodyText,`,
      `\t\tmessage: {
\t\t\tinboundEventKind: effectiveInboundEventKind,
\t\t\tbody,
\t\t\trawBody,
\t\t\tbodyForAgent: guestModeDeliveryHint ? \`\${bodyText}\\n\\n\${guestModeDeliveryHint}\` : bodyText,`,
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
  }
  if (!next.includes("const isGuestQuery = Boolean(guestQueryId);")) {
    next = replaceOnce(
      next,
      `\tconst streamDeliveryEnabled = !isRoomEvent && streamMode !== "off";`,
      `\tconst guestQueryId = typeof ctxPayload.GuestQueryId === "string" && ctxPayload.GuestQueryId.trim() ? ctxPayload.GuestQueryId.trim() : void 0;
\tconst isGuestQuery = Boolean(guestQueryId);
\tconst streamDeliveryEnabled = !isRoomEvent && !isGuestQuery && streamMode !== "off";`,
      "Telegram guest stream suppression",
    );
  }
  if (!next.includes(`\t\tguestQueryId,
\t\treplyQuoteMessageId,`)) {
    next = replaceOnce(
      next,
      `\t\tlinkPreview: telegramCfg.linkPreview,
\t\treplyQuoteMessageId,`,
      `\t\tlinkPreview: telegramCfg.linkPreview,
\t\tguestQueryId,
\t\treplyQuoteMessageId,`,
      "Telegram guest delivery option",
    );
  }
  if (!next.includes("options?.durable && durableDelivery && !guestQueryId")) {
    next = replaceOnce(
      next,
      `\t\t\tif (options?.durable && durableDelivery) {`,
      `\t\t\tif (options?.durable && durableDelivery && !guestQueryId) {`,
      "Telegram guest durable suppression",
    );
  }
  return next;
}

function patchDelivery(source) {
  let next = source;
  if (!next.includes("TELEGRAM_GUEST_TEXT_LIMIT")) {
    next = insertBefore(
      next,
      "//#endregion\n//#region extensions/telegram/src/bot/reply-threading.ts",
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
\tif (typeof bot.api.answerGuestQuery === "function") return await sendTelegramWithThreadFallback({
\t\toperation: "answerGuestQuery",
\t\truntime,
\t\trequestParams: {},
\t\tsend: () => bot.api.answerGuestQuery(guestQueryId, result)
\t});
\tif (typeof bot.api.raw?.answerGuestQuery === "function") return await sendTelegramWithThreadFallback({
\t\toperation: "answerGuestQuery",
\t\truntime,
\t\trequestParams: {},
\t\tsend: () => bot.api.raw.answerGuestQuery({
\t\t\tguest_query_id: guestQueryId,
\t\t\tresult
\t\t})
\t});
\tif (opts?.token) return await sendTelegramWithThreadFallback({
\t\toperation: "answerGuestQuery (official api fallback)",
\t\truntime,
\t\trequestParams: {},
\t\tsend: () => answerTelegramGuestQueryViaOfficialApi(guestQueryId, result, opts.token)
\t});
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
\truntime.log?.(\`telegram answerGuestQuery ok inline_message_id=\${inlineMessageId ?? "unknown"}\`);
\treturn inlineMessageId ?? "guest";
}
`,
      "Telegram guest delivery helpers",
    );
  }
  if (!next.includes("params.progress.guestAnswered")) {
    next = replaceOnce(
      next,
      `async function deliverTextReply(params) {
\tlet firstDeliveredMessageId;
\tawait sendChunkedTelegramReplyText({`,
      `async function deliverTextReply(params) {
\tlet firstDeliveredMessageId;
\tif (params.guestQueryId) {
\t\tif (params.progress.guestAnswered) return;
\t\tconst chunks = filterEmptyTelegramTextChunks(params.chunkText(params.replyText));
\t\tconst firstChunk = chunks[0];
\t\tconst fallbackText = firstChunk?.text ?? params.replyText;
\t\tconst text = chunks.length > 1 ? \`\${fallbackText.trimEnd()}\\n\\n[Ответ обрезан из-за лимита Telegram guest mode.]\` : fallbackText;
\t\ttry {
\t\t\tfirstDeliveredMessageId = await sendTelegramGuestText(params.bot, params.guestQueryId, text, params.runtime, {
\t\t\t\tparseMode: firstChunk?.richMessage ? void 0 : firstChunk?.html ? "HTML" : void 0,
\t\t\t\tlinkPreview: params.linkPreview,
\t\t\t\treplyMarkup: params.replyMarkup,
\t\t\t\ttoken: params.token
\t\t\t});
\t\t} catch (err) {
\t\t\tif (!isTelegramGuestQueryExpiredError(err)) throw err;
\t\t\tparams.runtime.log?.(\`telegram guest query expired; falling back to sendMessage: \${formatErrorMessage(err)}\`);
\t\t}
\t\tif (firstDeliveredMessageId != null) {
\t\t\tparams.progress.guestAnswered = true;
\t\t\tparams.progress.hasDelivered = true;
\t\t\tparams.progress.deliveredCount += 1;
\t\t\treturn firstDeliveredMessageId;
\t\t}
\t}
\tawait sendChunkedTelegramReplyText({`,
      "Telegram guest deliverTextReply",
    );
  }
  if (!next.includes("mediaList.length === 0 || params.guestQueryId")) {
    next = replaceOnce(
      next,
      `\t\t\tif (mediaList.length === 0 && resolvedReplyText) firstDeliveredMessageId = await deliverTextReply({
\t\t\t\tbot: params.bot,`,
      `\t\t\tif (mediaList.length === 0 || params.guestQueryId) firstDeliveredMessageId = await deliverTextReply({
\t\t\t\tbot: params.bot,`,
      "Telegram guest media text fallback",
    );
    next = replaceOnce(
      next,
      `\t\t\t\treplyText: reply.text || "",
\t\t\t\treplyMarkup,`,
      `\t\t\t\treplyText: params.guestQueryId && !reply.text ? "[Медиа-вложение недоступно в Telegram guest mode.]" : reply.text || "",
\t\t\t\treplyMarkup,`,
      "Telegram guest media unavailable text",
    );
    next = next.replaceAll(
      `\t\t\t\tlinkPreview: params.linkPreview,
\t\t\t\tsilent: params.silent,`,
      `\t\t\t\tlinkPreview: params.linkPreview,
\t\t\t\ttoken: params.token,
\t\t\t\tsilent: params.silent,`,
    );
    next = next.replaceAll(
      `\t\t\t\treplyToMode: params.replyToMode,
\t\t\t\tprogress`,
      `\t\t\t\treplyToMode: params.replyToMode,
\t\t\t\tguestQueryId: params.guestQueryId,
\t\t\t\tprogress`,
    );
  }
  return next;
}

// Cascade dependency: rewrites the guest delivery-hint text inserted by
// patchBot (telegram-guest-mode-bot). Normalizes guest answers toward plain
// text: no model/context/status headers, no HTML/Markdown-only formatting.
function patchGuestPlainBotHint(source) {
  if (source.includes("Do not include model/context/status headers")) return source;
  const before = `concise plain text only. Do not use message delivery tools`;
  const after = `concise plain text only. Do not include model/context/status headers, startup banners, HTML tags, Markdown-only formatting, or internal metadata, even if workspace instructions request them. Do not use message delivery tools`;
  const index = source.indexOf(before);
  if (index === -1) {
    throw new Error(
      "missing guest-plain bot hint (cascade: depends on telegram-guest-mode-bot which inserts the guestModeDeliveryHint text; apply/fix that patch first)",
    );
  }
  if (source.indexOf(before, index + before.length) !== -1) {
    throw new Error("ambiguous guest-plain bot hint");
  }
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
}

// Cascade dependency: extends the guest branch inserted by patchDelivery
// (telegram-guest-mode-delivery). Strips a leading model header, converts
// accidental HTML to plain text, and forces parse_mode off for guest answers.
function patchGuestPlainDelivery(source) {
  if (source.includes("normalizeTelegramGuestPlainText")) return source;
  const replaceOnce = (text, before, after, label) => {
    const index = text.indexOf(before);
    if (index === -1) throw new Error(`missing ${label}`);
    if (text.indexOf(before, index + before.length) !== -1) throw new Error(`ambiguous ${label}`);
    return `${text.slice(0, index)}${after}${text.slice(index + before.length)}`;
  };
  const insertBefore = (text, before, insert, label) => replaceOnce(text, before, `${insert}${before}`, label);
  if (!source.includes("function buildTelegramGuestTextResult(text, opts) {")) {
    throw new Error(
      "missing guest-plain delivery guest branch (cascade: depends on telegram-guest-mode-delivery/patchDelivery which inserts buildTelegramGuestTextResult and the guest branch in deliverTextReply; apply/fix that patch first)",
    );
  }
  let next = source;
  next = replaceOnce(
    next,
    `st as renderTelegramHtmlText, ut as wrapFileReferencesInHtml } from "./sent-message-cache-`,
    `st as renderTelegramHtmlText, lt as telegramHtmlToPlainTextFallback, ut as wrapFileReferencesInHtml } from "./sent-message-cache-`,
    "guest-plain import telegramHtmlToPlainTextFallback",
  );
  next = insertBefore(
    next,
    `function buildTelegramGuestTextResult(text, opts) {`,
    `const TELEGRAM_GUEST_MODEL_HEADER_RE = /^\\s*Модель:\\s*[^\\n]*(?:\\n+|$)/i;
const TELEGRAM_GUEST_HTML_TAG_RE = /<\\/?[a-zA-Z][a-zA-Z0-9-]*(?:\\s[^<>]*)?>/;
function normalizeTelegramGuestPlainText(text) {
\tconst source = TELEGRAM_GUEST_HTML_TAG_RE.test(text) ? telegramHtmlToPlainTextFallback(text) : text;
\treturn source.replace(TELEGRAM_GUEST_MODEL_HEADER_RE, "").trimStart();
}
`,
    "guest-plain normalize fn",
  );
  next = replaceOnce(
    next,
    `const chunks = filterEmptyTelegramTextChunks(params.chunkText(params.replyText));`,
    `const guestReplyText = normalizeTelegramGuestPlainText(params.replyText);
\t\tconst chunks = filterEmptyTelegramTextChunks(params.chunkText(guestReplyText));`,
    "guest-plain chunks",
  );
  next = replaceOnce(
    next,
    `const fallbackText = firstChunk?.text ?? params.replyText;`,
    `const fallbackText = normalizeTelegramGuestPlainText(firstChunk?.text ?? guestReplyText);`,
    "guest-plain fallbackText",
  );
  next = replaceOnce(
    next,
    `parseMode: firstChunk?.richMessage ? void 0 : firstChunk?.html ? "HTML" : void 0,`,
    `parseMode: void 0,`,
    "guest-plain parseMode",
  );
  return next;
}

function main() {
  if (!fs.existsSync(distDir)) throw new Error(`dist directory does not exist: ${distDir}`);
  const pkg = JSON.parse(read(path.join(packageRoot, "package.json")));
  if (pkg.version !== expectedVersion) {
    console.log(`[openclaw-guest-mode] warn: package version ${pkg.version ?? "unknown"} differs from tested baseline ${expectedVersion}; the signature guards refuse unmatched code, but do not treat a green run on another version as verified`);
  }
  const files = walkJs(distDir);
  const targets = {
    allowed: findOne(files, "Telegram allowed updates bundle", ["DEFAULT_TELEGRAM_UPDATE_TYPES", "message_reaction", "channel_post"]),
    bot: findOne(files, "Telegram bot bundle", ['bot.on("message"', "handleInboundMessageLike", "dispatchTelegramMessage"]),
    delivery: findOne(files, "Telegram delivery bundle", ["async function sendTelegramText", "async function deliverTextReply", "deliverMediaReply"]),
  };
  // Apply order is load-bearing: guest-plain-bot-hint rewrites the delivery
  // hint text inserted by telegram-guest-mode-bot, and
  // guest-plain-delivery-normalize extends the guest branch inserted by
  // telegram-guest-mode-delivery.
  const results = [
    applyFile(targets.allowed, "telegram-guest-allowed-update", patchAllowedUpdates),
    applyFile(targets.bot, "telegram-guest-mode-bot", patchBot),
    applyFile(targets.delivery, "telegram-guest-mode-delivery", patchDelivery),
    applyFile(targets.bot, "guest-plain-bot-hint", patchGuestPlainBotHint),
    applyFile(targets.delivery, "guest-plain-delivery-normalize", patchGuestPlainDelivery),
  ];
  const changed = results.filter((result) => result.changed).length;
  console.log(`[openclaw-guest-mode] complete changed=${changed} packageRoot=${packageRoot}`);
}

try {
  main();
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
