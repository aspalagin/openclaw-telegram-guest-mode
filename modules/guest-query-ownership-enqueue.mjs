// Portable OpenClaw 2026.10.9: guest-query-ownership-enqueue.
import {replaceOnce,contains} from "../lib/patch-helpers.mjs";
export const label="guest-query-ownership-enqueue";export const verdict="new";export const target={"label":"guest-query-ownership-enqueue","needles":["function followupMessageRouteIdentityKey(run) {"]};
const changes=[["return JSON.stringify([channelRouteDedupeKey({","return JSON.stringify([...(run.run.sessionKey?.includes(\":guest:\") ? [run.run.sessionKey, run.run.guestQueryId ?? \"missing\"] : []), channelRouteDedupeKey({ // hotfix: guest query enqueue dedupe"]];
export function patch(s){for(const [a,b] of changes)if(!s.includes(b))s=replaceOnce(s,a,b,label);return s;}
export const check={gate:"required",assertions:changes.map(([,b])=>contains(b,label))};