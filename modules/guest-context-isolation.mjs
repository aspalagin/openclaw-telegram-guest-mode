// Module guest-context-isolation (bot-message bundle). Transcript context is requested through
// ctxPayload.sessionTranscript → SessionTranscriptContext → mergeSessionTranscriptContext; for guest messages
// sessionTranscript = undefined, so no transcript of other/private sessions is mixed into the guest prompt.
import { replaceOnce, contains, notContains } from "../lib/patch-helpers.mjs";
export const label = "guest-context-isolation";
export const target = { key: "bot", label: "Telegram bot-message bundle (message context + dispatch)", needles: ["async function buildTelegramInboundContextPayload(params) {", "const sendRecordVoice = async () => {", "function createDraftState(params) {"] };
const COMMENT_V120 = "\t\t// hotfix: guest-context-isolation (2026-07-26): guest-сообщения не получают транскрипт-контекст сессии\n";
const COMMENT = "\t\t// hotfix: guest-context-isolation (2026-07-26): guest messages get no session transcript context\n";
const GATE = "\t\tsessionTranscript: typeof msg.guest_query_id === \"string\" && msg.guest_query_id.trim().length > 0 ? void 0 : {\n\t\t\tchatWindow: true,\n\t\t\thistoryLimit: isGroup ? historyLimit : dmHistoryLimit,";
export function patch(source) {
  if (source.includes("hotfix: guest-context-isolation")) return source.includes(COMMENT_V120) ? replaceOnce(source, COMMENT_V120, COMMENT, "guest context isolation comment (kit v1.2.0 → v1.2.1)") : source;
  return replaceOnce(
    source,
    "\t\tsessionTranscript: {\n\t\t\tchatWindow: true,\n\t\t\thistoryLimit: isGroup ? historyLimit : dmHistoryLimit,",
    `${COMMENT}${GATE}`,
    "guest context isolation (sessionTranscript in buildTelegramInboundContextPayload)",
  );
}
export const check = { assertions: [ contains(COMMENT, "context isolation marker"), notContains(COMMENT_V120, "kit v1.2.0 comment remnant"), contains(GATE, "guest excluded from session transcript") ] };
