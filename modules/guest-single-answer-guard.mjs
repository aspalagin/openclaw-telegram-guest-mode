// Module guest-single-answer-guard: cascade over telegram-guest-mode-delivery. A guest reply is inline-or-
// dropped: when answerGuestQuery reports the query as expired, or returns no message id, the payload is
// dropped with a diagnostic instead of falling back to sendMessage (which would deliver the guest's reply
// into the operator's chat). The guest branch of deliverTextReply always ends with a return.
import { replaceOnce, contains, notContains } from "../lib/patch-helpers.mjs";
import { patch as basePatch, target as baseTarget } from "./telegram-guest-mode-delivery.mjs";
export const label = "guest-single-answer-guard";
export const target = baseTarget;
export function patch(source) {
  const next = basePatch(source);
  if (next.includes("hotfix: guest-single-answer-guard")) return next;
  return replaceOnce(
    next,
    "\t\t} catch (err) {\n\t\t\tif (!isTelegramGuestQueryExpiredError(err)) throw err;\n\t\t\tparams.runtime.log?.(`telegram guest query expired; falling back to sendMessage: ${formatErrorMessage(err)}`);\n\t\t}\n\t\tif (guestDeliveredMessageId != null) {\n\t\t\tparams.progress.guestAnswered = true;\n\t\t\tmarkDelivered(params.progress);\n\t\t\treturn guestDeliveredMessageId;\n\t\t}\n\t}",
    "\t\t} catch (err) {\n\t\t\tif (!isTelegramGuestQueryExpiredError(err)) throw err;\n\t\t\t//#region hotfix: guest-single-answer-guard (2026-07-27)\n\t\t\tparams.runtime.log?.(`[hotfix][guest-single-answer] guest query expired; dropping payload without sendMessage fallback: ${formatErrorMessage(err)}`);\n\t\t\treturn;\n\t\t\t//#endregion\n\t\t}\n\t\tif (guestDeliveredMessageId != null) {\n\t\t\tparams.progress.guestAnswered = true;\n\t\t\tmarkDelivered(params.progress);\n\t\t\treturn guestDeliveredMessageId;\n\t\t}\n\t\t//#region hotfix: guest-single-answer-guard (2026-07-27): guest reply must never fall back to sendMessage\n\t\tparams.runtime.log?.(\"[hotfix][guest-single-answer] inline answer returned no message id; suppressing sendMessage fallback\");\n\t\treturn;\n\t\t//#endregion\n\t}",
    "guest-single-answer-guard delivery block (cascade: telegram-guest-mode-delivery)",
  );
}
export const check = { assertions: [ contains("hotfix: guest-single-answer-guard", "single-answer marker"), contains("[hotfix][guest-single-answer]", "diagnostic log tag"), notContains("falling back to sendMessage", "guest sendMessage fallback removed") ] };
