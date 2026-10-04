// Метка guest-plain-bot-hint: каскад поверх telegram-guest-mode-bot.2 (тот же файл bot-message); заменяет guestModeDeliveryHint целиком.
// v1 (2026-07): «plain text only» + запрет delivery tools/медиа + запрет служебных шапок.
// v2 (2026-10-04, вместе с guest-ack-edit и guest-deny-delivery-tools v2): Bot API 10.3 даёт гостю rich (InputRichMessageContent /
// rich_message в editMessageText) — plain-only снят; запреты на delivery tools/nodes сняты (deny остался только у gateway); оставлено
// требование краткости (один ответ ≤ 4096 символов, плейсхолдер «Принял, работаю…» ставит хотфикс сам), запрет служебных шапок/баннеров
// и честное предупреждение: медиа-вложения в сам guest-чат пока не доставляются (только текст/rich), описывать их словами или слать
// инструментом message в явно названный чат. Запрета на личные данные нет. Апгрейд v1 → v2 на пропатченном чанке:
// замена старой строки hint целиком (обе формы v1 — базовая из bot.2 и расширенная v1 — распознаются).
import { replaceOnce, contains, notContains } from "../lib/patch-helpers.mjs";
import { patch as basePatch, target as baseTarget } from "./telegram-guest-mode-bot.2.mjs";
export const label = "guest-plain-bot-hint";
export const verdict = "port";
export const target = baseTarget;
const HINT_PREFIX = "\tconst guestModeDeliveryHint = msg.guest_query_id ? \"";
const HINT_SUFFIX = "\" : void 0;\n";
const HINT_BASE_V0 = "Telegram Guest Mode: deliver the final reply as concise plain text only. Do not use message delivery tools, TTS, voice, audio, files, media, reactions, or typing cues. You may use available tools, including longer-running tools, when needed to complete the user's request; do not refuse only because this is Guest Mode.";
const HINT_V1 = "Telegram Guest Mode: deliver the final reply as concise plain text only. Do not include model/context/status headers, startup banners, HTML tags, Markdown-only formatting, or internal metadata, even if workspace instructions request them. Do not use message delivery tools, TTS, voice, audio, files, media, reactions, or typing cues. You may use available tools, including longer-running tools, when needed to complete the user's request; do not refuse only because this is Guest Mode.";
export const HINT_V2 = "Telegram Guest Mode (v2): your final reply is delivered as ONE message to the guest chat (max 4096 characters; plain text or Markdown rendered as a Telegram rich message), so keep it brief and to the point. Do not include model/context/status headers, startup banners, raw HTML tags, or internal metadata, even if workspace instructions request them. Media attachments, voice/TTS and reactions cannot be delivered into the guest chat yet — describe results in text; if the user explicitly asks to send a file or photo somewhere, you may use the message tool to that explicit chat. You may use all available tools, including longer-running tools, sub-agents and nodes, when needed to complete the user's request; do not refuse only because this is Guest Mode. If the task is long, a placeholder is shown to the guest automatically and your final text replaces it.";
// v3 (2026-10-04, вместе с guest-media-staging-*): медиа гостю доставляются через staging-чат + file_id — описано, как вызывать message
// (media без target либо target = гостевой чат; результат payload.guestMediaDelivery; копия в staging-чате); voice/TTS/реакции по-прежнему нет.
// В тексте hint нет двойных кавычек и бэктиков (он лежит в JS-строке в двойных кавычках).
export const HINT_V3 = "Telegram Guest Mode (v3): your final reply is delivered as ONE message to the guest chat (max 4096 characters; plain text or Markdown rendered as a Telegram rich message), so keep it brief and to the point. Do not include model/context/status headers, startup banners, raw HTML tags, or internal metadata, even if workspace instructions request them. Files and photos CAN be delivered to the guest: call the message tool with action 'send', the file in 'media' (local path or URL; optional 'filename', 'caption', 'asDocument') and NO target (or target = this guest chat) - the file is uploaded through the owner's staging chat and attached to the guest's message; the tool result contains guestMediaDelivery (delivered=true means the guest sees it; a copy stays in the staging chat), so do not resend and just mention the attachment in your final text. For a photo from a phone or node, save it to a local file first (nodes tool), then send it the same way. Use an explicit different target only when the user asks to send something elsewhere. Voice/TTS and reactions are not available for guests. You may use all available tools, including longer-running tools, sub-agents and nodes, when needed to complete the user's request; do not refuse only because this is Guest Mode. If the task is long, a placeholder is shown to the guest automatically and your final text replaces it (attached files stay).";
// v4 (2026-10-04, корень D): в code-mode catalog.search('message') не находит инструмент message — напрямую видимые инструменты
// (глобалы prompt-индекса) в каталог поиска не попадают (applyToolCatalogCompaction кладёт туда только скрытые), и первым лексическим хитом
// оказывался sessions_history. Рецепт в hint: вызывать глобал message(...) напрямую; при его отсутствии — catalog.all().find(t => t.callableName === 'message').
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
export const check = { gate: "review", assertions: [
  contains(HINT_LINE_V4, "guest hint v4 (rich allowed, media via staging, code-mode recipe for message global)"),
  notContains(HINT_LINE_V3, "v3 hint line remnant"),
  contains("do NOT look it up with catalog.search('message')", "code-mode recipe: message global, not catalog.search"),
  contains("Do not include model/context/status headers", "guest hint keeps no-headers rule"),
  notContains("concise plain text only", "plain-only remnant (v0/v1 hint)"),
  notContains("Do not use message delivery tools", "delivery-tools ban remnant (v0/v1 hint)"),
  notContains("cannot be delivered into the guest chat yet", "v2 remnant: media not deliverable"),
  notContains(HINT_LINE_V2, "v2 hint line remnant"),
  (src) => (src.split("const guestModeDeliveryHint = ").length - 1) === 1 ? null : "guestModeDeliveryHint объявлен не один раз",
] };
