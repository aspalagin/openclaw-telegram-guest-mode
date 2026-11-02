// Portable OpenClaw 2026.10.9: guest-query-ownership-message.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label="guest-query-ownership-message";
export const verdict="new";
export { target } from "./message-inbound-turn-kind-normalize.mjs";
const changes=[
  [
    "\tconst guestMediaStaging = hotfixResolveGuestMediaStaging(ctx, to);",
    "\tconst guestMediaStaging = hotfixResolveGuestMediaStaging(ctx, to);\n\t// hotfix: guest-query-ownership-message — no ordinary send for a guest-origin message.\n\tif (input.sessionKey?.includes(\":guest:\")) {\n\t\tconst owner = globalThis.__openclawHotfixGuestAck?.resolveOwner?.(input.sessionKey, { runId: input.runId });\n\t\tif (!owner || guestMediaStaging?.mode !== \"direct\") throw new Error(\"guest_inline_unavailable: exact query/local-media route required\");\n\t\tguestMediaStaging.guestQueryId = owner.guestQueryId;\n\t\tguestMediaStaging.runId = input.runId;\n\t}"
  ],
  [
    "{ path: local.real, fileName: staging.locals.length",
    "{ path: local.real, guestQueryId: staging.guestQueryId, runId: staging.runId, fileName: staging.locals.length"
  ]
];
export function patch(source) { let s=source; for (const [oldText,newText] of changes) { if (!s.includes(newText)) s=replaceOnce(s,oldText,newText,label + ": " + oldText); } return s; }
export const check={gate:"required",assertions: changes.map(([,newText])=>contains(newText,label))};
