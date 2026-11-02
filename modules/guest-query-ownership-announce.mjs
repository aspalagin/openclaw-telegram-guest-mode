// Portable OpenClaw 2026.10.9: guest-query-ownership-announce.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label="guest-query-ownership-announce";
export const verdict="new";
export const target={"label":"guest-query-ownership-announce","needles":["const directIdempotencyKey = buildAnnounceIdempotencyKey(announceId);"]};
const changes=[
  [
    "\t\tconst directIdempotencyKey = buildAnnounceIdempotencyKey(announceId);",
    "\t\tconst directIdempotencyKey = buildAnnounceIdempotencyKey(announceId);\n\t\tglobalThis.__openclawHotfixGuestAck?.bindBatch?.(targetRequesterSessionKey, directIdempotencyKey, [params.childRunId]); // hotfix: guest-query-ownership-announce"
  ]
];
export function patch(source) { let s=source; for (const [oldText,newText] of changes) { if (!s.includes(newText)) s=replaceOnce(s,oldText,newText,label); } return s; }
export const check={gate:"required",assertions: changes.map(([,newText])=>contains(newText,label))};
