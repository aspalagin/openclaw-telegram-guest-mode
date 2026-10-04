// Метка guest-session-per-chat: каскад поверх telegram-guest-mode-bot.2 (resolveTelegramGuestSessionKey в bot-message).
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
import { patch as basePatch, target as baseTarget } from "./telegram-guest-mode-bot.2.mjs";
export const label = "guest-session-per-chat";
export const verdict = "port";
export const target = baseTarget;
export function patch(source) {
  const next = basePatch(source);
  if (next.includes("hotfix: guest-session-per-chat")) return next;
  return replaceOnce(
    next,
    "\tconst scope = callerChatId || callerUserId || guestQueryId;",
    "\t//#region hotfix: guest-session-per-chat (2026-07-26)\n\tconst chatScope = msg.chat?.id != null ? String(msg.chat.id) : callerChatId;\n\tconst scope = callerUserId && chatScope ? `${callerUserId}-at-${chatScope}` : chatScope || callerUserId || guestQueryId;\n\t//#endregion",
    "guest session per chat",
  );
}
export const check = { gate: "required", assertions: [ contains("hotfix: guest-session-per-chat", "per-chat scope marker"), contains("`${callerUserId}-at-${chatScope}`", "caller+chat scope") ] };
