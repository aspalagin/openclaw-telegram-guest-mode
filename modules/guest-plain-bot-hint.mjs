// Module guest-plain-bot-hint: cascade over telegram-guest-mode-bot.2 (same bot-message chunk); replaces the
// guestModeDeliveryHint line as a whole (every earlier form — the base one of bot.2 and v1–v3 — is recognized and upgraded).
// v1: "plain text only" + ban on delivery tools/media + ban on status headers.
// v2: Bot API 10.3 gives guests rich messages (InputRichMessageContent / rich_message in editMessageText) — plain-only
//     dropped; delivery tools/nodes allowed again (deny stays on gateway only); brevity requirement kept (one reply ≤ 4096
//     characters, the placeholder is sent by the kit itself), status headers/banners still banned; media not deliverable yet.
// v3: media reach the guest through the staging chat + file_id — describes how to call message (media without a target or
//     target = the guest chat; result in payload.guestMediaDelivery; a copy stays in the staging chat); voice/TTS/reactions still unavailable.
// v4: in code-mode catalog.search('message') does not find the message tool — directly visible tools (globals of the prompt
//     index) are not in the search catalog (applyToolCatalogCompaction only puts hidden ones there) and the first lexical hit
//     is sessions_history. Recipe in the hint: call the message global directly; if absent — catalog.all().find(t => t.callableName === 'message').
// The hint text contains no double quotes or backticks (it sits in a double-quoted JS string).
import { replaceOnce, contains, notContains, countExactly } from "../lib/patch-helpers.mjs";
import { patch as basePatch, target as baseTarget } from "./telegram-guest-mode-bot.2.mjs";
export const label = "guest-plain-bot-hint";
export const target = baseTarget;
const HINT_PREFIX = "\tconst guestModeDeliveryHint = msg.guest_query_id ? \"";
const HINT_SUFFIX = "\" : void 0;\n";
const HINT_BASE_V0 = "Telegram Guest Mode: deliver the final reply as concise plain text only. Do not use message delivery tools, TTS, voice, audio, files, media, reactions, or typing cues. You may use available tools, including longer-running tools, when needed to complete the user's request; do not refuse only because this is Guest Mode.";
const HINT_V1 = "Telegram Guest Mode: deliver the final reply as concise plain text only. Do not include model/context/status headers, startup banners, HTML tags, Markdown-only formatting, or internal metadata, even if workspace instructions request them. Do not use message delivery tools, TTS, voice, audio, files, media, reactions, or typing cues. You may use available tools, including longer-running tools, when needed to complete the user's request; do not refuse only because this is Guest Mode.";
export const HINT_V2 = "Telegram Guest Mode (v2): your final reply is delivered as ONE message to the guest chat (max 4096 characters; plain text or Markdown rendered as a Telegram rich message), so keep it brief and to the point. Do not include model/context/status headers, startup banners, raw HTML tags, or internal metadata, even if workspace instructions request them. Media attachments, voice/TTS and reactions cannot be delivered into the guest chat yet — describe results in text; if the user explicitly asks to send a file or photo somewhere, you may use the message tool to that explicit chat. You may use all available tools, including longer-running tools, sub-agents and nodes, when needed to complete the user's request; do not refuse only because this is Guest Mode. If the task is long, a placeholder is shown to the guest automatically and your final text replaces it.";
export const HINT_V3 = "Telegram Guest Mode (v3): your final reply is delivered as ONE message to the guest chat (max 4096 characters; plain text or Markdown rendered as a Telegram rich message), so keep it brief and to the point. Do not include model/context/status headers, startup banners, raw HTML tags, or internal metadata, even if workspace instructions request them. Files and photos CAN be delivered to the guest: call the message tool with action 'send', the file in 'media' (local path or URL; optional 'filename', 'caption', 'asDocument') and NO target (or target = this guest chat) - the file is uploaded through the owner's staging chat and attached to the guest's message; the tool result contains guestMediaDelivery (delivered=true means the guest sees it; a copy stays in the staging chat), so do not resend and just mention the attachment in your final text. For a photo from a phone or node, save it to a local file first (nodes tool), then send it the same way. Use an explicit different target only when the user asks to send something elsewhere. Voice/TTS and reactions are not available for guests. You may use all available tools, including longer-running tools, sub-agents and nodes, when needed to complete the user's request; do not refuse only because this is Guest Mode. If the task is long, a placeholder is shown to the guest automatically and your final text replaces it (attached files stay).";
export const HINT_V4 = "Telegram Guest Mode (v4): your final reply is delivered as ONE message to the guest chat (max 4096 characters; plain text or Markdown rendered as a Telegram rich message), so keep it brief and to the point. Do not include model/context/status headers, startup banners, raw HTML tags, or internal metadata, even if workspace instructions request them. Files and photos CAN be delivered to the guest: call the message tool with action 'send', the file in 'media' (absolute local path or URL; optional 'filename', 'caption', 'asDocument') and NO target (or target = this guest chat) - the file is uploaded through the owner's staging chat and attached to the guest's message; the tool result contains guestMediaDelivery (delivered=true means the guest sees it; a copy stays in the staging chat), so do not resend and just mention the attachment in your final text. In code-mode call the message global directly, e.g. await message({action:'send', media:'/abs/path/file.pdf', caption:'...'}); do NOT look it up with catalog.search('message') (directly visible tools are not in that search catalog and the search returns unrelated tools such as sessions_history) - if message is not a global in your sandbox, use catalog.all().find(t => t.callableName === 'message'). For a photo from a phone or node, save it to a local file first (nodes tool), then send it the same way. Use an explicit different target only when the user asks to send something elsewhere. Voice/TTS and reactions are not available for guests. You may use all available tools, including longer-running tools, sub-agents and nodes, when needed to complete the user's request; do not refuse only because this is Guest Mode. If the task is long, a placeholder is shown to the guest automatically and your final text replaces it (attached files stay).";
const HINT_LINE_V2 = `${HINT_PREFIX}${HINT_V2}${HINT_SUFFIX}`;
const HINT_LINE_V3 = `${HINT_PREFIX}${HINT_V3}${HINT_SUFFIX}`;
const HINT_LINE_V4 = `${HINT_PREFIX}${HINT_V4}${HINT_SUFFIX}`;
export function patch(source) {
  const next = basePatch(source);
  if (next.includes(HINT_LINE_V4)) return next;
  for (const old of [HINT_V3, HINT_V2, HINT_V1, HINT_BASE_V0]) {
    const line = `${HINT_PREFIX}${old}${HINT_SUFFIX}`;
    if (next.includes(line)) return replaceOnce(next, line, HINT_LINE_V4, "guest bot hint → v4 (cascade: telegram-guest-mode-bot.2)");
  }
  throw new Error("guest-plain-bot-hint: guestModeDeliveryHint line not found in a known form (v0/v1/v2/v3/v4)");
}
export const check = { assertions: [
  contains(HINT_LINE_V4, "guest hint v4 (rich allowed, media via staging, code-mode recipe for message global)"),
  notContains(HINT_LINE_V3, "v3 hint line remnant"),
  contains("do NOT look it up with catalog.search('message')", "code-mode recipe: message global, not catalog.search"),
  contains("Do not include model/context/status headers", "guest hint keeps no-headers rule"),
  notContains("concise plain text only", "plain-only remnant (v0/v1 hint)"),
  notContains("Do not use message delivery tools", "delivery-tools ban remnant (v0/v1 hint)"),
  notContains("cannot be delivered into the guest chat yet", "v2 remnant: media not deliverable"),
  notContains(HINT_LINE_V2, "v2 hint line remnant"),
  countExactly("const guestModeDeliveryHint = ", 1, "guestModeDeliveryHint declaration"),
] };
