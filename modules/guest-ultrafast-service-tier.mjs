// Module guest-ultrafast-service-tier (optional set, --with-ultrafast; builtin-openclaw chunk, region
// src/agents/embedded-agent-runner/attempt-transport, prepareEmbeddedAttemptTransport).
// OpenAI service tier "ultrafast" BY DEFAULT only for listed sessions — Telegram guest sessions out of the box (sessionKey
// with the ":guest:" segment, format agent:<id>:telegram:…:guest:<userId>-at-<chatId>, created by guest-session-per-chat /
// telegram-guest-mode-bot.2) plus any keys from the rules file. Everyone else (owner, sub-agents agent:<id>:subagent:…,
// cron) keeps the upstream behaviour (/fast → priority, which the ChatGPT backend sanitizer strips; see
// openai-ultrafast-tier.2). The default lives in code at attempt level, where sessionKey, provider, modelId and config
// are all available, instead of a global params.serviceTier.
//
// Rules file (hot switch, read on every resolve with an mtime+size cache — one statSync per attempt):
//   OPENCLAW_HOTFIX_ULTRAFAST_SESSIONS_FILE, else <OPENCLAW_STATE_DIR | $HOME/.openclaw>/hotfix-ultrafast-sessions.json
//   { "enabled": true, "sessionKeyIncludes": [":guest:"], "sessionKeyPrefixes": ["agent:<agent>:telegram:group:<groupId>"], "sessionKeys": [] }
//   includes — substring of the key; prefixes — the key equals the prefix or starts with "<prefix>:" (topics match, a
//   neighbouring chat id with the same leading digits does not); sessionKeys — exact keys; enabled:false — off. Missing
//   file / invalid JSON / not an object → built-in default { sessionKeyIncludes: [":guest:"] } and ONE warning
//   (repeated only after the file state changes).
//
// Placement: prepareEmbeddedAttemptTransport builds streamExtraParamsOverride = { ...attempt.streamParams, fastMode } and
// passes it as extraParamsOverride to runtimePlan.transport.resolveExtraParams(...) (build-*.mjs → resolvePreparedExtraParams)
// or directly to resolvePreparedExtraParams. The override lands ON TOP of the authored params of the model/agent
// ({ ...resolved, ...override }), so the helper yields to an explicit tier: when serviceTier/service_tier is set in
// attempt.streamParams (run params) or in any authored source (agents.defaults.params, agents.defaults.models[key].params,
// agents.entries[agentId].models[key].params, agents.entries[agentId].params — the same sources as
// resolveModelExtraParamSources), the override is not added. Downstream: the provider-stream "openai-responses-defaults"
// → resolveOpenAIServiceTier(ctx.extraParams) (accepts "ultrafast" after openai-ultrafast-tier.1) →
// createOpenAIServiceTierWrapper sets payload.service_tier; with a tier present the fast-mode wrapper is not applied.
// By design only provider === "openai" (other providers ignore or reject the field); fallbacks to other providers are untouched.
// Available in the chunk: `fs` (import fs from "node:fs") and `log$6` (import { t as log$6 } from "./logger-*.mjs").
// Requires openai-ultrafast-tier.1/.2 (same optional set): vanilla normalizeOpenAIServiceTier rejects "ultrafast".
import { replaceOnce, replaceRegion, contains, notContains, count, rulesFileExpression } from "../lib/patch-helpers.mjs";
const MARK = "hotfix: guest-ultrafast-service-tier";
const V2_MARK = "hotfix: guest-ultrafast-service-tier v2 (rules file)";
export const label = "guest-ultrafast-service-tier";
export const target = {
  key: "builtinOpenclaw",
  label: "builtin-openclaw chunk (prepareEmbeddedAttemptTransport)",
  needles: [
    "async function prepareEmbeddedAttemptTransport(input) {",
    "\tconst streamExtraParamsOverride = {\n\t\t...attempt.streamParams,\n",
  ],
};
const REGION_START = `//#region ${MARK}`;
const HELPER_MARK = "function resolveGuestUltrafastServiceTierOverride(attempt, agentId) {";
const RULES_FN_MARK = "function loadHotfixUltrafastRules() {";
const MATCH_FN_MARK = "function hotfixUltrafastSessionMatches(sessionKey) {";
const HELPER = [
  `//#region ${MARK} (${V2_MARK}): listed sessions (default ":guest:"; hotfix-ultrafast-sessions.json in the state dir) go to OpenAI with service_tier "ultrafast" by default; an explicit serviceTier of the run/model/agent wins`,
  `const HOTFIX_ULTRAFAST_SESSIONS_FILE = ${rulesFileExpression("OPENCLAW_HOTFIX_ULTRAFAST_SESSIONS_FILE", "hotfix-ultrafast-sessions.json")};`,
  "const HOTFIX_ULTRAFAST_DEFAULT_RULES = Object.freeze({",
  "\tenabled: true,",
  "\tsessionKeyIncludes: [\":guest:\"],",
  "\tsessionKeyPrefixes: [],",
  "\tsessionKeys: []",
  "});",
  "let hotfixUltrafastRulesCache = {",
  "\tstamp: null,",
  "\trules: null,",
  "\twarned: null",
  "};",
  "function hotfixUltrafastStrings(value) {",
  "\treturn Array.isArray(value) ? value.filter((item) => typeof item === \"string\" && item.length > 0) : [];",
  "}",
  "function hotfixUltrafastWarnOnce(kind, detail) {",
  "\tif (hotfixUltrafastRulesCache.warned === kind) return;",
  "\thotfixUltrafastRulesCache.warned = kind;",
  "\tlog$6.warn(`[hotfix][guest-ultrafast] rules file ${kind} (${HOTFIX_ULTRAFAST_SESSIONS_FILE}): ${detail}; using built-in default [\":guest:\"]`);",
  "}",
  RULES_FN_MARK,
  "\tlet stat;",
  "\ttry {",
  "\t\tstat = fs.statSync(HOTFIX_ULTRAFAST_SESSIONS_FILE);",
  "\t} catch (err) {",
  "\t\tif (hotfixUltrafastRulesCache.stamp !== \"missing\") {",
  "\t\t\thotfixUltrafastWarnOnce(\"missing\", String(err?.message ?? err));",
  "\t\t\thotfixUltrafastRulesCache.stamp = \"missing\";",
  "\t\t\thotfixUltrafastRulesCache.rules = HOTFIX_ULTRAFAST_DEFAULT_RULES;",
  "\t\t}",
  "\t\treturn hotfixUltrafastRulesCache.rules;",
  "\t}",
  "\tconst stamp = `${stat.mtimeMs}:${stat.size}`;",
  "\tif (hotfixUltrafastRulesCache.rules && hotfixUltrafastRulesCache.stamp === stamp) return hotfixUltrafastRulesCache.rules;",
  "\tlet rules = HOTFIX_ULTRAFAST_DEFAULT_RULES;",
  "\ttry {",
  "\t\tconst parsed = JSON.parse(fs.readFileSync(HOTFIX_ULTRAFAST_SESSIONS_FILE, \"utf8\"));",
  "\t\tif (!parsed || typeof parsed !== \"object\" || Array.isArray(parsed)) throw new Error(\"root must be a JSON object\");",
  "\t\trules = Object.freeze({",
  "\t\t\tenabled: parsed.enabled !== false,",
  "\t\t\tsessionKeyIncludes: hotfixUltrafastStrings(parsed.sessionKeyIncludes),",
  "\t\t\tsessionKeyPrefixes: hotfixUltrafastStrings(parsed.sessionKeyPrefixes),",
  "\t\t\tsessionKeys: hotfixUltrafastStrings(parsed.sessionKeys)",
  "\t\t});",
  "\t\thotfixUltrafastRulesCache.warned = null;",
  "\t\tlog$6.info(`[hotfix][guest-ultrafast] rules loaded: enabled=${rules.enabled} includes=${rules.sessionKeyIncludes.length} prefixes=${rules.sessionKeyPrefixes.length} keys=${rules.sessionKeys.length}`);",
  "\t} catch (err) {",
  "\t\thotfixUltrafastWarnOnce(\"invalid\", String(err?.message ?? err));",
  "\t}",
  "\thotfixUltrafastRulesCache.stamp = stamp;",
  "\thotfixUltrafastRulesCache.rules = rules;",
  "\treturn rules;",
  "}",
  MATCH_FN_MARK,
  "\tconst rules = loadHotfixUltrafastRules();",
  "\tif (!rules.enabled) return false;",
  "\tif (rules.sessionKeys.includes(sessionKey)) return true;",
  "\tif (rules.sessionKeyIncludes.some((part) => sessionKey.includes(part))) return true;",
  "\treturn rules.sessionKeyPrefixes.some((prefix) => sessionKey === prefix || sessionKey.startsWith(prefix.endsWith(\":\") ? prefix : `${prefix}:`));",
  "}",
  HELPER_MARK,
  "\tconst sessionKey = attempt?.sessionKey;",
  "\tif (typeof sessionKey !== \"string\" || !sessionKey || !hotfixUltrafastSessionMatches(sessionKey)) return {};",
  "\tif (attempt.provider !== \"openai\") return {};",
  "\tconst hasTier = (source) => source != null && typeof source === \"object\" && (Object.hasOwn(source, \"serviceTier\") || Object.hasOwn(source, \"service_tier\"));",
  "\tif (hasTier(attempt.streamParams)) return {};",
  "\tconst agents = attempt.config?.agents;",
  "\tconst modelId = typeof attempt.modelId === \"string\" ? attempt.modelId.trim() : \"\";",
  "\tconst key = modelId ? `openai/${modelId}` : void 0;",
  "\tconst entries = agents?.entries;",
  "\tconst agentEntry = agentId && entries && typeof entries === \"object\" ? entries[agentId] : void 0;",
  "\tconst sources = [",
  "\t\tagents?.defaults?.params,",
  "\t\tkey ? agents?.defaults?.models?.[key]?.params : void 0,",
  "\t\tkey ? agentEntry?.models?.[key]?.params : void 0,",
  "\t\tagentEntry?.params",
  "\t];",
  "\tif (sources.some(hasTier)) return {};",
  "\treturn { serviceTier: \"ultrafast\" };",
  "}",
  "//#endregion",
  "",
].join("\n");
const ANCHOR = "async function prepareEmbeddedAttemptTransport(input) {";
const BEFORE = "\tconst streamExtraParamsOverride = {\n\t\t...attempt.streamParams,\n\t\tfastMode: attempt.fastMode\n\t};\n";
const AFTER = `\tconst streamExtraParamsOverride = {\n\t\t...attempt.streamParams,\n\t\tfastMode: attempt.fastMode,\n\t\t...resolveGuestUltrafastServiceTierOverride(attempt, input.sessionAgentId) /* ${MARK} */\n\t};\n`;
export function patch(source) {
  if (source.includes(HELPER) && source.includes(AFTER)) return source;
  let out = source;
  if (!out.includes(HELPER)) out = replaceRegion(out, { start: REGION_START, body: HELPER, anchor: ANCHOR, label: "guest-ultrafast helper before prepareEmbeddedAttemptTransport" }); // fresh insert or upgrade of an earlier revision
  if (!out.includes(AFTER)) out = replaceOnce(out, BEFORE, AFTER, "streamExtraParamsOverride: guest ultrafast default");
  return out;
}
export const check = { assertions: [
  contains(MARK, "guest-ultrafast-service-tier marker"),
  contains(V2_MARK, "v2 marker (rules file)"),
  contains(HELPER, "current helper region (whole)"),
  contains(AFTER, "streamExtraParamsOverride with the guest-ultrafast override"),
  contains(`const HOTFIX_ULTRAFAST_SESSIONS_FILE = ${rulesFileExpression("OPENCLAW_HOTFIX_ULTRAFAST_SESSIONS_FILE", "hotfix-ultrafast-sessions.json")};`, "rules file resolved from env / OpenClaw state dir (not hard-coded)"),
  (c) => /HOTFIX_ULTRAFAST_SESSIONS_FILE = "\//.test(c) ? "hard-coded absolute rules path" : null,
  contains("sessionKeyIncludes: [\":guest:\"],", "built-in default :guest:"),
  contains("if (attempt.provider !== \"openai\") return {};", "provider restricted to openai"),
  contains("return { serviceTier: \"ultrafast\" };", "ultrafast default"),
  notContains(BEFORE, "unpatched streamExtraParamsOverride"),
  notContains("if (typeof sessionKey !== \"string\" || !sessionKey.includes(\":guest:\")) return {};", "v1 :guest: gate remnant"),
  // helper dependencies present in the chunk (fs and the logger)
  contains("import fs from \"node:fs\";", "import fs in the chunk"),
  contains("as log$6 } from \"./logger-", "import log$6 in the chunk"),
  // drift: the override must still reach both resolve paths (runtimePlan.transport.resolveExtraParams and resolvePreparedExtraParams)
  (c) => count(c, "extraParamsOverride: streamExtraParamsOverride") === 2 ? null : `expected streamExtraParamsOverride passed as extraParamsOverride 2 times, found ${count(c, "extraParamsOverride: streamExtraParamsOverride")}`,
  // drift: exactly one helper region; helper declared/called once
  (c) => count(c, REGION_START) === 1 && count(c, HELPER_MARK) === 1 && count(c, RULES_FN_MARK) === 1 && count(c, MATCH_FN_MARK) === 1 && count(c, "resolveGuestUltrafastServiceTierOverride(attempt, input.sessionAgentId)") === 1 ? null : "guest-ultrafast helper declared/called more than once",
] };
