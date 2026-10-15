// Module subagent-inherit-owner-scope (sessions_spawn tool bundle). Paired with
// subagent-inherit-owner-scope.callsite (createOpenClawTools bundle).
// Symptom: every child run started by the sessions_spawn tool runs as a NON-owner, even when the parent
// run was the owner's (a guest turn of the owner has senderIsOwner === true as well). The dispatcher
// (callSubagentGatewayWithDispatchMode) launches the gateway `agent` call with least-privilege operator
// scopes unless the request carries an explicit `scopes` list; without operator.admin the `agent` handler
// derives senderIsOwner = false for the child and applies the owner-only core tool denylist
// (GATEWAY_OWNER_ONLY_CORE_TOOLS: nodes, computer, mobile_ui, sessions, terminal, portal, conversations_*,
// openclaw, screen). A sub-agent of a guest turn then fails with e.g. "Unknown tool id: openclaw:core:nodes".
// Fix: (B) the spawn context handed to spawnSubagentDirect carries senderIsOwner from the tool options
// (forwarded by the paired call-site module); (C) launchChildRun adds scopes: ["operator.admin"] to the
// `agent` request when ctx.senderIsOwner === true — the same `params.scopes ?? …` contract the dispatcher
// already uses for launch.authorization / out-of-process model override authorization. Parents that are
// not owner runs (group chats, other senders) are unchanged; collector runs (collect: true) are untouched.
import { replaceOnce, contains, countExactly } from "../lib/patch-helpers.mjs";
export const label = "subagent-inherit-owner-scope";
export const target = {
  key: "sessionsSpawnTool",
  label: "sessions_spawn tool bundle (spawnSubagentDirect / launchChildRun)",
  needles: [
    "async function spawnSubagentDirect(params, ctx) {",
    "const launchChildRun = async (assertDispatchCurrent) => {",
  ],
};
const MARK = "hotfix: subagent-inherit-owner-scope";
// B: the spawn context for spawnSubagentDirect receives senderIsOwner from the tool options.
const B_BEFORE = "\t\t\t\tsessionPermissionPolicy: opts?.sessionPermissionPolicy,\n\t\t\t\trequesterRunId: opts?.requesterRunId\n\t\t\t}, parentExecutionIdentityToken));";
const B_AFTER = `\t\t\t\tsessionPermissionPolicy: opts?.sessionPermissionPolicy,\n\t\t\t\tsenderIsOwner: opts?.senderIsOwner, // ${MARK}\n\t\t\t\trequesterRunId: opts?.requesterRunId\n\t\t\t}, parentExecutionIdentityToken));`;
// C: the child run is launched with operator.admin when the parent run belongs to the owner.
const C_BEFORE = "\t\t\t\tparams: childLaunch.request,\n\t\t\t\ttimeoutMs: childLaunch.timeoutMs\n\t\t\t}, {\n";
const C_LINE = `\t\t\t\t...ctx.senderIsOwner === true ? { scopes: ["operator.admin"] } : {}, // ${MARK}: owner parent → owner child (no GATEWAY_OWNER_ONLY_CORE_TOOLS deny)\n`;
const C_AFTER = `\t\t\t\tparams: childLaunch.request,\n${C_LINE}\t\t\t\ttimeoutMs: childLaunch.timeoutMs\n\t\t\t}, {\n`;
export function patch(source) {
  if (source.includes(MARK)) return source;
  let next = replaceOnce(source, B_BEFORE, B_AFTER, "spawn context (anchor 'sessionPermissionPolicy: opts?.sessionPermissionPolicy, requesterRunId: opts?.requesterRunId }, parentExecutionIdentityToken));' not found in spawnSubagentDirect call)");
  next = replaceOnce(next, C_BEFORE, C_AFTER, "launchChildRun gateway request (anchor 'params: childLaunch.request, timeoutMs: childLaunch.timeoutMs }, {' not found)");
  return next;
}
export const check = { assertions: [
  contains(B_AFTER, "senderIsOwner forwarded into the spawnSubagentDirect context"),
  contains(C_AFTER, "owner parent launches the child with operator.admin scopes"),
  countExactly("...ctx.senderIsOwner === true ? { scopes: [\"operator.admin\"] } : {}", 1, "scopes spread line"),
  // drift: the spread must sit inside the request that goes to the dispatcher (withSubagentGatewayExecutionIdentity)
  contains("withSubagentGatewayExecutionIdentity({\n\t\t\t\tmethod: \"agent\",\n\t\t\t\tassertDispatchCurrent,\n" + C_AFTER, "scopes spread inside the `agent` gateway request of launchChildRun"),
] };
