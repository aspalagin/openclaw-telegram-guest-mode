// Метка guest-inbound-log-sender: port в bot-message (якорь telegramInboundLog.info без изменений).
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label = "guest-inbound-log-sender";
export const verdict = "port";
export const target = { key: "bot", label: "Telegram bot-message bundle (message context + dispatch)", needles: ["async function buildTelegramInboundContextPayload(params) {", "const sendRecordVoice = async () => {", "function createDraftState(params) {"] };
export function patch(source) {
  if (source.includes("hotfix: guest-inbound-log-sender")) return source;
  return replaceOnce(
    source,
    "telegramInboundLog.info(formatTelegramInboundLogLine({\n\t\t\tfrom: context.ctxPayload.From,",
    "telegramInboundLog.info(formatTelegramInboundLogLine({\n\t\t\t// hotfix: guest-inbound-log-sender (2026-07-26)\n\t\t\tfrom: context.ctxPayload.GuestQueryId ? `${context.ctxPayload.From} (guest query by ${context.ctxPayload.SenderId ?? \"unknown\"})` : context.ctxPayload.From,",
    "guest inbound log sender",
  );
}
export const check = { gate: "required", assertions: [ contains("hotfix: guest-inbound-log-sender", "log sender marker"), contains("(guest query by ${context.ctxPayload.SenderId", "caller in log line") ] };
