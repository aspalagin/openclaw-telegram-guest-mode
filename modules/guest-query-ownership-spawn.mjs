// Portable OpenClaw 2026.10.9: guest-query-ownership-spawn.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label="guest-query-ownership-spawn";
export const verdict="new";
export const target={"label":"guest-query-ownership-spawn","needles":["function createSessionsSpawnTool(opts) {","buildRegistration: (_state, runId) => {"]};
const changes=[
  [
    "\t\t\tbuildRegistration: (_state, runId) => {",
    "\t\t\tbuildRegistration: (_state, runId) => {\n\t\t\t\tglobalThis.__openclawHotfixGuestAck?.bindBatch?.(ownership.completionRequesterSessionKey, runId, [ctx.requesterTurnRunId]); // hotfix: guest-query-ownership-spawn"
  ]
];
export function patch(source) { let s=source; for (const [oldText,newText] of changes) { if (!s.includes(newText)) s=replaceOnce(s,oldText,newText,label); } return s; }
export const check={gate:"required",assertions: changes.map(([,newText])=>contains(newText,label))};
