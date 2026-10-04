// Port-модуль метки guest-deny-delivery-tools (target=agentTools). Переякорено под 2026.9.5, затем под 2026.9.7.
import { replaceOnce, contains, notContains } from "../lib/patch-helpers.mjs";
export const label = "guest-deny-delivery-tools";
export const verdict = "port";
export const target = {
 "key": "agentTools",
 "label": "agent tools policy bundle",
 "needles": [
  "label: \"gateway sender owner-only tools\"",
  "function createEmbeddedMessageInvocationPolicy(params)",
  "const messageInvocationPolicy = createEmbeddedMessageInvocationPolicy({"
 ]
};
// ---- патч под 2026.9.5 ----
// 2026.9.5 (upstream e3e3a349b90, #150166, src/agents/scheduled-message-invocation.ts): сборка политики инструментов
// (applyToolPolicyPipeline + buildConversationToolPolicyPipelineSteps с шагом owner-only) вынесена из тела
// createOpenClawCodingToolsInternal в хелпер createEmbeddedMessageInvocationPolicy(params).filter() — тот же чанк agent-tools-*.
// filter() даёт итоговый набор инструментов рана (subagentFiltered = messageInvocationPolicy.filter()) и переиспользуется
// admission-проверкой scheduled message. `options` внутри хелпера недоступен, поэтому:
//   1) на месте вызова прокидываем guestSessionKey: options?.sessionKey (ровно то, что проверял патч 9.4);
//   2) в additionalStepsAfterSandbox хелпера добавляем гостевой deny-шаг spread'ом (как в 9.4).
// 2026-10-04 (v2, вместе с guest-ack-edit): deny-список сокращён до ["gateway"]. Гость снова может пользоваться
// message/sessions_spawn/cron/nodes (например, фото с телефона через nodes; доставка медиа в сам guest-чат — отдельный пробел).
// Утечки финала в чужой чат по-прежнему закрывают guest-no-chat-fallback / guest-single-answer-guard
// на уровне доставки. Апгрейд v1 → v2 на уже пропатченном чанке: замена строки deny-списка.
// 2026-10-04 (v3): completion-ход субагента в guest-сессии (settle-wake
// `announce:requester-settle:…`, прямой announce `announce:<id>`) получал тот же набор инструментов, что обычный ход гостя, и штатная
// completion-инструкция велела доставить итог messaging-инструментом → `message` ушёл в корень DM владельца (chatId из ключа сессии).
// Для таких ходов финал должен быть ТЕКСТОМ (его дописывает в inline-сообщение гостя guest-ack-edit / guest-announce-final-inline),
// поэтому deny расширяется до ["gateway", "message"] ровно для ранов с runId `announce:` (единый префикс completion-ходов:
// announce-idempotency ANNOUNCE_IDEMPOTENCY_KEY_PREFIX; agent-turn-service проверяет `runId.startsWith("announce:")` и для
// subagent_announce, и для subagent_settle). В обычных интерактивных guest-ходах `message` остаётся открыт (явные отправки по просьбе
// гостя). runId приходит на место вызова как options?.runId (buildConversationContext в builtin-openclaw: runId: attempt.runId);
// без runId (другие вызывающие createOpenClawCodingTools) — прежний deny ["gateway"]. Так как итоговый набор инструментов идёт через
// тот же filter(), а code-mode каталог (compactTools → catalog) строится из уже отфильтрованного набора, `message` исчезает и из
// catalog.search/exec-проекции. Апгрейд v2 → v3 на пропатченном чанке: замена строки deny + вторая строка на месте вызова.
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
// 2026.9.7: (a) owner-only denylist вынесен в prepareSessionPortalToolAccess() (src/agents/tools/session-portal-target.ts,
// upstream c7bab50e6e #156373 / dc0874047c #160296: "portal"/"sessions" больше не режутся non-owner'у при наличии
// session-портала / operator.write-авторитета) — needle `const ownerOnlyCoreToolPolicy = ownerOnlyCoreToolDenylist.length > 0`
// исчез (отсюда LOCATE-FAIL); место вызова createEmbeddedMessageInvocationPolicy({ … ownerOnlyCoreToolPolicy, catalog … })
// не изменилось. (b) upstream 163cd10bfa (#157014, "explain terminal access restrictions") добавил шагам пайплайна поле
// `source` (атрибуция в tool-access-diagnostics) — owner-only шаг теперь `{ policy, source: { kind: "session" }, label, … }`,
// поэтому якорь шага расширен на `source`, и гостевой шаг получает тот же `source: { kind: "session" }` (объяснение
// «Denied by guest session tools.deny» с kind=session вместо безымянного deny). filter() получил 2-й параметр onFilter —
// гостевой шаг идёт внутри того же applyToolPolicyPipeline, т.е. попадает и в onFilter/аудит. Семантика deny не менялась.
// ---- /патч ----
export function patch(source) { return patchGuestDenyDeliveryTools(source); }
export const check = { gate: "required", assertions: [
      contains("hotfix: guest-deny-delivery-tools", "guest deny marker"),
      contains("label: \"guest session tools.deny\"", "guest deny step label"),
      contains("params.guestSessionKey.includes(\":guest:\")", "guest session gate"),
      contains(CALLSITE_SESSION, "guest session key call-site wiring"),
      contains(CALLSITE_RUNID, "guest run id call-site wiring (v3)"),
      contains(DENY_NEW, "guest deny list v3 (gateway; + message on announce: runs)"),
      notContains(DENY_OLD, "остаток deny-списка v1 (message/sessions_spawn/cron/nodes)"),
      notContains(DENY_V2, "остаток deny-списка v2 (только gateway)"),
      // runId должен реально приходить в options сборки инструментов (buildConversationContext в builtin-openclaw передаёт runId: attempt.runId;
      // здесь проверяем, что в этом чанке options?.runId используется и помимо нас — т.е. поле контракта options живо)
      (src) => (src.split("options?.runId").length - 1) >= 2 ? null : "options?.runId используется только нашей строкой (контракт options.runId в agent-tools исчез?)",
      // дрейф: итоговый набор инструментов рана должен идти через тот же filter(), куда встроен гостевой шаг
      contains("const subagentFiltered = messageInvocationPolicy.filter(", "run tool set built by messageInvocationPolicy.filter (drift: new bypass path?)"),
      (src) => (src.split("additionalStepsAfterSandbox:").length - 1) === 1 ? null : "expected exactly one additionalStepsAfterSandbox pipeline in agent-tools (drift: second policy pipeline bypasses guest deny?)",
      (src) => (src.split("guestRunId").length - 1) === 3 ? null : `guestRunId ожидался ровно 3 раза (call site + typeof/startsWith в deny step), найдено ${src.split("guestRunId").length - 1}`,
    ] };
