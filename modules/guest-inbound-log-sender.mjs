import { replaceOnce, contains, notContains } from "../lib/patch-helpers.mjs";
export const label = "guest-inbound-log-sender";
export const verdict = "port";
export const target = { key: "bot", label: "Telegram bot-message bundle (message context + dispatch)", needles: ["async function buildTelegramInboundContextPayload(params) {", "const sendRecordVoice = async () => {", "function createDraftState(params) {"] };
const OLD = "\t\ttelegramInboundLog.info(`Inbound message ${context.ctxPayload.From} -> ${logTo} (${context.ctxPayload.ChatType}${kindLabel}, ${context.ctxPayload.RawBody.length} chars)`);\n";
const NEW = "\t\ttelegramInboundLog.info(`Inbound message ${context.ctxPayload.GuestQueryId ? `${context.ctxPayload.From} (guest query by ${context.ctxPayload.SenderId ?? \"unknown\"})` : context.ctxPayload.From} -> ${logTo} (${context.ctxPayload.ChatType}${kindLabel}, ${context.ctxPayload.RawBody.length} chars)`); // hotfix: guest-inbound-log-sender (2026-07-26; 10.5 inline)\n";
export function patch(source) {
  if (source.includes(NEW)) return source;
  return replaceOnce(source, OLD, NEW, "guest inbound log sender (inline Inbound message line)");
}
export const check = { gate: "required", assertions: [
  contains(NEW, "log sender marker + guest caller in inline log line"),
  contains("(guest query by ${context.ctxPayload.SenderId", "caller in log line"),
  notContains(OLD, "unpatched inbound log line"),
  (c) => (c.split("telegramInboundLog.info(`Inbound message ").length - 1) === 1 ? null : "expected exactly one Inbound message log line",
] };
