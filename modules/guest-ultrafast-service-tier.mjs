// Port-модуль метки guest-ultrafast-service-tier (new 2026-10-01, v2 2026-10-01: список сессий из файла; OpenClaw 2026.9.7;
// target=builtin-openclaw chunk, region src/agents/embedded-agent-runner/attempt-transport (prepareEmbeddedAttemptTransport)). Guest-модуль (INCLUDE_GUEST=1).
// Задача: OpenAI service tier "ultrafast" ПО УМОЛЧАНИЮ только для перечисленных сессий — изначально Telegram guest-сессии
// (sessionKey с сегментом ":guest:", формат agent:<id>:telegram:…:guest:<userId>-at-<chatId>, создают guest-session-per-chat /
// telegram-guest-mode-bot.2), с v2 — плюс любые ключи из файла <OPENCLAW_STATE_DIR | $HOME/.openclaw>/hotfix-ultrafast-sessions.json (например,
// группа agent:<agent>:telegram:group:<groupId> и её топики :topic:<id>). Всем остальным (владелец, субагенты
// agent:<id>:subagent:…, cron) — как было (/fast → priority, который санитайзер ChatGPT-бэкенда вырезает; см. openai-ultrafast-tier.2).
// Вместо глобального params.serviceTier:"ultrafast" в конфиге агентов дефолт живёт в коде
// на уровне попытки (attempt), где есть и sessionKey, и provider/modelId/config.
//
// Файл правил (горячий выключатель, читается при каждом резолве с кэшем по mtime+size — один statSync на попытку):
//   { "enabled": true, "sessionKeyIncludes": [":guest:"], "sessionKeyPrefixes": ["agent:<agent>:telegram:group:<groupId>"], "sessionKeys": [] }
//   includes — подстрока ключа; prefixes — ключ равен префиксу или начинается с "<prefix>:" (топики попадают, соседний chat id с тем же
//   началом — нет); sessionKeys — точные ключи; enabled:false — выключить всё. Нет файла / битый JSON / не объект → встроенный дефолт
//   { sessionKeyIncludes: [":guest:"] } и ОДИН warn в лог (повтор только после смены состояния файла). Путь можно переопределить env
//   OPENCLAW_HOTFIX_ULTRAFAST_SESSIONS_FILE (для офлайн-репро; читается при загрузке модуля).
//
// Место: prepareEmbeddedAttemptTransport собирает streamExtraParamsOverride = { ...attempt.streamParams, fastMode } и передаёт его как
// extraParamsOverride в runtimePlan.transport.resolveExtraParams(...) (build-*.mjs → resolvePreparedExtraParams) или напрямую в
// resolvePreparedExtraParams. Override ложится ПОВЕРХ authored params модели/агента ({ ...resolved, ...override }), поэтому помощник
// сам уступает явному tier: если serviceTier/service_tier задан в attempt.streamParams (параметры рана) или в любом authored-источнике
// (agents.defaults.params, agents.defaults.models[key].params, agents.entries[agentId].models[key].params, agents.entries[agentId].params —
// те же источники, что у resolveModelExtraParamSources), override не добавляется — явный params.serviceTier агента приоритетнее.
// Дальше апстрим: provider-stream «openai-responses-defaults» — resolveOpenAIServiceTier(ctx.extraParams) (принимает "ultrafast" после
// openai-ultrafast-tier.1) → createOpenAIServiceTierWrapper ставит payload.service_tier; при наличии tier fast-mode-обёртка не ставится.
// Ограничение по замыслу: только provider === "openai" (у других провайдеров поле либо игнорируется, либо отвергается с warn);
// фолбэки google/anthropic/mws не трогаются. Маршрут gpt-6-astra — embedded api openai-chatgpt-responses (ChatGPT OAuth; все guest-сессии
// в sessions.<agent>.sqlite имеют agentHarnessId=openclaw); Codex app-server не используется (его закрывает внешний codex-ultrafast-fast-service-tier).
// В чанке доступны `fs` (import fs from "node:fs") и `log$6` (import { t as log$6 } from "./logger-*.mjs") — helper использует их.
// Апгрейд v1 → v2: patch() заменяет старый регион helper'а целиком (регион между маркером и его //#endregion), строка spread не меняется.
// Kit v1.2.0 (optional module, --with-ultrafast): rules file resolved at runtime from
//   OPENCLAW_HOTFIX_ULTRAFAST_SESSIONS_FILE, else <OPENCLAW_STATE_DIR | $HOME/.openclaw>/hotfix-ultrafast-sessions.json
// Requires openai-ultrafast-tier.1/.2 (same optional set): vanilla normalizeOpenAIServiceTier rejects "ultrafast".
import { replaceOnce, insertBefore, contains, notContains, rulesFileExpression } from "../lib/patch-helpers.mjs";
const MARK = "hotfix: guest-ultrafast-service-tier";
const V2_MARK = "hotfix: guest-ultrafast-service-tier v2 (rules file)";
export const label = "guest-ultrafast-service-tier";
export const verdict = "port";
export const target = {
  key: "builtinOpenclaw",
  label: "builtin-openclaw chunk (prepareEmbeddedAttemptTransport)",
  needles: [
    "async function prepareEmbeddedAttemptTransport(input) {",
    "\tconst streamExtraParamsOverride = {\n\t\t...attempt.streamParams,\n",
  ],
};
const REGION_START = `//#region ${MARK}`;
const REGION_END = "//#endregion\n";
const HELPER_MARK = "function resolveGuestUltrafastServiceTierOverride(attempt, agentId) {";
const RULES_FN_MARK = "function loadHotfixUltrafastRules() {";
const MATCH_FN_MARK = "function hotfixUltrafastSessionMatches(sessionKey) {";
const HELPER = [
  `//#region ${MARK} (2026-10-01; ${V2_MARK}) — перечисленные сессии (дефолт: ":guest:"; файл hotfix-ultrafast-sessions.json в state dir) по умолчанию ходят на OpenAI с service_tier "ultrafast"; явный serviceTier рана/модели/агента важнее`,
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
const count = (s, n) => s.split(n).length - 1;
function replaceHelperRegion(source) {
  const start = source.indexOf(REGION_START);
  if (start === -1) return insertBefore(source, ANCHOR, HELPER, "guest-ultrafast helper before prepareEmbeddedAttemptTransport");
  const endIdx = source.indexOf(REGION_END, start);
  if (endIdx === -1) throw new Error("guest-ultrafast: region start without //#endregion");
  if (source.indexOf(REGION_START, start + REGION_START.length) !== -1) throw new Error("guest-ultrafast: ambiguous helper region");
  return `${source.slice(0, start)}${HELPER}${source.slice(endIdx + REGION_END.length)}`;
}
export function patch(source) {
  if (source.includes(HELPER) && source.includes(AFTER)) return source;
  let out = source;
  if (!out.includes(HELPER)) out = replaceHelperRegion(out); // свежая вставка или апгрейд v1 → v2
  if (!out.includes(AFTER)) out = replaceOnce(out, BEFORE, AFTER, "streamExtraParamsOverride: guest ultrafast default");
  return out;
}
export const check = { gate: "required", assertions: [
  contains(MARK, "маркер guest-ultrafast-service-tier"),
  contains(V2_MARK, "маркер v2 (rules file)"),
  contains(HELPER, "актуальный helper-регион целиком (v2)"),
  contains(AFTER, "streamExtraParamsOverride с guest-ultrafast override"),
  contains(`const HOTFIX_ULTRAFAST_SESSIONS_FILE = ${rulesFileExpression("OPENCLAW_HOTFIX_ULTRAFAST_SESSIONS_FILE", "hotfix-ultrafast-sessions.json")};`, "rules file resolved from env / OpenClaw state dir (not hard-coded)"),
  (c) => /"\/[^"\n]*\/\.openclaw\/hotfix-ultrafast-sessions\.json"/.test(c) ? "unexpected hard-coded host-specific rules path" : null,
  contains("sessionKeyIncludes: [\":guest:\"],", "встроенный дефолт :guest:"),
  contains("if (attempt.provider !== \"openai\") return {};", "ограничение provider openai"),
  contains("return { serviceTier: \"ultrafast\" };", "дефолт ultrafast"),
  notContains(BEFORE, "непропатченный streamExtraParamsOverride"),
  notContains("if (typeof sessionKey !== \"string\" || !sessionKey.includes(\":guest:\")) return {};", "остаток v1-гейта по :guest:"),
  // зависимости helper'а присутствуют в чанке (fs и логгер)
  contains("import fs from \"node:fs\";", "import fs в чанке"),
  contains("as log$6 } from \"./logger-", "import log$6 в чанке"),
  // дрейф: override должен по-прежнему уходить в оба пути резолва (runtimePlan.transport.resolveExtraParams и resolvePreparedExtraParams)
  (c) => count(c, "extraParamsOverride: streamExtraParamsOverride") === 2 ? null : `ожидалось 2 передачи streamExtraParamsOverride как extraParamsOverride, найдено ${count(c, "extraParamsOverride: streamExtraParamsOverride")}`,
  // дрейф: helper-регион ровно один, helper объявлен/вызван по одному разу
  (c) => count(c, REGION_START) === 1 && count(c, HELPER_MARK) === 1 && count(c, RULES_FN_MARK) === 1 && count(c, MATCH_FN_MARK) === 1 && count(c, "resolveGuestUltrafastServiceTierOverride(attempt, input.sessionAgentId)") === 1 ? null : "helper guest-ultrafast объявлен/вызван не по одному разу",
] };
