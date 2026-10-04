// Метка guest-context-isolation: rewrite в bot-message. Старый якорь (sessionPromptMessages/buildTelegramSessionTranscriptPromptMessages) удалён:
// транскрипт-контекст теперь запрашивается через ctxPayload.sessionTranscript → SessionTranscriptContext (run-channel-turn :302) → mergeSessionTranscriptContext (lifecycle :248).
// Для guest-сообщений sessionTranscript = void 0 → транскрипт чужих/приватных сессий в промпт не подмешивается.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label = "guest-context-isolation";
export const verdict = "rewrite";
export const target = { key: "bot", label: "Telegram bot-message bundle (message context + dispatch)", needles: ["async function buildTelegramInboundContextPayload(params) {", "const sendRecordVoice = async () => {", "function createDraftState(params) {"] };
export function patch(source) {
  if (source.includes("hotfix: guest-context-isolation")) return source;
  return replaceOnce(
    source,
    "\t\tsessionTranscript: {\n\t\t\tchatWindow: true,\n\t\t\thistoryLimit: isGroup ? historyLimit : dmHistoryLimit,",
    "\t\t// hotfix: guest-context-isolation (2026-07-26): guest-сообщения не получают транскрипт-контекст сессии\n\t\tsessionTranscript: typeof msg.guest_query_id === \"string\" && msg.guest_query_id.trim().length > 0 ? void 0 : {\n\t\t\tchatWindow: true,\n\t\t\thistoryLimit: isGroup ? historyLimit : dmHistoryLimit,",
    "guest context isolation (sessionTranscript in buildTelegramInboundContextPayload)",
  );
}
export const check = { gate: "required", assertions: [ contains("hotfix: guest-context-isolation", "context isolation marker"), contains('sessionTranscript: typeof msg.guest_query_id === "string" && msg.guest_query_id.trim().length > 0 ? void 0 : {', "guest excluded from session transcript") ] };
