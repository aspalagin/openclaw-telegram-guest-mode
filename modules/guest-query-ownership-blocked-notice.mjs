// Portable OpenClaw 2026.10.9: guest-query-ownership-blocked-notice.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label="guest-query-ownership-blocked-notice";
export const verdict="new";
export const target={"label":"guest-query-ownership-blocked-notice","needles":["const text = successful && !params.storeReplaced ? \"Subagent completion delivery is blocked: \" + params.reason : null;"]};
const changes=[
  [
    "\tconst text = successful && !params.storeReplaced ? \"Subagent completion delivery is blocked: \" + params.reason : null;",
    "\t// hotfix: guest-query-ownership-blocked-notice — retain failure metadata, do not wake a model into another multipart/DM turn.\n\tconst text = successful && !params.storeReplaced && !subagent.requesterSessionKey?.includes(\":guest:\") ? \"Subagent completion delivery is blocked: \" + params.reason : null;"
  ]
];
export function patch(source) { let s=source; for (const [oldText,newText] of changes) { if (!s.includes(newText)) s=replaceOnce(s,oldText,newText,label); } return s; }
export const check={gate:"required",assertions: changes.map(([,newText])=>contains(newText,label))};
