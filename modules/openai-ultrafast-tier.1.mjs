// Module openai-ultrafast-tier.1 (optional set; openai-fast-mode chunk, region src/llm/providers/openai-fast-mode.ts).
// normalizeOpenAIServiceTier accepts "ultrafast" (OpenAI Ultrafast mode: service_tier "ultrafast").
// Set openai-ultrafast-tier.1–.2: upstream normalizeOpenAIServiceTier passes only auto/default/flex/priority, so
// params.serviceTier:"ultrafast" was ignored with a warning; and the @openclaw/ai transport (prepareRequest) runs
// sanitizeOpenAICodexResponsesParams after the onPayload hooks and strips service_tier entirely for the ChatGPT
// backend — on the ChatGPT OAuth route no tier arrived at all (/fast priority included).
// Fix (behaviour without the parameter unchanged):
//   .1 normalizeOpenAIServiceTier accepts "ultrafast" → an explicit params.serviceTier wins over /fast (upstream branch in provider-stream);
//   .2 the ChatGPT backend sanitizer keeps service_tier only when it is exactly "ultrafast" (priority and the rest are stripped as upstream does).
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
const MARK = "hotfix: openai-ultrafast-tier";
export const label = "openai-ultrafast-tier.1";
export const target = {
  key: "openaiFastMode",
  label: "openai-fast-mode chunk (normalizeOpenAIServiceTier)",
  needles: [
    "//#region src/llm/providers/openai-fast-mode.ts",
    "function normalizeOpenAIServiceTier(value) {",
  ],
};
const BEFORE = `return normalized === "auto" || normalized === "default" || normalized === "flex" || normalized === "priority" ? normalized : void 0;`;
const AFTER = `return normalized === "auto" || normalized === "default" || normalized === "flex" || normalized === "priority" || normalized === "ultrafast" /* ${MARK} */ ? normalized : void 0;`;
export function patch(source) {
  if (source.includes(AFTER)) return source;
  return replaceOnce(source, BEFORE, AFTER, "normalizeOpenAIServiceTier: accept ultrafast");
}
export const check = { assertions: [
  contains(AFTER, "normalizeOpenAIServiceTier accepts ultrafast"),
] };
