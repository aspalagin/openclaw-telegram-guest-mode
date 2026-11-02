// Portable OpenClaw 2026.10.9: guest-query-ownership-settle.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label="guest-query-ownership-settle";
export const verdict="new";
export const target={"label":"guest-query-ownership-settle","needles":["const { runId: directIdempotencyKey } = buildRequesterSettleWakeIdentity({"]};
const changes=[
  [
    "\t\tconst sourceReceiptAdmission = createRequesterSettleReceiptAdmission({",
    "\t\tglobalThis.__openclawHotfixGuestAck?.bindBatch?.(requesterSessionKey, directIdempotencyKey, batchRunIds); // hotfix: guest-query-ownership-settle\n\t\tconst sourceReceiptAdmission = createRequesterSettleReceiptAdmission({"
  ],
  [
    "\tconst frozenBatchRunIds = currentState.batchRunIds;",
    "\tconst guestOwner = requesterSessionKey.includes(\":guest:\") ? globalThis.__openclawHotfixGuestAck?.resolveOwner?.(requesterSessionKey, { runId: currentSettledEntry.runId }) : void 0;\n\tif (requesterSessionKey.includes(\":guest:\") && !guestOwner) return false;\n\tconst guestSameOwner = (entry) => !guestOwner || globalThis.__openclawHotfixGuestAck?.resolveOwner?.(requesterSessionKey, { runId: entry.runId }) === guestOwner;\n\tconst frozenBatchRunIds = currentState.batchRunIds;"
  ],
  [
    "requesterRuns.filter((entry) => hasCurrentWake(entry) && hasSettled(entry))",
    "requesterRuns.filter((entry) => guestSameOwner(entry) && hasCurrentWake(entry) && hasSettled(entry))"
  ],
  [
    "\tif (settledBatch.length === 0 || settledBatch.some",
    "\t// Frozen cohorts are durable custody; never rewrite membership or broadcast across owners.\n\tif (!settledBatch.every(guestSameOwner)) return false;\n\tif (settledBatch.length === 0 || settledBatch.some"
  ]
];
export function patch(source) { let s=source; for (const [oldText,newText] of changes) { if (!s.includes(newText)) s=replaceOnce(s,oldText,newText,label); } return s; }
export const check={gate:"required",assertions: changes.map(([,newText])=>contains(newText,label))};
