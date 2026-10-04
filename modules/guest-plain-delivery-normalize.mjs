// Метка guest-plain-delivery-normalize: каскад поверх telegram-guest-mode-delivery. HTML→plain — локальный helper (импорт telegramHtmlToPlainTextFallback из text-chunk-limit-* завязан на хэш-имя и минифицированную букву экспорта).
// 2026-09-30 (2026.9.7): без изменений — PATCH-FAIL был каскадом от базы telegram-guest-mode-delivery (переякорена); guest-ветка deliverTextReply байт-в-байт как на проде 9.6.
import { replaceOnce, insertBefore, contains } from "../lib/patch-helpers.mjs";
import { patch as basePatch, target as baseTarget } from "./telegram-guest-mode-delivery.mjs";
export const label = "guest-plain-delivery-normalize";
export const verdict = "rewrite";
export const target = baseTarget;
export function patch(source) {
  let next = basePatch(source);
  if (next.includes("normalizeTelegramGuestPlainText")) return next;
  next = insertBefore(
    next,
    "function buildTelegramGuestTextResult(text, opts) {",
    `const TELEGRAM_GUEST_MODEL_HEADER_RE = /^\\s*Модель:\\s*[^\\n]*(?:\\n+|$)/i;
const TELEGRAM_GUEST_HTML_TAG_RE = /<\\/?[a-zA-Z][a-zA-Z0-9-]*(?:\\s[^<>]*)?>/;
function telegramGuestHtmlToPlainText(html) {
\treturn html.replace(/<br\\s*\\/?>/gi, "\\n").replace(/<\\/(?:p|div|li|tr|h[1-6]|blockquote|pre|details|summary)>/gi, "\\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\\n{3,}/g, "\\n\\n");
}
function normalizeTelegramGuestPlainText(text) {
\tconst source = TELEGRAM_GUEST_HTML_TAG_RE.test(text) ? telegramGuestHtmlToPlainText(text) : text;
\treturn source.replace(TELEGRAM_GUEST_MODEL_HEADER_RE, "").trimStart();
}
`,
    "guest-plain normalize fn",
  );
  next = replaceOnce(
    next,
    "\t\tconst guestChunks = filterEmptyTelegramTextChunks(params.chunkText(params.text));",
    "\t\tconst guestReplyText = normalizeTelegramGuestPlainText(params.text);\n\t\tconst guestChunks = filterEmptyTelegramTextChunks(params.chunkText(guestReplyText));",
    "guest-plain chunks",
  );
  next = replaceOnce(
    next,
    "\t\tconst useHtml = Boolean(firstChunk?.htmlText?.trim()) && !firstChunk?.richMessage?.blocks?.length;\n\t\tconst fallbackText = (useHtml ? firstChunk?.htmlText : firstChunk?.plainText) ?? params.text;",
    "\t\tconst useHtml = false;\n\t\tconst fallbackText = normalizeTelegramGuestPlainText(firstChunk?.plainText ?? guestReplyText);",
    "guest-plain fallbackText",
  );
  next = replaceOnce(next, "\t\t\t\tparseMode: useHtml ? \"HTML\" : void 0,", "\t\t\t\tparseMode: void 0,", "guest-plain parseMode");
  return next;
}
export const check = { gate: "review", assertions: [ contains("function normalizeTelegramGuestPlainText(text)", "guest plain normalize helper"), contains("TELEGRAM_GUEST_MODEL_HEADER_RE", "guest model-header strip regex"), contains("parseMode: void 0,", "guest parseMode plain") ] };
