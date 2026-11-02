// Portable OpenClaw 2026.10.9: guest-ack-edit-bot.
import { replaceOnce, contains, notContains } from "../lib/patch-helpers.mjs";
const MARK = "hotfix: guest-ack-edit";
export const label = "guest-ack-edit-bot";
export const verdict = "port";
export const target = { key: "bot", label: "Telegram bot-message bundle (message context + dispatch)", needles: ["async function runTelegramDispatchTurn(turn) {", "async function handleToolStart(turn, payload) {", "function createDeliveryBaseOptions(turn) {"] };
const ARM_OLD = "\tconst endDeliveryCorrelation = beginDeliveryCorrelation();\n\tconst queueDraftProgress = (task) => enqueueDraftEvent(turn, task).then(() => false);\n\ttry {\n";
// v1 arm (04.10 утро, 9.7) — без параметров рендера; в 10.5 только как сторож «остатка v1» в assertions.
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
// v2 arm (реестр v3, rich append): richMessages/tableMode аккаунта из turn (те же поля читает createDeliveryBaseOptions/renderStreamText),
// чтобы поздний append (announce субагента, у которого нет params доставки Telegram) собирал rich-документ с настройками аккаунта.
const ARM_PREVIOUS = `\tconst endDeliveryCorrelation = beginDeliveryCorrelation();
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
\tconst queueDraftProgress = (task) => enqueueDraftEvent(turn, task).then(() => false);
\ttry {
`;
const ARM_NEW = ARM_PREVIOUS.replace("\t\ttableMode: turn.tableMode,", "\t\ttableMode: turn.tableMode,\n\t\tmediaLocalRoots: turn.mediaLocalRoots,");
const SETTLE_OLD = "\t} finally {\n\t\tendDeliveryCorrelation();\n\t}\n";
const SETTLE_PREVIOUS = `\t} finally {
\t\tendDeliveryCorrelation();
\t\tif (guestAckHandle) await guestAckHandle.settle({ failed: turn.agentRunFailed === true }).catch((err) => logVerbose(\`[hotfix][guest-ack] settle failed: \${String(err)}\`)); // ${MARK}
\t}
`;
const SETTLE_NEW = SETTLE_PREVIOUS.replace("settle({ failed:", "settle({ admissionOnly: true, denied: turn.sendPolicyDenied === true, failed:");
const TOOL_OLD = "async function handleToolStart(turn, payload) {\n\tconst toolName = payload.name?.trim();\n";
const TOOL_NEW = `async function handleToolStart(turn, payload) {
\tconst toolName = payload.name?.trim();
\tif (toolName && typeof turn.context?.ctxPayload?.GuestQueryId === "string") globalThis.__openclawHotfixGuestAck?.resolve?.(turn.context.ctxPayload.GuestQueryId)?.handle?.noteTool(toolName); // ${MARK} (best-effort)
`;
const count = (s, n) => s.split(n).length - 1;
export function patch(source) {
  if (source.includes(ARM_NEW) && source.includes(SETTLE_NEW) && source.includes(TOOL_NEW)) return source;
  let next = source;
  if (next.includes(ARM_PREVIOUS)) next = replaceOnce(next, ARM_PREVIOUS, ARM_NEW, "ownership arm upgrade");
  if (next.includes(SETTLE_PREVIOUS)) next = replaceOnce(next, SETTLE_PREVIOUS, SETTLE_NEW, "admission settle upgrade");
  if (!next.includes(ARM_NEW)) next = replaceOnce(next, ARM_OLD, ARM_NEW, "guest-ack arm after beginDeliveryCorrelation (runTelegramDispatchTurn)");
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
export const check = { gate: "required", assertions: [
  contains(MARK, "маркер guest-ack-edit (bot)"),
  contains(ARM_NEW, "arm плейсхолдера в runTelegramDispatchTurn"),
  contains(SETTLE_NEW, "settle в finally runTelegramDispatchTurn"),
  contains(TOOL_NEW, "noteTool в handleToolStart"),
  notContains(ARM_OLD, "непропатченный вход runTelegramDispatchTurn"),
  notContains(ARM_V1, "arm v1 без richMessages/tableMode не остался"),
  // turn.richMessages/turn.tableMode — поля turnConfig, которыми пользуется и сам чанк
  contains("\t\ttableMode: turn.tableMode,\n\t\tchunkMode: turn.chunkMode,\n\t\trichMessages: turn.richMessages,", "turn.tableMode/turn.richMessages в createDeliveryBaseOptions"),
  // данные, которые arm читает из turn, должны по-прежнему существовать там же, где их берёт createDeliveryBaseOptions
  contains("\t\ttoken: turn.opts.token,\n\t\truntime: turn.runtime,\n\t\tbot: turn.bot,", "turn.opts.token/runtime/bot в createDeliveryBaseOptions"),
  contains("GuestQueryId: typeof msg.guest_query_id === \"string\" ? msg.guest_query_id : void 0,", "GuestQueryId в ctxPayload (telegram-guest-mode-bot.2)"),
  contains("turn.agentRunFailed = readAgentRunTerminalOutcome(turnResult.dispatchResult) === \"failed\";", "turn.agentRunFailed выставляется диспетчем"),
  contains("import { a as shouldLogVerbose, r as logVerbose, t as danger } from \"./globals-", "logVerbose в чанке"),
  armInsideDispatchTurn,
  (c) => count(c, "endDeliveryCorrelation();") === 1 && count(c, "guestAckHandle.settle(") === 1 ? null : "finally runTelegramDispatchTurn встречается не один раз (новый выход диспетча без settle?)",
] };
