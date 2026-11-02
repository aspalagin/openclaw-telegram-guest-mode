// Portable OpenClaw 2026.10.9: guest-query-ownership-followup.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label="guest-query-ownership-followup";
export const verdict="new";
export const target={"label":"guest-query-ownership-followup","needles":["async function sendFollowupPayloads(params) {","async function executeAgentTurn(params) {"]};
const changes=[
  [
    "\tconst runId = params.opts?.runId ?? crypto.randomUUID();",
    "\tconst runId = params.opts?.runId ?? crypto.randomUUID();\n\tglobalThis.__openclawHotfixGuestAck?.bindRun?.(params.followupRun.run.sessionKey, runId, params.followupRun.run.guestQueryId); // hotfix: guest-query-ownership-followup"
  ],
  [
    "\t\tconst readTurnSessionEntry = () => replySessionKey",
    "\t\tglobalThis.__openclawHotfixGuestAck?.bindRun?.(turn.queued.run.sessionKey, turn.runId, turn.queued.run.guestQueryId); // hotfix: guest-query-ownership-followup queued run\n\t\tconst readTurnSessionEntry = () => replySessionKey"
  ],
  [
    "\tconst deliverQueuedBatch = sourceDisposition?.deliver;",
    "\t// hotfix: guest-query-ownership-followup — guest origin may never choose ordinary routeReply/DM.\n\tif (turn.queued.run.sessionKey?.includes(\":guest:\")) {\n\t\tif (params.kind && params.kind !== \"final\") return []; // guest progress is intentionally suppressed, not a failed terminal attempt\n\t\tconst guestPayloads = payloads.filter((payload) => deliveryPlan.resolveFollowupRoute?.({ payload, originatingChannel, originatingTo, originRoutable, dispatcherAvailable: true })?.route !== \"drop\");\n\t\tif (guestPayloads.length === 0) return [];\n\t\tconst receipt = await globalThis.__openclawHotfixGuestAck?.deliverPayloads?.(turn.queued.run.sessionKey, guestPayloads, { guestQueryId: turn.queued.run.guestQueryId, runId: params.runId, kind: params.kind, assertCurrent: () => turn.queued.operatorAuthority?.assertCurrent() });\n\t\tturn.guestInlineDelivery = receipt; // process-local custody retained through terminal callback\n\t\tif (receipt?.delivered) await defaults.opts?.onObservedReplyDelivery?.();\n\t\tif (!receipt?.delivered) throw new Error(\"guest_inline_unavailable: \" + (receipt?.reason ?? \"registry unavailable\"));\n\t\treturn []; // Direct inline receipt owns delivery; do not dispatch again.\n\t}\n\tconst deliverQueuedBatch = sourceDisposition?.deliver;"
  ],
  [
    "const progressAllowed = () => deliveryAllowed() && (",
    "const progressAllowed = () => deliveryAllowed() && !turn.queued.run.sessionKey?.includes(\":guest:\") && ("
  ],
  [
    "\t\tonToolResult: async (payload) => {\n\t\t\treturn await enqueueProgressResult",
    "\t\tonToolResult: async (payload) => {\n\t\t\tif (turn.queued.run.sessionKey?.includes(\":guest:\")) return false; // guest suppression must not become visibleReplyDelivered\n\t\t\treturn await enqueueProgressResult"
  ]
];
export function patch(source) { let s=source; for (const [oldText,newText] of changes) { if (!s.includes(newText)) s=replaceOnce(s,oldText,newText,label); } return s; }
export const check={gate:"required",assertions: changes.map(([,newText])=>contains(newText,label))};
