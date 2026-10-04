// Метка message-inbound-turn-kind-normalize (new 2026-10-04; чанк message-action-runner-*.mjs, src/infra/outbound/message-action-execution.ts).
// Второй слой защиты для дефекта A (см. guest-inbound-kind-user-request): executeGatewayAction отправляет в gateway
// actionParams.inboundTurnKind = ctx.input.inboundEventKind как есть, а схема MessageActionParamsSchema допускает только
// ["user_request", "room_event"]; gateway же (send-*: request.inboundTurnKind === "room_event" ? "room_event" : "user_request") всё
// остальное и так считает user_request. Нормализуем на месте построения запроса: room_event → room_event, undefined/null → не передавать,
// любое иное значение (например гостевой kind от другого продюсера) → user_request. Поведение для штатных значений не меняется.
// Guest-модуль по области применения (INCLUDE_GUEST=1): манифестирует только у гостевых ходов.
import { replaceOnce, contains, notContains } from "../lib/patch-helpers.mjs";
export const label = "message-inbound-turn-kind-normalize";
export const verdict = "port";
export const target = { key: "messageActionRunner", label: "message-action-runner bundle (message-action-execution + send)", needles: ["async function executeMessageSend(ctx) {", "const UNRESOLVED_PREFIX_VAR_PATTERN", "async function executeGatewayAction(ctx, params) {"] };
const KIND_OLD = "\t\t\t\tinboundTurnKind: ctx.input.inboundEventKind,\n";
const KIND_NEW = "\t\t\t\tinboundTurnKind: ctx.input.inboundEventKind === \"room_event\" ? \"room_event\" : ctx.input.inboundEventKind == null ? void 0 : \"user_request\", // hotfix: message-inbound-turn-kind-normalize (2026-10-04): MessageActionParamsSchema enum is user_request|room_event and the gateway maps anything else to user_request anyway — never forward an unknown kind (e.g. a guest turn kind), it fails schema validation\n";
export function patch(source) {
  if (source.includes(KIND_NEW)) return source;
  return replaceOnce(source, KIND_OLD, KIND_NEW, "executeGatewayAction actionParams.inboundTurnKind normalization");
}
export const check = { gate: "required", assertions: [
  contains(KIND_NEW, "inboundTurnKind normalized to the schema enum"),
  notContains(KIND_OLD, "raw inboundTurnKind forwarding remnant"),
  (src) => (src.split("inboundTurnKind:").length - 1) === 1 ? null : `ожидалось ровно одно построение inboundTurnKind в runner, найдено ${src.split("inboundTurnKind:").length - 1}`,
] };
