// Portable OpenClaw 2026.10.9: guest-query-ownership-route.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label = "guest-query-ownership-route";
export const verdict = "new";
export const target = { label, needles: ["async function routeReply(params) {", "async function routeReplyOperation(params, operation) {"] };
const BEFORE = "async function routeReplyOperation(params, operation) {\n";
const AFTER = BEFORE + '\t// hotfix: guest-query-ownership-route — legacy/missing-context guest callers cannot fall through to a DM.\n\tif (params.sessionKey?.includes(":guest:")) return { ok: false, delivered: false, suppressed: true, error: "guest_inline_unavailable: query-bound delivery required" };\n';
export function patch(source) { return source.includes(AFTER) ? source : replaceOnce(source, BEFORE, AFTER, label); }
export const check = { gate: "required", assertions: [contains(AFTER, label)] };
