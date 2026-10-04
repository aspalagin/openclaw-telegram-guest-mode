// Module guest-ack-edit-bot (part 2/2 of guest-ack-edit, Telegram bot-message bundle). Anchors are upstream lines of
// runTelegramDispatchTurn and handleToolStart (independent of the other guest modules).
// At the start of runTelegramDispatchTurn (right after beginDeliveryCorrelation) the placeholder registry is armed:
// globalThis.__openclawHotfixGuestAck.arm({...}) (the registry is inserted by part 1/2 into the delivery chunk, which
// bot-message imports statically, so it exists by then; optional chaining guards the case where part 1 is missing). For
// non-guest turns GuestQueryId is absent → arm returns undefined and nothing happens. In the single finally of
// runTelegramDispatchTurn — settle({failed}): clears the timers and, when a placeholder is up without a final, edits it
// with the service text. In handleToolStart — noteTool(name) (best-effort: for guests the callback usually does not
// arrive because of guest-suppress-inrun-progress; kept in case the progress policy changes).
import { replaceOnce, contains, notContains, count } from "../lib/patch-helpers.mjs";
const MARK = "hotfix: guest-ack-edit";
export const label = "guest-ack-edit-bot";
export const target = { key: "bot", label: "Telegram bot-message bundle (message context + dispatch)", needles: ["async function runTelegramDispatchTurn(turn) {", "async function handleToolStart(turn, payload) {", "function createDeliveryBaseOptions(turn) {"] };
const ARM_OLD = "\tconst endDeliveryCorrelation = beginDeliveryCorrelation();\n\ttry {\n";
// arm v1 — without render parameters; kept for the in-place upgrade.
const ARM_V1 = `\tconst endDeliveryCorrelation = beginDeliveryCorrelation();
\t//#region ${MARK} (2026-10-04): таймер плейсхолдера guest-query (реестр из чанка delivery)
\tconst guestAckHandle = typeof context.ctxPayload.GuestQueryId === "string" && context.ctxPayload.GuestQueryId ? globalThis.__openclawHotfixGuestAck?.arm?.({
\t\tbot: turn.bot,
\t\ttoken: turn.opts.token,
\t\truntime: turn.runtime,
\t\tguestQueryId: context.ctxPayload.GuestQueryId,
\t\tsessionKey: context.ctxPayload.SessionKey
\t}) : void 0;
\t//#endregion
\ttry {
`;
// arm v2 (kit v1.2.0) — richMessages/tableMode of the account from the turn (the same fields createDeliveryBaseOptions/renderStreamText read),
// so a late append (sub-agent announce, which has no Telegram delivery params) renders the rich document with the account settings.
const ARM_V2 = `\tconst endDeliveryCorrelation = beginDeliveryCorrelation();
\t//#region ${MARK} (2026-10-04): таймер плейсхолдера guest-query (реестр из чанка delivery)
\tconst guestAckHandle = typeof context.ctxPayload.GuestQueryId === "string" && context.ctxPayload.GuestQueryId ? globalThis.__openclawHotfixGuestAck?.arm?.({
\t\tbot: turn.bot,
\t\ttoken: turn.opts.token,
\t\truntime: turn.runtime,
\t\trichMessages: turn.richMessages, // v3: rich для append/replace в inline-сообщении
\t\ttableMode: turn.tableMode,
\t\tguestQueryId: context.ctxPayload.GuestQueryId,
\t\tsessionKey: context.ctxPayload.SessionKey
\t}) : void 0;
\t//#endregion
\ttry {
`;
// arm v3 (kit v1.2.1): same code as v2, English comments.
const ARM_NEW = `\tconst endDeliveryCorrelation = beginDeliveryCorrelation();
\t//#region ${MARK}: guest-query placeholder timer (registry lives in the delivery chunk)
\tconst guestAckHandle = typeof context.ctxPayload.GuestQueryId === "string" && context.ctxPayload.GuestQueryId ? globalThis.__openclawHotfixGuestAck?.arm?.({
\t\tbot: turn.bot,
\t\ttoken: turn.opts.token,
\t\truntime: turn.runtime,
\t\trichMessages: turn.richMessages, // rich for append/replace in the inline message
\t\ttableMode: turn.tableMode,
\t\tguestQueryId: context.ctxPayload.GuestQueryId,
\t\tsessionKey: context.ctxPayload.SessionKey
\t}) : void 0;
\t//#endregion
\ttry {
`;
const SETTLE_OLD = "\t} finally {\n\t\tendDeliveryCorrelation();\n\t}\n";
const SETTLE_NEW = `\t} finally {
\t\tendDeliveryCorrelation();
\t\tif (guestAckHandle) await guestAckHandle.settle({ failed: turn.agentRunFailed === true }).catch((err) => logVerbose(\`[hotfix][guest-ack] settle failed: \${String(err)}\`)); // ${MARK}
\t}
`;
const TOOL_OLD = "async function handleToolStart(turn, payload) {\n\tconst toolName = payload.name?.trim();\n";
const TOOL_NEW = `async function handleToolStart(turn, payload) {
\tconst toolName = payload.name?.trim();
\tif (toolName && typeof turn.context?.ctxPayload?.GuestQueryId === "string") globalThis.__openclawHotfixGuestAck?.resolve?.(turn.context.ctxPayload.GuestQueryId)?.handle?.noteTool(toolName); // ${MARK} (best-effort)
`;
export function patch(source) {
  if (source.includes(ARM_NEW) && source.includes(SETTLE_NEW) && source.includes(TOOL_NEW)) return source;
  let next = source;
  if (!next.includes(ARM_NEW)) {
    const old = [ARM_V2, ARM_V1].find((candidate) => next.includes(candidate));
    next = old
      ? replaceOnce(next, old, ARM_NEW, "guest-ack arm upgrade (earlier revision → v3)")
      : replaceOnce(next, ARM_OLD, ARM_NEW, "guest-ack arm after beginDeliveryCorrelation (runTelegramDispatchTurn)");
  }
  if (!next.includes(SETTLE_NEW)) next = replaceOnce(next, SETTLE_OLD, SETTLE_NEW, "guest-ack settle in runTelegramDispatchTurn finally");
  if (!next.includes(TOOL_NEW)) next = replaceOnce(next, TOOL_OLD, TOOL_NEW, "guest-ack noteTool in handleToolStart");
  return next;
}
const armInsideDispatchTurn = (src) => {
  const fn = src.indexOf("async function runTelegramDispatchTurn(turn) {");
  if (fn < 0) return "runTelegramDispatchTurn not found";
  const arm = src.indexOf("globalThis.__openclawHotfixGuestAck?.arm?.(", fn);
  const settle = src.indexOf("await guestAckHandle.settle(", fn);
  const nextFn = src.indexOf("\n//#region extensions/telegram/src/bot-message-dispatch.ts", fn);
  if (arm < 0 || settle < 0 || nextFn < 0 || !(fn < arm && arm < settle && settle < nextFn)) return "arm/settle are not both inside runTelegramDispatchTurn";
  return null;
};
export const check = { assertions: [
  contains(MARK, "guest-ack-edit marker (bot)"),
  contains(ARM_NEW, "placeholder arm in runTelegramDispatchTurn"),
  contains(SETTLE_NEW, "settle in the finally of runTelegramDispatchTurn"),
  contains(TOOL_NEW, "noteTool in handleToolStart"),
  notContains(ARM_OLD, "unpatched runTelegramDispatchTurn entry"),
  notContains(ARM_V1, "arm v1 (without richMessages/tableMode) remnant"),
  notContains(ARM_V2, "arm v2 (kit v1.2.0) remnant"),
  // turn.richMessages/turn.tableMode are turnConfig fields the chunk itself uses
  contains("\t\ttableMode: turn.tableMode,\n\t\tchunkMode: turn.chunkMode,\n\t\trichMessages: turn.richMessages,", "turn.tableMode/turn.richMessages in createDeliveryBaseOptions"),
  // the data arm reads from the turn must still exist where createDeliveryBaseOptions takes it
  contains("\t\ttoken: turn.opts.token,\n\t\truntime: turn.runtime,\n\t\tbot: turn.bot,", "turn.opts.token/runtime/bot in createDeliveryBaseOptions"),
  contains("GuestQueryId: typeof msg.guest_query_id === \"string\" ? msg.guest_query_id : void 0,", "GuestQueryId in ctxPayload (telegram-guest-mode-bot.2)"),
  contains("turn.agentRunFailed = readAgentRunTerminalOutcome(turnResult.dispatchResult) === \"failed\";", "turn.agentRunFailed set by the dispatch"),
  contains("import { a as shouldLogVerbose, r as logVerbose, t as danger } from \"./globals-", "logVerbose in the chunk"),
  armInsideDispatchTurn,
  (c) => count(c, "endDeliveryCorrelation();") === 1 && count(c, "guestAckHandle.settle(") === 1 ? null : "the finally of runTelegramDispatchTurn occurs more than once (new dispatch exit without settle?)",
] };
