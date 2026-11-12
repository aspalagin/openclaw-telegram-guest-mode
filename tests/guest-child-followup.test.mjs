// Execute the installed dispatch function with mocked admission/registry I/O.
// The guest ownership and inline delivery registry is the real patched code.
import vm from "node:vm";
import assert from "node:assert/strict";
import { registry, S, source, networkCalls } from "./guest-ownership-fixture.mjs";

const code = source("child-followup");
const start = code.indexOf("async function dispatchSessionsSendFollowup(");
assert.ok(start >= 0);
const dispatch = code.slice(start, code.indexOf("\n}", start) + 2).replace(
  /await import\("\.\/subagent-registry-[^"/]+\.mjs"\)/,
  "globalThis.mockSubagentRegistry",
);
assert.ok(dispatch.includes("globalThis.mockSubagentRegistry"));

function harness({ session = S, parent = "parent-B", acceptedRun = "child-B", admissionOk = true, steered = false } = {}) {
  const h = registry();
  const registered = [];
  const child = "agent:test:subagent:reused-child";
  const ownerAtRegistration = [];
  const active = steered ? { ok: true, targetDisposition: "steered", steeredRunId: "child-A" } : {};
  Object.assign(h.box, {
    captureGatewayToolCallerAssertion: () => () => {},
    getGatewayToolCallerIdentity: () => undefined,
    getLatestLiveSubagentRunByChildSessionKey: () => ({ runId: "child-A", childSessionKey: child }),
    isCronRunSessionKey: () => false,
    trySessionsSendActiveRunDelivery: async () => active,
    prepareSessionsSendFollowup: async () => ({ custody: { assertCurrent() {}, run: fn => fn(), release() {} } }),
    startSessionsSendFollowup: async (_request, params) => {
      params.assertDispatchCurrent?.();
      return { start: { ok: admissionOk, runId: acceptedRun, targetDisposition: "queued" } };
    },
    registerSessionStateWatch: async () => true,
    prepareGatewayToolCallerAssertion: () => {},
    jsonResult: details => ({ details }),
    mockSubagentRegistry: {
      async registerSubagentRun(entry, guards) {
        guards.assertCurrent();
        guards.assertPublicationCurrent();
        registered.push(entry);
        // Completion may be observed during publication, before dispatch returns.
        ownerAtRegistration.push(h.r.resolveOwner(session, { runId: entry.runId }));
      },
      async adoptSubagentRunForRequesterTurn({ expected }) { return expected; },
    },
  });
  vm.runInContext(dispatch, h.box);
  const run = () => h.box.dispatchSessionsSendFollowup({
    runId: "admission-id", allowActiveRunQueueDelivery: true,
    sessionStoreTarget: { canonicalKey: child, agentId: "test" },
    sendParams: { agentId: "test" },
  }, {
    requesterSessionKey: session, requesterSession: { sessionId: "requester-session" },
    requesterOrigin: { channel: "telegram" }, replyMode: "one-way",
  }, {
    requesterSessionKey: session, requesterAgentId: "test", requesterTurnRunId: parent,
    nativeChild: true, ownChild: true, watch: steered, message: "Continue the task",
  });
  return { ...h, run, registered, ownerAtRegistration };
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("PASS " + name); }
  catch (error) { failed++; console.error("FAIL " + name + ": " + error.stack); }
}
function arm(h, query, parent) {
  h.answered(h.arm(query));
  if (parent) assert.equal(h.r.bindRun(S, parent, query), true);
}

await test("reused child binds accepted followup to B before publication; newer C cannot capture its final", async () => {
  const h = harness();
  arm(h, "A", "parent-A");
  h.r.bindBatch(S, "child-A", ["parent-A"]);
  arm(h, "B", "parent-B");
  const result = await h.run();
  assert.equal(result.registryCompletion, true);
  assert.equal(h.registered.length, 1);
  assert.equal(h.ownerAtRegistration[0]?.guestQueryId, "B");
  assert.equal(h.r.byRun.has("admission-id"), false, "use the accepted run ID");
  arm(h, "C", "parent-C");
  assert.equal(h.r.bindBatch(S, "settle-B", ["child-B"]), true);
  const delivered = await h.r.deliverPayloads(S, [{ text: "Followup result" }], { runId: "settle-B" });
  assert.equal(delivered.delivered, true);
  assert.equal(h.calls.at(-1).edit.inline_message_id, "inline-B");
  assert.equal(h.r.resolveOwner(S, { runId: "child-A" }).guestQueryId, "A");
  await h.run();
  assert.equal(h.r.resolveOwner(S, { runId: "child-B" }).guestQueryId, "B", "replay is idempotent");
});

await test("unknown parent cannot inherit the most recent guest query", async () => {
  const h = harness({ parent: "unknown" });
  arm(h, "B", "parent-B");
  await h.run();
  assert.equal(h.ownerAtRegistration[0], undefined);
  assert.equal(h.r.bindBatch(S, "settle-unknown", ["child-B"]), false);
  assert.equal((await h.r.deliverPayloads(S, [{ text: "must not send" }], { runId: "child-B" })).delivered, false);
  assert.equal(h.calls.length, 0);
});

await test("conflicting accepted run ownership fails closed", async () => {
  const h = harness();
  arm(h, "A", "parent-A");
  h.r.bindBatch(S, "child-B", ["parent-A"]);
  arm(h, "B", "parent-B");
  await h.run();
  assert.equal(h.ownerAtRegistration[0], undefined);
  assert.equal(h.r.byRun.get("child-B"), null);
  assert.equal((await h.r.deliverPayloads(S, [{ text: "must not send" }], { runId: "child-B" })).delivered, false);
  assert.equal(h.calls.length, 0);
});

await test("failed admission creates neither a binding nor registry entry", async () => {
  const h = harness({ admissionOk: false });
  arm(h, "B", "parent-B");
  assert.equal((await h.run()).registryCompletion, false);
  assert.equal(h.registered.length, 0);
  assert.equal(h.r.byRun.has("child-B"), false);
});

await test("ordinary requester keeps its normal child completion", async () => {
  const h = harness({ session: "agent:test:main" });
  assert.equal((await h.run()).registryCompletion, true);
  assert.equal(h.registered.length, 1);
  assert.equal(h.r.byRun.size, 0);
});

await test("steering an existing child never rebinds its original guest query", async () => {
  const h = harness({ steered: true });
  arm(h, "A", "parent-A");
  h.r.bindBatch(S, "child-A", ["parent-A"]);
  arm(h, "B", "parent-B");
  assert.equal((await h.run()).registryCompletion, true);
  assert.equal(h.registered.length, 0);
  assert.equal(h.r.resolveOwner(S, { runId: "child-A" }).guestQueryId, "A");
});

assert.equal(networkCalls, 0);
console.log(JSON.stringify({ passed, failed, networkCalls }));
process.exitCode = failed ? 1 : 0;
