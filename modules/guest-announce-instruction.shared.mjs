// Общий текст guest-ветки completion-инструкции (метки guest-announce-final-text-instruction и guest-announce-final-text-settle-wake).
// Не порт-модуль (нет patch/target) — в PLAN не входит. 2026-10-04.
// v2 (2026-10-04): + HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION — замена штатной
// SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION («Process this result privately … Your final reply stays internal … send it through a messaging tool …
// Reply ONLY: NO_REPLY») для requester-гостя при completionTarget "parent" (private completion): у гостя message запрещён (deny v3), а финал
// приватного хода теперь дописывается в inline-сообщение (guest-announce-final-inline v2), поэтому «stays internal»/NO_REPLY противоречат фиксу.
// Строка константы — JS-исходник с ${SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION}: идентификатор есть в обоих целевых чанках (ванильный импорт).
export const HOTFIX_GUEST_ANNOUNCE_INSTRUCTION = "[Telegram Guest Mode] The requester is a Telegram guest session: reply with the final user-facing text itself — it is delivered automatically into the guest's inline message (edited in place or appended; one message, 4096 characters max, so keep it concise and complete, without a path-only first line). Do NOT use the message tool or any other messaging/delivery tool for this result (it is unavailable here; a message sent anywhere else would land in the wrong chat), and do not answer with the silent token while the result has not been shown to the guest yet.";
export const HOTFIX_GUEST_ANNOUNCE_CONST_LINE = `const HOTFIX_GUEST_ANNOUNCE_INSTRUCTION = ${JSON.stringify(HOTFIX_GUEST_ANNOUNCE_INSTRUCTION)};\n`;
export const HOTFIX_GUEST_PRIVATE_COMPLETION_PREFIX = "Process this result for the Telegram guest who requested it.";
export const HOTFIX_GUEST_PRIVATE_COMPLETION_SUFFIX = "Your final reply IS the guest-facing update: it is delivered automatically into the guest's inline message (private completion, no channel delivery), so write the complete result there and do not answer with the silent token unless the guest has already received this exact result.";
export const HOTFIX_GUEST_PRIVATE_COMPLETION_CONST_LINE = `const HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION = \`${HOTFIX_GUEST_PRIVATE_COMPLETION_PREFIX} \${SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION} ${HOTFIX_GUEST_PRIVATE_COMPLETION_SUFFIX}\`;\n`;
