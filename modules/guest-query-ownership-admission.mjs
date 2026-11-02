// Portable OpenClaw 2026.10.9: guest-query-ownership-admission.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label="guest-query-ownership-admission";
export const verdict="new";
export const target={"label":"guest-query-ownership-admission","needles":["const followupRun = {","internalEventExecution: opts?.internalEventExecution,"]};
const changes=[
  [
    "\t\trun: {\n\t\t\tinternalEventExecution: opts?.internalEventExecution,",
    "\t\trun: {\n\t\t\tguestQueryId: ctx.GuestQueryId ?? sessionCtx.GuestQueryId, // hotfix: guest-query-ownership-admission\n\t\t\tinternalEventExecution: opts?.internalEventExecution,"
  ]
];
export function patch(source) { let s=source; for (const [oldText,newText] of changes) { if (!s.includes(newText)) s=replaceOnce(s,oldText,newText,label); } return s; }
export const check={gate:"required",assertions: changes.map(([,newText])=>contains(newText,label))};
