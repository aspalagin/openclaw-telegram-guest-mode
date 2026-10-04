// Port-модуль метки guest-suppress-inrun-progress (сгенерировано adapt/gen-port.mjs; target=dispatch)
// 2026-09-30 (2026.9.7, чанк dispatch-from-config-BfxY-Rlw.mjs): лёг без изменений; регион acpDispatchSessionKey…verboseProgress байт-в-байт как в 9.6,
// все потребители (state.shouldEmitVerboseProgress/shouldSendToolSummaries/standaloneCommentaryProgressVisible) читают пропатченные const — обхода нет.
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
 "needles": [
  "const shouldEmitVerboseProgress = verboseProgress.shouldEmit;",
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
function patchGuestSuppressInrunProgress(source) {
  if (source.includes("hotfix: guest-suppress-inrun-progress")) return source;
  return replaceOnce(
    source,
    "\tconst shouldEmitVerboseProgress = verboseProgress.shouldEmit;\n\tconst shouldEmitFullVerboseProgress = verboseProgress.shouldEmitFull;",
    [
      "\t//#region hotfix: guest-suppress-inrun-progress (2026-07-29)",
      "\tconst isGuestDispatchSession = typeof acpDispatchSessionKey === \"string\" && acpDispatchSessionKey.includes(\":guest:\");",
      "\tconst shouldEmitVerboseProgress = isGuestDispatchSession ? () => false : verboseProgress.shouldEmit;",
      "\tconst shouldEmitFullVerboseProgress = isGuestDispatchSession ? () => false : verboseProgress.shouldEmitFull;",
      "\t//#endregion",
    ].join("\n"),
    "guest-suppress-inrun-progress verbose gate",
  );
}

// guest-no-chat-fallback (2026-07-29): у guest-ответа единственный легальный транспорт —
// answerGuestQuery. Наблюдение 2026-07-29 14:25:53: payload guest-сессии ушёл обычным
// sendRichMessage в chatId=214810990 (чат, где набран inline-запрос) в обход
// guest-single-answer-guard — спасло только 403 «bot can't initiate conversation».
// Это тот же класс утечки, что закрывали 27.07: текст из guest-рана попадает в чужой чат
// обычным сообщением от бота. Гвард: payload guest-сессии без guestQueryId не доставляется.

// ---- /старый патч ----
export function patch(source) { return patchGuestSuppressInrunProgress(source); }
export const check = { gate: "required", assertions: [
      contains("hotfix: guest-suppress-inrun-progress", "in-run progress suppression marker"),
      contains('const isGuestDispatchSession = typeof acpDispatchSessionKey === "string" && acpDispatchSessionKey.includes(":guest:");', "guest dispatch flag"),
      contains("const shouldEmitVerboseProgress = isGuestDispatchSession ? () => false : verboseProgress.shouldEmit;", "verbose progress gated for guest"),
      contains("const shouldEmitFullVerboseProgress = isGuestDispatchSession ? () => false : verboseProgress.shouldEmitFull;", "full verbose progress gated for guest"),
    ] };
