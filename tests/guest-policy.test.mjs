// Exercise the actual patched policy and upstream builder in memory, with synthetic tools.
import vm from "node:vm";
import assert from "node:assert/strict";
import { Corpus, walkJs } from "../lib/kit.mjs";

const dist = process.argv[2];
if (!dist) throw new Error("Pass the dist directory of a disposable, patched package");
const corpus = new Corpus(walkJs(dist));
const read = needle => corpus.read(corpus.findOne(needle, [needle]));
function fn(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf("\n}", start);
  assert.ok(end > start, name);
  return source.slice(start, end + 2);
}
const source = read("function createEmbeddedMessageInvocationPolicy(params) {");
const hasSessionProjection = source.includes("function resolveTurnToolSurface(params) {");
const builder = read("function buildConversationToolPolicyPipelineSteps(params) {");
const box = {
  resolveConversationToolPolicies: ({ capabilityProfile }) => capabilityProfile.testPolicies,
  buildDefaultToolPolicyPipelineSteps: () => [],
  applyToolPolicyPipeline: ({ tools, steps }) => steps.reduce((current, step) => current.filter(tool => !step.policy?.deny?.includes(tool.name)), tools),
  getPluginToolMeta: () => undefined,
  logWarn() {},
  createScheduledMessageInvocationAdmission: params => params.isAllowed,
  gateAgentToolExecution: tool => ({ ...tool, gated: true }),
  copyAgentToolMetadata: (_, tool) => tool,
  markAgentToolExecutionUnavailable: tool => tool,
};
vm.createContext(box);
vm.runInContext(fn(builder, "buildConversationToolPolicyPipelineSteps") + "\n" + fn(source, "createEmbeddedMessageInvocationPolicy") +
  (hasSessionProjection ? "\n" + fn(source, "resolveTurnToolSurface") : ""), box);
const config = {};
const profile = { policy: { requesterPolicySource: "completion-handoff" }, testPolicies: { inheritedToolPolicy: { deny: ["terminal"] } } };
const names = ["message", "gateway", "sessions_spawn", "terminal"];
const cases = [
  ["ordinary guest", "agent:test:guest:fixture", "run:1", ["message", "sessions_spawn"]],
  ["guest completion", "agent:test:guest:fixture", "announce:fixture", ["sessions_spawn"]],
  ["private followup", "agent:test:guest:fixture", "announce:sessions-send:fixture:completion", ["message", "sessions_spawn"]],
  ["ordinary owner", "agent:test:main", "announce:fixture", ["message", "gateway", "sessions_spawn"]],
];
let checks = 0;
for (const [label, key, runId, expected] of cases) {
  const policy = box.createEmbeddedMessageInvocationPolicy({
    config, capabilityProfile: profile, guestSessionKey: key, guestRunId: runId,
    catalog: () => ({ tools: names.map(name => ({ name })) }), isAvailable: () => true,
  });
  const turn = policy.filter();
  assert.deepEqual(Array.from(turn, tool => tool.name), expected, label + " turn"); checks++;
  assert.equal(policy.admit(config), expected.includes("message"), label + " scheduled admission"); checks++;
  if (hasSessionProjection) {
    const session = policy.filter(profile, undefined, "session");
    assert.deepEqual(Array.from(session, tool => tool.name), [...expected, "terminal"], label + " session"); checks++;
    const surface = box.resolveTurnToolSurface({ turnTools: turn, sessionTools: session, ownerOnlyDenied: new Set() });
    assert.equal(surface.tools.some(tool => tool.name === "message"), expected.includes("message"), label + " advertised"); checks++;
    assert.equal(surface.callableTools.some(tool => tool.name === "message"), expected.includes("message"), label + " callable"); checks++;
    const restricted = box.resolveTurnToolSurface({ turnTools: turn, sessionTools: session, ownerOnlyDenied: new Set(["sessions_spawn"]) });
    assert.equal(restricted.callableTools.some(tool => tool.name === "sessions_spawn"), false, label + " upstream owner-only restriction"); checks++;
    assert.equal(restricted.tools.find(tool => tool.name === "sessions_spawn").gated, true, label + " gated owner-only tool"); checks++;
  }
}
console.log(JSON.stringify({ ok: true, checks, hasSessionProjection, networkCalls: 0 }));
