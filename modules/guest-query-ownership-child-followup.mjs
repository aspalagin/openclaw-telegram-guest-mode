// Bind a newly accepted sessions_send child run before registry publication can
// wake its requester. A reused child session does not own the previous query.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";

export const label = "guest-query-ownership-child-followup";
export const verdict = "new";
export const target = {
  label,
  needles: ["async function dispatchSessionsSendFollowup(params, replyContext, options) {"],
};

const before = "\t\t\t\t} else {\n\t\t\t\t\tawait registerSubagentRun({\n\t\t\t\t\t\trunId: start.runId,";
const binding = "\t\t\t\t\tglobalThis.__openclawHotfixGuestAck?.bindBatch?.(options.requesterSessionKey, start.runId, [options.requesterTurnRunId]); // hotfix: guest-query-ownership-child-followup";
const after = before.replace("\t\t\t\t\tawait registerSubagentRun({", `${binding}\n\t\t\t\t\tawait registerSubagentRun({`);

export function patch(source) {
  return source.includes(after) ? source : replaceOnce(source, before, after, label);
}

export const check = {
  gate: "required",
  assertions: [
    contains(after, label),
    source => source.split(binding).length === 2 ? null : `${label}: expected exactly one binding`,
  ],
};
