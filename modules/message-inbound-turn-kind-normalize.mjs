// Module message-inbound-turn-kind-normalize (message-action-runner bundle, src/infra/outbound/message-action-execution.ts).
// Second layer of defence for the guest turn kind (see guest-inbound-kind-user-request): executeGatewayAction sends
// actionParams.inboundTurnKind = ctx.input.inboundEventKind to the gateway as is, while MessageActionParamsSchema accepts
// only ["user_request", "room_event"]; the gateway itself (send-*: request.inboundTurnKind === "room_event" ? "room_event"
// : "user_request") treats everything else as user_request anyway. Normalize where the request is built: room_event →
// room_event, undefined/null → not sent, any other value (e.g. a guest kind from another producer) → user_request.
// Behaviour for the regular values is unchanged; the patch only manifests on guest turns.
import { replaceOnce, contains, notContains, countExactly } from "../lib/patch-helpers.mjs";
export const label = "message-inbound-turn-kind-normalize";
export const target = { key: "messageActionRunner", label: "message-action-runner bundle (message-action-execution + send)", needles: ["async function executeMessageSend(ctx) {", "const UNRESOLVED_PREFIX_VAR_PATTERN", "async function executeGatewayAction(ctx, params) {"] };
const KIND_OLD = "\t\t\t\tinboundTurnKind: ctx.input.inboundEventKind,\n";
const KIND_NEW = "\t\t\t\tinboundTurnKind: ctx.input.inboundEventKind === \"room_event\" ? \"room_event\" : ctx.input.inboundEventKind == null ? void 0 : \"user_request\", // hotfix: message-inbound-turn-kind-normalize (2026-10-04): MessageActionParamsSchema enum is user_request|room_event and the gateway maps anything else to user_request anyway — never forward an unknown kind (e.g. a guest turn kind), it fails schema validation\n";
export function patch(source) {
  if (source.includes(KIND_NEW)) return source;
  return replaceOnce(source, KIND_OLD, KIND_NEW, "executeGatewayAction actionParams.inboundTurnKind normalization");
}
export const check = { assertions: [
  contains(KIND_NEW, "inboundTurnKind normalized to the schema enum"),
  notContains(KIND_OLD, "raw inboundTurnKind forwarding remnant"),
  countExactly("inboundTurnKind:", 1, "inboundTurnKind construction in the runner"),
] };
