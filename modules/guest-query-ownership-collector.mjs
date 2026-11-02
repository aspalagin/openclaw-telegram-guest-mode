// Portable OpenClaw 2026.10.9: guest-query-ownership-collector.
import {replaceOnce,contains} from "../lib/patch-helpers.mjs";
export const label="guest-query-ownership-collector";
export const verdict="new";
export const target={"label":"guest-query-ownership-collector","needles":["function resolveFollowupDeliveryStorageKey(run) {"]};
const changes=[
  [
    "\tconst provenance = execution.inputProvenance;\n\treturn JSON.stringify([",
    "\tconst provenance = execution.inputProvenance;\n\treturn JSON.stringify([\n\t\texecution.sessionKey?.includes(\":guest:\") ? [execution.sessionKey, execution.guestQueryId ?? \"missing\"] : null, // hotfix: guest-query-owner collect/overflow boundary"
  ],
  [
    "function resolveCollectedRun(items, source) {",
    "function resolveCollectedRun(items, source) {\n\tif (items.some((item) => item.run.sessionKey?.includes(\":guest:\")) && (!source.guestQueryId || items.some((item) => item.run.sessionKey !== source.sessionKey || item.run.guestQueryId !== source.guestQueryId))) throw new Error(\"guest query collection ownership mismatch\"); // defense before synthetic prompt execution"
  ],
  [
    "return item.userTurnTranscriptRecorder?.hasPersisted() === true",
    "return item.run.sessionKey?.includes(\":guest:\") || item.userTurnTranscriptRecorder?.hasPersisted() === true"
  ]
];
export function patch(s){for(const [a,b] of changes)if(!s.includes(b))s=replaceOnce(s,a,b,label);return s;}
export const check={gate:"required",assertions:changes.map(([,b])=>contains(b,label))};
