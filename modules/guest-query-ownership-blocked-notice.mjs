// Suppress guest blocked notices without changing either supported upstream notice text.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label = "guest-query-ownership-blocked-notice";
const before = "const text = successful && !params.storeReplaced ?";
const after = 'const text = successful && !params.storeReplaced && !subagent.requesterSessionKey?.includes(":guest:") ?';
export const target = { label, needles: [before, "Subagent completion delivery is blocked:"] };
export function patch(source) { return source.includes(after) ? source : replaceOnce(source, before, after, label); }
export const check = { assertions: [contains(after, label)] };
