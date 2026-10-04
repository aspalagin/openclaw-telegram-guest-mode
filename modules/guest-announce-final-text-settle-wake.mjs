// Новая метка guest-announce-final-text-settle-wake (2026-10-04, слой 2026.9.7, guest-модуль INCLUDE_GUEST=1;
// чанк subagent-announce.requester-settle-wake-DIR0-PAd.mjs). Пара к guest-announce-final-text-instruction для settle-wake пути
// (sourceTool subagent_settle, runId `announce:requester-settle:…` — именно через него финал уходил мимо гостя): текст побудки
// buildRequesterSettleWakeMessage получает строку «[Subagent Context] <HOTFIX_GUEST_ANNOUNCE_INSTRUCTION>» перед findings, если
// params.guestRequester; на месте вызова guestRequester = requesterSessionKey содержит ":guest:".
// v2 (2026-10-04): для parentOnly (private completion: гостевой ран вызвал sessions_spawn
// с completionTarget "parent") у гостя штатная строка SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION («Process this result privately … Your final reply
// stays internal … send it through a messaging tool … Reply ONLY: NO_REPLY») заменяется HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION
// (итог — финальным текстом, он уходит в inline-сообщение; message у гостя запрещён deny v3; финал приватного хода дописывает
// guest-announce-final-inline v2). Не-guest requester — текст побудки байт-в-байт как у апстрима.
import { replaceOnce, insertBefore, contains, notContains } from "../lib/patch-helpers.mjs";
import { HOTFIX_GUEST_ANNOUNCE_CONST_LINE, HOTFIX_GUEST_ANNOUNCE_INSTRUCTION, HOTFIX_GUEST_PRIVATE_COMPLETION_CONST_LINE, HOTFIX_GUEST_PRIVATE_COMPLETION_PREFIX } from "./guest-announce-instruction.shared.mjs";
const MARK = "hotfix: guest-announce-final-text";
export const label = "guest-announce-final-text-settle-wake";
export const verdict = "new";
export const target = { key: "subagentRequesterSettleWake", label: "subagent requester settle-wake (buildRequesterSettleWakeMessage)", needles: ["function buildRequesterSettleWakeMessage(params) {", "sourceTool: \"subagent_settle\","] };
const FN_ANCHOR = "function buildRequesterSettleWakeMessage(params) {\n";
const CONST_BLOCK_V1 = `//#region ${MARK} (2026-10-04): settle-wake в guest-сессии — итог финальным текстом, не messaging tool\n${HOTFIX_GUEST_ANNOUNCE_CONST_LINE}//#endregion\n`;
const CONST_BLOCK = `//#region ${MARK} (2026-10-04; v2 private completion): settle-wake в guest-сессии — итог финальным текстом, не messaging tool\n${HOTFIX_GUEST_ANNOUNCE_CONST_LINE}${HOTFIX_GUEST_PRIVATE_COMPLETION_CONST_LINE}//#endregion\n`;
const LINE_OLD = "\t\t...modelRouteChange ? [modelRouteChange, params.preserveModelRouteNotice ? \"[Subagent Context] Preserve this runtime-authored model-route change notice in your final answer.\" : \"[Subagent Context] Keep this runtime-authored model-route change notice internal on this shared surface.\"] : [],\n\t\t\"\",\n";
const GUEST_LINE = `\t\t...params.guestRequester ? [\`[Subagent Context] \${HOTFIX_GUEST_ANNOUNCE_INSTRUCTION}\`] : [], // ${MARK} (settle wake)\n`;
const LINE_NEW = LINE_OLD.replace("\t\t\"\",\n", `${GUEST_LINE}\t\t"",\n`);
const PRIVATE_OLD = "\t\tparams.parentOnly ? `[Subagent Context] ${SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION}` : params.requireVisibleReply ?";
const PRIVATE_NEW = "\t\tparams.parentOnly ? params.guestRequester ? `[Subagent Context] ${HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION}` /* " + MARK + " v2 (private completion у гостя) */ : `[Subagent Context] ${SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION}` : params.requireVisibleReply ?";
const CALL_OLD = "\tconst wakeMessage = buildRequesterSettleWakeMessage({\n\t\tfindings: preparedFindings.text,\n";
const CALL_NEW = `\tconst wakeMessage = buildRequesterSettleWakeMessage({\n\t\tguestRequester: typeof requesterSessionKey === "string" && requesterSessionKey.includes(":guest:"), // ${MARK}\n\t\tfindings: preparedFindings.text,\n`;
export function patch(source) {
  let next = source;
  if (next.includes(CONST_BLOCK_V1)) next = replaceOnce(next, CONST_BLOCK_V1, CONST_BLOCK, "guest announce instruction const block v1 → v2");
  if (!next.includes(CONST_BLOCK)) next = insertBefore(next, FN_ANCHOR, CONST_BLOCK, "guest announce instruction const before buildRequesterSettleWakeMessage");
  if (!next.includes(GUEST_LINE)) next = replaceOnce(next, LINE_OLD, LINE_NEW, "guest line in buildRequesterSettleWakeMessage (before findings)");
  if (!next.includes(PRIVATE_NEW)) next = replaceOnce(next, PRIVATE_OLD, PRIVATE_NEW, "parentOnly line in buildRequesterSettleWakeMessage (guest private completion)");
  if (!next.includes(CALL_NEW)) next = replaceOnce(next, CALL_OLD, CALL_NEW, "buildRequesterSettleWakeMessage call site (guestRequester)");
  return next;
}
const count = (s, n) => s.split(n).length - 1;
export const check = { gate: "required", assertions: [
  contains(MARK, "маркер guest-announce-final-text (settle wake)"),
  contains(CONST_BLOCK, "константы guest-инструкций (v2)"),
  notContains(CONST_BLOCK_V1, "остаток const-блока v1"),
  contains(GUEST_LINE, "guest-строка в тексте побудки"),
  contains(PRIVATE_NEW, "parentOnly-строка с guest-веткой (v2)"),
  notContains(PRIVATE_OLD, "непропатченная parentOnly-строка"),
  contains(CALL_NEW, "guestRequester на месте вызова (requesterSessionKey)"),
  contains(JSON.stringify(HOTFIX_GUEST_ANNOUNCE_INSTRUCTION), "текст guest-инструкции целиком"),
  contains(HOTFIX_GUEST_PRIVATE_COMPLETION_PREFIX, "текст guest-инструкции private completion"),
  notContains(LINE_OLD, "непропатченный хвост массива побудки"),
  (c) => count(c, "function buildRequesterSettleWakeMessage(params) {") === 1 && count(c, "buildRequesterSettleWakeMessage({") === 1 ? null : "функция/вызов buildRequesterSettleWakeMessage встречаются не по одному разу",
  (c) => count(c, "HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION") === 2 ? null : `HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION ожидается ровно 2 раза (объявление + использование), найдено ${count(c, "HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION")}`,
  // SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION — идентификатор чанка (используется константой v2)
  (c) => count(c, "SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION") >= 2 ? null : "SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION не импортирован/не используется в чанке",
  // guest-строка должна стоять внутри массива до findings и после parentOnly-строки (v2)
  (c) => { const fn = c.indexOf("function buildRequesterSettleWakeMessage(params) {"); const g = c.indexOf(GUEST_LINE, fn); const f = c.indexOf("params.findings ?? \"(each child result was announced individually", fn); const p = c.indexOf(PRIVATE_NEW, fn); return fn >= 0 && p >= 0 && g > p && f > g ? null : "guest-строка не между parentOnly-строкой и findings"; },
  // requesterSessionKey — тот же идентификатор, что уходит в deliverSubagentAnnouncement
  contains("\t\t\t\trequesterSessionKey,\n\t\t\t\trequesterAgentId,\n\t\t\t\trequesterRunTimeoutSeconds:", "requesterSessionKey в вызове deliverSubagentAnnouncement"),
] };
