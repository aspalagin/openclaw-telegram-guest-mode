// Port-модуль метки openai-ultrafast-tier.1 (new 2026-09-29; target=minimax-fast-mode chunk, region src/llm/providers/openai-fast-mode.ts).
// normalizeOpenAIServiceTier принимает "ultrafast" (docs: developers.openai.com/api/docs/guides/ultrafast-mode).
// Метки openai-ultrafast-tier.1–.2 + внешняя codex-ultrafast-fast-service-tier (new 2026-09-29; OpenClaw 2026.9.6, @openclaw/ai из того же пакета).
// Задача: режим OpenAI Ultrafast (`service_tier: "ultrafast"`, ChatGPT Pro $500 / API) для openai/gpt-6-astra по требованию.
// Включение — штатный явный tier: params.serviceTier: "ultrafast" у модели (глобально или agents.entries.<id>.models[...] — только этому агенту).
// /fast для этого не годится: agents.defaults.fastModeDefault=true и у всех агентов → /fast on и так включён по умолчанию.
// Что было в 9.6 (офлайн-репро payload, --expect vanilla):
//   - normalizeOpenAIServiceTier пропускал только auto/default/flex/priority → params.serviceTier:"ultrafast" игнорировался с warn;
//   - транспорт @openclaw/ai (prepareRequest) после onPayload вызывает sanitizeOpenAICodexResponsesParams и для
//     chatgpt.com/backend-api/codex вырезает service_tier целиком — на маршруте ChatGPT OAuth tier не доходил вообще (и /fast priority тоже).
// Фикс (без параметра поведение прежнее):
//   .1 normalizeOpenAIServiceTier принимает "ultrafast" → явный params.serviceTier выигрывает у /fast (ветка апстрима в provider-stream);
//   .2 санитайзер ChatGPT-бэкенда оставляет service_tier, только если он ровно "ultrafast" (priority и прочие вырезаются, как в апстриме).
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
const MARK = "hotfix: openai-ultrafast-tier";
export const label = "openai-ultrafast-tier.1";
export const verdict = "port";
export const target = {
 "key": "openaiFastMode",
 "label": "openai-fast-mode chunk (normalizeOpenAIServiceTier)",
 "needles": [
  "//#region src/llm/providers/openai-fast-mode.ts",
  "function normalizeOpenAIServiceTier(value) {"
 ]
};
const BEFORE = `return normalized === "auto" || normalized === "default" || normalized === "flex" || normalized === "priority" ? normalized : void 0;`;
const AFTER = `return normalized === "auto" || normalized === "default" || normalized === "flex" || normalized === "priority" || normalized === "ultrafast" /* ${MARK} */ ? normalized : void 0;`;
export function patch(source) {
  if (source.includes(AFTER)) return source;
  return replaceOnce(source, BEFORE, AFTER, "normalizeOpenAIServiceTier: accept ultrafast");
}
export const check = { gate: "required", assertions: [
      contains(AFTER, "normalizeOpenAIServiceTier accepts ultrafast"),
    ] };
