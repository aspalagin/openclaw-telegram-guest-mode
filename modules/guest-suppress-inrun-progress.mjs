// Portable OpenClaw 2026.10.9: guest-suppress-inrun-progress.
import { replaceOnce, insertBefore, insertAfter, contains, containsAny, notContains, countAtLeast } from "../lib/patch-helpers.mjs";
import fs from "node:fs"; import path from "node:path";
const { readFileSync, writeFileSync, readdirSync, existsSync } = fs;
function read(file){ return fs.readFileSync(file, "utf8"); }
function countOccurrences(content, needle){ return content.split(needle).length - 1; }
export const label = "guest-suppress-inrun-progress";
export const verdict = "port";
export const target = {
 "key": "dispatch",
 "label": "auto-reply dispatch bundle",
 // 10.5: локальных const shouldEmitVerboseProgress больше нет — якорь на объявление verboseProgress и поле state (переживают патч)
 "needles": [
  "\tconst verboseProgress = createShouldEmitVerboseProgress({",
  "shouldEmitFullVerboseProgressAsync: ",
  "acpDispatchSessionKey"
 ]
};
// ---- старый патч (inventory/patch-src/guest-suppress-inrun-progress.mjs) ----
// label=guest-suppress-inrun-progress target=dispatch runApplyLine=5177 applyLines=3910-3940
// guest-suppress-inrun-progress (2026-07-29): guest-suppress-verbose-payloads (27.07) глушил
// только POST-RUN довески. При agents.defaults.verboseDefault=on любой guest-ран, который
// дёргает инструмент, дополнительно порождал IN-RUN progress-payload'ы: для guest-запросов
// стриминг-драфт выключен (streamDeliveryEnabled = !isGroup && !isGuestQuery && ...), поэтому
// commentary/tool-progress идёт standalone-сообщениями (deliverStandaloneCommentaryProgress).
// Первый такой payload съедал одноразовый answerGuestQuery, а настоящий ответ через десятки
// секунд получал «query is too old» и дропался guest-single-answer-guard'ом — гость видел
// строку прогресса вместо ответа (2026-07-29: 5 из 11 guest-ранов, все с web_search).
// Лечение: для ":guest:"-сессий verbose-прогресс выключен целиком в одной точке.
const FLAG_ANCHOR = "\tconst verboseProgress = createShouldEmitVerboseProgress({\n\t\tagentId: sessionAgentId,\n\t\tsessionKey: acpDispatchSessionKey,\n";
const FLAG_LINE = "\tconst isGuestDispatchSession = typeof acpDispatchSessionKey === \"string\" && acpDispatchSessionKey.includes(\":guest:\");";
const STATE_OLD = [
  "\t\t\tshouldEmitVerboseProgress: verboseProgress.shouldEmit,",
  "\t\t\tshouldEmitFullVerboseProgress: verboseProgress.shouldEmitFull,",
  "\t\t\tshouldEmitVerboseProgressAsync: verboseProgress.shouldEmitAsync,",
  "\t\t\tshouldEmitFullVerboseProgressAsync: verboseProgress.shouldEmitFullAsync,",
].join("\n");
const STATE_NEW = [
  "\t\t\t// hotfix: guest-suppress-inrun-progress — verbose in-run progress off for \":guest:\" sessions (sync + async readers)",
  "\t\t\tshouldEmitVerboseProgress: isGuestDispatchSession ? () => false : verboseProgress.shouldEmit,",
  "\t\t\tshouldEmitFullVerboseProgress: isGuestDispatchSession ? () => false : verboseProgress.shouldEmitFull,",
  "\t\t\tshouldEmitVerboseProgressAsync: isGuestDispatchSession ? async () => false : verboseProgress.shouldEmitAsync,",
  "\t\t\tshouldEmitFullVerboseProgressAsync: isGuestDispatchSession ? async () => false : verboseProgress.shouldEmitFullAsync,",
].join("\n");
function patchGuestSuppressInrunProgress(source) {
  if (source.includes("hotfix: guest-suppress-inrun-progress")) return source;
  // флаг — перед объявлением verboseProgress (acpDispatchSessionKey объявлен выше в gatherDispatchRequest)
  let next = replaceOnce(
    source,
    FLAG_ANCHOR,
    ["\t//#region hotfix: guest-suppress-inrun-progress (2026-07-29; 2026-10-20 → state.shouldEmit*VerboseProgress[Async])", FLAG_LINE, "\t//#endregion", ""].join("\n") + FLAG_ANCHOR,
    "guest-suppress-inrun-progress guest flag (gatherDispatchRequest)",
  );
  next = replaceOnce(next, STATE_OLD, STATE_NEW, "guest-suppress-inrun-progress verbose gate (dispatch state)");
  return next;
}

// guest-no-chat-fallback (2026-07-29): у guest-ответа единственный легальный транспорт —
// answerGuestQuery. Наблюдение 2026-07-29 14:25:53: payload guest-сессии ушёл обычным
// sendRichMessage в chatId=214810990 (чат, где набран inline-запрос) в обход
// guest-single-answer-guard — спасло только 403 «bot can't initiate conversation».
// Это тот же класс утечки, что закрывали 27.07: текст из guest-рана попадает в чужой чат
// обычным сообщением от бота. Гвард: payload guest-сессии без guestQueryId не доставляется.

// ---- /старый патч ----
export function patch(source) { return patchGuestSuppressInrunProgress(source); }
// Сторож дрейфа: verboseProgress читают только noteRunVerbosity и четыре гардированные строки state; флаг объявлен до state в той же функции.
const onlyGatedReaders = (src) => {
  const reads = src.match(/verboseProgress\.[A-Za-z]+/g) ?? [];
  const hasRelease = src.includes("verboseProgress.release");
  if (hasRelease && !src.includes("onDispose?.(verboseProgress.release);")) return "verboseProgress.release is no longer the reviewed disposal registration";
  const allowed = new Set(["verboseProgress.release", "verboseProgress.noteRunVerbosity", "verboseProgress.shouldEmit", "verboseProgress.shouldEmitFull", "verboseProgress.shouldEmitAsync", "verboseProgress.shouldEmitFullAsync"]);
  const extra = reads.filter((r) => !allowed.has(r));
  if (extra.length) return `новые читатели verboseProgress: ${[...new Set(extra)].join(", ")}`;
  if (reads.length !== (hasRelease ? 6 : 5)) return `unexpected verboseProgress readers (4 gated, noteRunVerbosity, optional disposal), найдено ${reads.length}`;
  const flag = src.indexOf(FLAG_LINE); const state = src.indexOf(STATE_NEW); const fn = src.lastIndexOf("\nasync function gatherDispatchRequest(", flag);
  const nextFn = src.indexOf("\nasync function ", flag + 1);
  if (flag < 0 || state < 0 || fn < 0 || !(flag < state) || (nextFn >= 0 && nextFn < state)) return "флаг гостя и гардированный state не в одной gatherDispatchRequest";
  return null;
};
export const check = { gate: "required", assertions: [
      contains("hotfix: guest-suppress-inrun-progress", "in-run progress suppression marker"),
      contains(FLAG_LINE, "guest dispatch flag"),
      contains(STATE_NEW, "verbose progress (sync + async, full) gated for guest in dispatch state"),
      notContains(STATE_OLD, "негардированные shouldEmit*VerboseProgress в state"),
      onlyGatedReaders,
      (src) => (src.split("createShouldEmitVerboseProgress(").length - 1) === 1 ? null : "createShouldEmitVerboseProgress вызывается не один раз (новый источник verbose-прогресса?)",
    ] };
