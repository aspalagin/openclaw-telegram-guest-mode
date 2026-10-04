// Новая метка guest-announce-final-text-instruction (2026-10-04, слой 2026.9.7, guest-модуль INCLUDE_GUEST=1; чанк subagent-announce-CsvruNe9.mjs).
// Дефект: completion-ход субагента в guest-сессии получает штатную инструкцию
// buildAnnounceReplyInstruction («…send a truthful user-facing update…») и ничего не знает, что requester — Telegram-гость, чей итог
// доставляется только правкой inline-сообщения (guest-ack-edit); guest-hint из bot-message в announce-ход не попадает (он формируется
// по входящему guest-сообщению в ctxPayload). Фикс: обёртка над buildAnnounceReplyInstruction — при params.guestRequester к штатной
// инструкции (любая ветка: subagent/expectsCompletionMessage/обычная) дописывается HOTFIX_GUEST_ANNOUNCE_INSTRUCTION: «ответь
// итоговым текстом, он будет доставлен в гостевое сообщение; message/messaging tools не использовать». На месте вызова
// guestRequester = targetRequesterSessionKey содержит ":guest:" (ключ сессии-получателя announce). Прямой announce (subagent_announce);
// settle-wake — отдельный модуль guest-announce-final-text-settle-wake. Запрет инструмента — guest-deny-delivery-tools v3.
// v2 (2026-10-04): при completionTarget "parent" (private completion) у гостя вместо
// штатной SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION («stays internal … messaging tool … NO_REPLY») — HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION
// + guest-инструкция; финал приватного хода гостя дописывает guest-announce-final-inline v2.
import { replaceOnce, contains, notContains } from "../lib/patch-helpers.mjs";
import { HOTFIX_GUEST_ANNOUNCE_CONST_LINE, HOTFIX_GUEST_ANNOUNCE_INSTRUCTION, HOTFIX_GUEST_PRIVATE_COMPLETION_CONST_LINE, HOTFIX_GUEST_PRIVATE_COMPLETION_PREFIX } from "./guest-announce-instruction.shared.mjs";
const MARK = "hotfix: guest-announce-final-text";
export const label = "guest-announce-final-text-instruction";
export const verdict = "new";
export const target = { key: "subagentAnnounce", label: "subagent announce coordinator (runSubagentAnnounceFlow)", needles: ["function buildAnnounceReplyInstruction(params) {", "async function runSubagentAnnounceFlowBound(params) {"] };
const FN_OLD = "function buildAnnounceReplyInstruction(params) {\n";
const FN_V1 = [
  `//#region ${MARK} (2026-10-04): requester — Telegram guest-сессия → итог финальным текстом (правка inline-сообщения), не messaging tool`,
  HOTFIX_GUEST_ANNOUNCE_CONST_LINE.replace(/\n$/, ""),
  "function buildAnnounceReplyInstruction(params) {",
  "\tconst base = buildAnnounceReplyInstructionUpstream(params);",
  "\treturn params.guestRequester ? `${base} ${HOTFIX_GUEST_ANNOUNCE_INSTRUCTION}` : base;",
  "}",
  "//#endregion",
  "function buildAnnounceReplyInstructionUpstream(params) {",
  "",
].join("\n");
const FN_NEW = [
  `//#region ${MARK} (2026-10-04; v2 private completion): requester — Telegram guest-сессия → итог финальным текстом (правка inline-сообщения), не messaging tool`,
  HOTFIX_GUEST_ANNOUNCE_CONST_LINE.replace(/\n$/, ""),
  HOTFIX_GUEST_PRIVATE_COMPLETION_CONST_LINE.replace(/\n$/, ""),
  "function buildAnnounceReplyInstruction(params) {",
  "\tif (params.guestRequester && params.completionTarget === \"parent\") return `${HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION} ${HOTFIX_GUEST_ANNOUNCE_INSTRUCTION}`; // v2: у гостя private completion без «stays internal»/NO_REPLY",
  "\tconst base = buildAnnounceReplyInstructionUpstream(params);",
  "\treturn params.guestRequester ? `${base} ${HOTFIX_GUEST_ANNOUNCE_INSTRUCTION}` : base;",
  "}",
  "//#endregion",
  "function buildAnnounceReplyInstructionUpstream(params) {",
  "",
].join("\n");
const CALL_OLD = "\t\tconst replyInstruction = buildAnnounceReplyInstruction({\n\t\t\trequesterIsSubagent,\n";
const CALL_NEW = `\t\tconst replyInstruction = buildAnnounceReplyInstruction({\n\t\t\tguestRequester: typeof targetRequesterSessionKey === "string" && targetRequesterSessionKey.includes(":guest:"), // ${MARK}\n\t\t\trequesterIsSubagent,\n`;
export function patch(source) {
  let next = source;
  if (next.includes(FN_V1)) next = replaceOnce(next, FN_V1, FN_NEW, "buildAnnounceReplyInstruction wrapper v1 → v2");
  if (!next.includes(FN_NEW)) next = replaceOnce(next, FN_OLD, FN_NEW, "buildAnnounceReplyInstruction wrapper (guest requester)");
  if (!next.includes(CALL_NEW)) next = replaceOnce(next, CALL_OLD, CALL_NEW, "buildAnnounceReplyInstruction call site (guestRequester)");
  return next;
}
const count = (s, n) => s.split(n).length - 1;
export const check = { gate: "required", assertions: [
  contains(MARK, "маркер guest-announce-final-text"),
  contains(FN_NEW, "обёртка buildAnnounceReplyInstruction с guest-веткой (v2)"),
  notContains(FN_V1, "остаток обёртки v1"),
  contains(CALL_NEW, "guestRequester на месте вызова (targetRequesterSessionKey)"),
  contains(JSON.stringify(HOTFIX_GUEST_ANNOUNCE_INSTRUCTION), "текст guest-инструкции целиком"),
  contains(HOTFIX_GUEST_PRIVATE_COMPLETION_PREFIX, "текст guest-инструкции private completion"),
  notContains("function buildAnnounceReplyInstruction(params) {\n\tconst modelRouteInstruction", "непропатченная buildAnnounceReplyInstruction"),
  (c) => count(c, "function buildAnnounceReplyInstruction(params) {") === 1 && count(c, "function buildAnnounceReplyInstructionUpstream(params) {") === 1 ? null : "обёртка/апстрим-функция объявлены не по одному разу",
  (c) => count(c, "buildAnnounceReplyInstruction({") === 1 ? null : `ожидался ровно один вызов buildAnnounceReplyInstruction({, найдено ${count(c, "buildAnnounceReplyInstruction({")}`,
  // completionTarget "parent" в ванильной функции и SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION (нужен константе v2) — идентификаторы чанка
  contains("if (params.completionTarget === \"parent\") return SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION;", "ванильная ветка completionTarget parent"),
  (c) => count(c, "SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION") >= 2 ? null : "SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION не импортирован/не используется в чанке",
  // targetRequesterSessionKey должен быть объявлен в той же функции до вызова
  (c) => { const decl = c.indexOf("let targetRequesterSessionKey = params.requesterSessionKey;"); const call = c.indexOf(CALL_NEW); return decl >= 0 && call > decl ? null : "targetRequesterSessionKey не объявлен до вызова buildAnnounceReplyInstruction"; },
] };
