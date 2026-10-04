// Port-модуль метки openai-ultrafast-tier.2 (new 2026-09-29; target=@openclaw/ai (node_modules ядра), region
// packages/ai/src/transports/openai-responses-params-internal.ts; план — AI_PLAN в plan.mjs, корпус node_modules/@openclaw/ai/dist).
// sanitizeOpenAICodexResponsesParams для chatgpt.com/backend-api/codex вырезает service_tier (список OPENAI_CODEX_RESPONSES_UNSUPPORTED_PARAMS),
// причём в prepareRequest транспорта — уже после onPayload обёрток; поэтому ни /fast (priority), ни params.serviceTier до ChatGPT-бэкенда
// не доходили. Теперь сохраняется только ровно "ultrafast" (opt-in через params.serviceTier); priority/auto/default/flex вырезаются, как в апстриме.
// Контекст — openai-ultrafast-tier.1.mjs.
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
const MARK = "hotfix: openai-ultrafast-tier";
export const label = "openai-ultrafast-tier.2";
export const verdict = "port";
export const target = {
 "key": "aiOpenAIResponsesParams",
 "label": "@openclaw/ai openai-responses-params-internal chunk (sanitizeOpenAICodexResponsesParams)",
 "needles": [
  "//#region packages/ai/src/transports/openai-responses-params-internal.ts",
  "function sanitizeOpenAICodexResponsesParams(model, params) {"
 ]
};
const BEFORE = "function sanitizeOpenAICodexResponsesParams(model, params) {\n\tif (!usesNativeOpenAICodexResponsesBackend(model)) return params;\n\tfor (const key of OPENAI_CODEX_RESPONSES_UNSUPPORTED_PARAMS) delete params[key];\n";
const AFTER = "function sanitizeOpenAICodexResponsesParams(model, params) {\n\tif (!usesNativeOpenAICodexResponsesBackend(model)) return params;\n"
  + `\tconst keepUltrafastServiceTier = params.service_tier === "ultrafast"; /* ${MARK}: ChatGPT Pro Ultrafast; остальные tier вырезаются, как в апстриме */\n`
  + "\tfor (const key of OPENAI_CODEX_RESPONSES_UNSUPPORTED_PARAMS) delete params[key];\n"
  + "\tif (keepUltrafastServiceTier) params.service_tier = \"ultrafast\";\n";
export function patch(source) {
  if (source.includes(AFTER)) return source;
  return replaceOnce(source, BEFORE, AFTER, "sanitizeOpenAICodexResponsesParams: keep ultrafast service_tier");
}
export const check = { gate: "required", assertions: [
      contains(AFTER, "ChatGPT codex backend keeps service_tier=ultrafast"),
    ] };
