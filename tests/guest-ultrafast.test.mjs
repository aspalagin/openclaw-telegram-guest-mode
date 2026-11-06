import vm from "node:vm";
import assert from "node:assert/strict";
import { Corpus, walkJs } from "../lib/kit.mjs";

const dist = process.argv[2];
if (!dist) throw new Error("Pass the dist directory of a disposable package patched with --with-ultrafast");
const corpus = new Corpus(walkJs(dist));
const source = corpus.read(corpus.findOne("ultrafast helper", ["function resolveGuestUltrafastServiceTierOverride(attempt, agentId) {"]));
const logger = source.match(/import \{ \w+ as (log\$\d+) \} from "\.\/logger-[\w-]+\.mjs";/)[1];
let warnings = 0;
const box = {
  process: { env: { OPENCLAW_HOTFIX_ULTRAFAST_SESSIONS_FILE: "/synthetic-rules" } },
  fs: { statSync() { throw new Error("synthetic missing rules"); } },
  [logger]: { warn() { warnings++; }, info() {} },
};
vm.createContext(box);
const start = source.indexOf("//#region hotfix: guest-ultrafast-service-tier");
const end = source.indexOf("//#endregion", start);
assert.ok(start >= 0 && end > start);
vm.runInContext(source.slice(start, end), box);
const attempt = { sessionKey: "agent:test:guest:fixture", provider: "openai", modelId: "fixture" };
assert.equal(box.resolveGuestUltrafastServiceTierOverride(attempt).serviceTier, "ultrafast");
assert.equal(box.resolveGuestUltrafastServiceTierOverride({ ...attempt, sessionKey: "agent:test:main" }).serviceTier, undefined);
assert.equal(box.resolveGuestUltrafastServiceTierOverride({ ...attempt, provider: "anthropic" }).serviceTier, undefined);
assert.equal(box.resolveGuestUltrafastServiceTierOverride({ ...attempt, streamParams: { serviceTier: "priority" } }).serviceTier, undefined);
assert.equal(box.resolveGuestUltrafastServiceTierOverride({ ...attempt, config: { agents: { defaults: { params: { serviceTier: "priority" } } } } }).serviceTier, undefined);
assert.equal(warnings, 1, "the actual imported logger handles missing rules once");
console.log(JSON.stringify({ ok: true, checks: 6, logger, networkCalls: 0 }));
