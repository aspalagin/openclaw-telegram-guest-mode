// Module guest-suppress-inrun-progress (auto-reply dispatch bundle, dispatch-from-config chunk; region
// acpDispatchSessionKey … verboseProgress unchanged since 2026.9.6, all consumers — state.shouldEmitVerboseProgress /
// shouldSendToolSummaries / standaloneCommentaryProgressVisible — read the patched consts, there is no bypass).
// guest-suppress-verbose-payloads silences only POST-RUN extras. With agents.defaults.verboseDefault=on any guest run
// that calls a tool also emits IN-RUN progress payloads: for guest queries the streaming draft is off
// (streamDeliveryEnabled = !isGroup && !isGuestQuery && …), so commentary/tool progress goes out as standalone messages
// (deliverStandaloneCommentaryProgress). The first such payload consumed the one-shot answerGuestQuery and the real
// reply tens of seconds later got "query is too old" and was dropped by guest-single-answer-guard — the guest saw a
// progress line instead of the answer. Fix: for ":guest:" sessions verbose progress is disabled in one place.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label = "guest-suppress-inrun-progress";
export const target = {
  key: "dispatch",
  label: "auto-reply dispatch bundle",
  needles: [
    "const shouldEmitVerboseProgress = verboseProgress.shouldEmit;",
    "acpDispatchSessionKey",
  ],
};
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
export function patch(source) { return patchGuestSuppressInrunProgress(source); }
export const check = { assertions: [
  contains("hotfix: guest-suppress-inrun-progress", "in-run progress suppression marker"),
  contains('const isGuestDispatchSession = typeof acpDispatchSessionKey === "string" && acpDispatchSessionKey.includes(":guest:");', "guest dispatch flag"),
  contains("const shouldEmitVerboseProgress = isGuestDispatchSession ? () => false : verboseProgress.shouldEmit;", "verbose progress gated for guest"),
  contains("const shouldEmitFullVerboseProgress = isGuestDispatchSession ? () => false : verboseProgress.shouldEmitFull;", "full verbose progress gated for guest"),
] };
