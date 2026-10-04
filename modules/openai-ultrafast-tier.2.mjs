// Module openai-ultrafast-tier.2 (optional set; @openclaw/ai from the package's node_modules, region
// packages/ai/src/transports/openai-responses-params-internal.ts; plan ULTRAFAST_AI_PLAN, corpus node_modules/@openclaw/ai/dist).
// sanitizeOpenAICodexResponsesParams strips service_tier for the ChatGPT backend (OPENAI_CODEX_RESPONSES_UNSUPPORTED_PARAMS)
// inside the transport's prepareRequest — after the onPayload wrappers — so neither /fast (priority) nor params.serviceTier
// reached the ChatGPT backend. Now exactly "ultrafast" is kept (opt-in through params.serviceTier); priority/auto/default/
// flex are stripped as upstream does. Context: openai-ultrafast-tier.1.mjs.
import { replaceOnce, contains, notContains } from "../lib/patch-helpers.mjs";
const MARK = "hotfix: openai-ultrafast-tier";
export const label = "openai-ultrafast-tier.2";
export const target = {
  key: "aiOpenAIResponsesParams",
  label: "@openclaw/ai openai-responses-params-internal chunk (sanitizeOpenAICodexResponsesParams)",
  needles: [
    "//#region packages/ai/src/transports/openai-responses-params-internal.ts",
    "function sanitizeOpenAICodexResponsesParams(model, params) {",
  ],
};
const HEAD = "function sanitizeOpenAICodexResponsesParams(model, params) {\n\tif (!usesNativeOpenAICodexResponsesBackend(model)) return params;\n";
const BEFORE = `${HEAD}\tfor (const key of OPENAI_CODEX_RESPONSES_UNSUPPORTED_PARAMS) delete params[key];\n`;
const TAIL = "\tfor (const key of OPENAI_CODEX_RESPONSES_UNSUPPORTED_PARAMS) delete params[key];\n\tif (keepUltrafastServiceTier) params.service_tier = \"ultrafast\";\n";
// kit v1.2.0 line (Russian comment) — recognized for the in-place upgrade
const AFTER_V120 = `${HEAD}\tconst keepUltrafastServiceTier = params.service_tier === "ultrafast"; /* ${MARK}: ChatGPT Pro Ultrafast; остальные tier вырезаются, как в апстриме */\n${TAIL}`;
const AFTER = `${HEAD}\tconst keepUltrafastServiceTier = params.service_tier === "ultrafast"; /* ${MARK}: keep OpenAI Ultrafast; other tiers are stripped as upstream does */\n${TAIL}`;
export function patch(source) {
  if (source.includes(AFTER)) return source;
  if (source.includes(AFTER_V120)) return replaceOnce(source, AFTER_V120, AFTER, "sanitizeOpenAICodexResponsesParams: comment upgrade v1.2.0 → v1.2.1");
  return replaceOnce(source, BEFORE, AFTER, "sanitizeOpenAICodexResponsesParams: keep ultrafast service_tier");
}
export const check = { assertions: [
  contains(AFTER, "ChatGPT codex backend keeps service_tier=ultrafast"),
  notContains(AFTER_V120, "kit v1.2.0 revision remnant"),
] };
