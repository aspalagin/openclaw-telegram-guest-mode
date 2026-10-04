// Module guest-deny-delivery-tools (agent tools policy bundle). Tool policy for ":guest:" sessions.
// OpenClaw 2026.9.5 moved the tool policy assembly (applyToolPolicyPipeline + buildConversationToolPolicyPipelineSteps with
// the owner-only step) out of createOpenClawCodingToolsInternal into the helper createEmbeddedMessageInvocationPolicy(params)
// .filter() in the same agent-tools chunk. filter() yields the final tool set of the run (subagentFiltered =
// messageInvocationPolicy.filter()) and is reused by the scheduled-message admission check. `options` is not reachable
// inside the helper, so: (1) the call site forwards guestSessionKey: options?.sessionKey and guestRunId: options?.runId;
// (2) additionalStepsAfterSandbox of the helper gets the guest deny step by spread.
// Deny list v3: ["gateway"] always for guest sessions; ["gateway", "message"] for runs whose runId starts with "announce:"
// (sub-agent announce/settle completion turns: their final must be TEXT, which guest-ack-edit / guest-announce-final-inline
// edit into the guest's inline message; a messaging tool there would send the result to the chat on the session record).
// In regular interactive guest turns `message` stays available (explicit sends on the guest's request). runId reaches
// the call site as options?.runId (buildConversationContext in builtin-openclaw passes runId: attempt.runId); without a
// runId (other callers of createOpenClawCodingTools) the deny list is ["gateway"]. The final tool set goes through the
// same filter(), and the code-mode catalog (compactTools → catalog) is built from the filtered set, so `message`
// disappears from catalog.search/exec as well. Earlier deny lists (v1: message/sessions_spawn/cron/gateway/nodes, v2:
// gateway only) are upgraded in place.
// 2026.9.7: (a) the owner-only denylist moved into prepareSessionPortalToolAccess() (session-portal-target.ts), the call
// site createEmbeddedMessageInvocationPolicy({ … ownerOnlyCoreToolPolicy, catalog … }) is unchanged; (b) pipeline steps got a
// `source` field (tool-access diagnostics) — the owner-only step is `{ policy, source: { kind: "session" }, label, … }`,
// so the step anchor includes `source` and the guest step carries the same `source: { kind: "session" }` ("Denied by
// guest session tools.deny" with kind=session). filter() got a second parameter onFilter — the guest step runs inside the
// same applyToolPolicyPipeline and shows up in onFilter/audit. Deny semantics unchanged.
import { replaceOnce, contains, notContains, count } from "../lib/patch-helpers.mjs";
export const label = "guest-deny-delivery-tools";
export const target = {
  key: "agentTools",
  label: "agent tools policy bundle",
  needles: [
    "label: \"gateway sender owner-only tools\"",
    "function createEmbeddedMessageInvocationPolicy(params)",
    "const messageInvocationPolicy = createEmbeddedMessageInvocationPolicy({",
  ],
};
const DENY_OLD = "policy: { deny: [\"message\", \"sessions_spawn\", \"cron\", \"gateway\", \"nodes\"] },";
const DENY_V2 = "policy: { deny: [\"gateway\"] }, // hotfix: guest-deny-delivery-tools v2 (2026-10-04: только gateway)";
const DENY_NEW = "policy: { deny: typeof params.guestRunId === \"string\" && params.guestRunId.startsWith(\"announce:\") ? [\"gateway\", \"message\"] : [\"gateway\"] }, // hotfix: guest-deny-delivery-tools v3 (2026-10-04: gateway always; message denied in subagent announce/settle completion turns — the final text is edited into the guest inline message)";
const CALLSITE_SESSION = "\t\tguestSessionKey: options?.sessionKey, // hotfix: guest-deny-delivery-tools (call site)\n";
const CALLSITE_RUNID = "\t\tguestRunId: options?.runId, // hotfix: guest-deny-delivery-tools v3 (call site: announce/settle completion turns)\n";
function patchGuestDenyDeliveryTools(source) {
  if (source.includes("hotfix: guest-deny-delivery-tools")) {
    let out = source;
    if (out.includes(DENY_OLD)) out = replaceOnce(out, DENY_OLD, DENY_NEW, "guest deny list v1 → v3");
    if (out.includes(DENY_V2)) out = replaceOnce(out, DENY_V2, DENY_NEW, "guest deny list v2 → v3");
    if (!out.includes(CALLSITE_RUNID)) out = replaceOnce(out, CALLSITE_SESSION, `${CALLSITE_SESSION}${CALLSITE_RUNID}`, "guest deny call site: add guestRunId (v3)");
    return out;
  }
  let out = replaceOnce(
    source,
    "\t\townerOnlyCoreToolPolicy,\n\t\tcatalog: () => ({\n",
    [
      "\t\townerOnlyCoreToolPolicy,",
      CALLSITE_SESSION.replace(/\n$/, ""),
      CALLSITE_RUNID.replace(/\n$/, ""),
      "\t\tcatalog: () => ({",
      "",
    ].join("\n"),
    "guest deny delivery tools call site (anchor 'ownerOnlyCoreToolPolicy,\\n catalog: () => ({' not found in createEmbeddedMessageInvocationPolicy call)",
  );
  out = replaceOnce(
    out,
    "\t\t\t\tadditionalStepsAfterSandbox: [{\n\t\t\t\t\tpolicy: params.ownerOnlyCoreToolPolicy,\n\t\t\t\t\tsource: { kind: \"session\" },\n\t\t\t\t\tlabel: \"gateway sender owner-only tools\",\n\t\t\t\t\tunavailableCoreToolReason\n\t\t\t\t}],\n",
    [
      "\t\t\t\tadditionalStepsAfterSandbox: [{",
      "\t\t\t\t\tpolicy: params.ownerOnlyCoreToolPolicy,",
      "\t\t\t\t\tsource: { kind: \"session\" },",
      "\t\t\t\t\tlabel: \"gateway sender owner-only tools\",",
      "\t\t\t\t\tunavailableCoreToolReason",
      "\t\t\t\t},",
      "\t\t\t\t//#region hotfix: guest-deny-delivery-tools (2026-07-26; 9.5: steps moved into createEmbeddedMessageInvocationPolicy; 9.7: step source)",
      "\t\t\t\t...(typeof params.guestSessionKey === \"string\" && params.guestSessionKey.includes(\":guest:\") ? [{",
      `\t\t\t\t\t${DENY_NEW}`,
      "\t\t\t\t\tsource: { kind: \"session\" },",
      "\t\t\t\t\tlabel: \"guest session tools.deny\",",
      "\t\t\t\t\tunavailableCoreToolReason",
      "\t\t\t\t}] : [])",
      "\t\t\t\t//#endregion",
      "\t\t\t\t],",
      "",
    ].join("\n"),
    "guest deny delivery tools (anchor 'additionalStepsAfterSandbox: [{ policy: params.ownerOnlyCoreToolPolicy …}],' not found in createEmbeddedMessageInvocationPolicy)",
  );
  return out;
}
export function patch(source) { return patchGuestDenyDeliveryTools(source); }
export const check = { assertions: [
  contains("hotfix: guest-deny-delivery-tools", "guest deny marker"),
  contains("label: \"guest session tools.deny\"", "guest deny step label"),
  contains("params.guestSessionKey.includes(\":guest:\")", "guest session gate"),
  contains(CALLSITE_SESSION, "guest session key call-site wiring"),
  contains(CALLSITE_RUNID, "guest run id call-site wiring (v3)"),
  contains(DENY_NEW, "guest deny list v3 (gateway; + message on announce: runs)"),
  notContains(DENY_OLD, "deny list v1 remnant (message/sessions_spawn/cron/nodes)"),
  notContains(DENY_V2, "deny list v2 remnant (gateway only)"),
  // runId must really reach the tool assembly options (buildConversationContext in builtin-openclaw passes runId: attempt.runId);
  // here we check that options?.runId is used in this chunk beyond our line, i.e. the options.runId contract is alive
  (src) => count(src, "options?.runId") >= 2 ? null : "options?.runId used only by our line (did the options.runId contract in agent-tools disappear?)",
  // drift: the final tool set of the run must go through the same filter() that carries the guest step
  contains("const subagentFiltered = messageInvocationPolicy.filter(", "run tool set built by messageInvocationPolicy.filter (drift: new bypass path?)"),
  (src) => count(src, "additionalStepsAfterSandbox:") === 1 ? null : "expected exactly one additionalStepsAfterSandbox pipeline in agent-tools (drift: second policy pipeline bypasses guest deny?)",
  (src) => count(src, "guestRunId") === 3 ? null : `guestRunId expected exactly 3 times (call site + typeof/startsWith in the deny step), found ${count(src, "guestRunId")}`,
] };
