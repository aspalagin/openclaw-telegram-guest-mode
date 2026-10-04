// Метка guest-inbound-kind-user-request (new 2026-10-04): каскад поверх telegram-guest-mode-bot.2 (тот же чанк bot-message).
// Дефект A (сессия …:guest:<callerId>-at-<chatId>): bot.2 ставил
// inboundEventKind = "guest_message" для гостевых ходов; ядро прокидывает его как есть в message-action-runner → actionParams.inboundTurnKind,
// а схема запроса gateway MessageActionParamsSchema (src-*.mjs) допускает только enum ["user_request", "room_event"] → ЛЮБОЙ вызов
// инструмента message из гостевого хода отвергался: «invalid message.action params: at /inboundTurnKind: must be equal to one of the
// allowed values». Семантики "guest_message" ни у gateway (send-*: всё, что не room_event → user_request), ни у guest-портов нет — признак
// гостя в контексте GuestMode/GuestQueryId/GuestDeliveryHint. Лечение: гость — обычный user_request (гостевой чат не группа; ack-reactions/
// sourceReplyDeliveryMode/includeBeforeSelf для гостя как у direct). Второй слой защиты — message-inbound-turn-kind-normalize (runner).
import { replaceOnce, contains, notContains } from "../lib/patch-helpers.mjs";
import { patch as basePatch, target as baseTarget } from "./telegram-guest-mode-bot.2.mjs";
export const label = "guest-inbound-kind-user-request";
export const verdict = "port";
export const target = baseTarget;
const KIND_OLD = "\tconst effectiveInboundEventKind = msg.guest_query_id ? \"guest_message\" : inboundEventKind;\n";
const KIND_NEW = "\tconst effectiveInboundEventKind = msg.guest_query_id ? \"user_request\" : inboundEventKind; // hotfix: guest-inbound-kind-user-request (2026-10-04): \"guest_message\" is not in the inboundTurnKind enum (user_request|room_event) of MessageActionParamsSchema — every message tool call from a guest turn was rejected by the gateway; the guest marker is GuestMode/GuestQueryId\n";
export function patch(source) {
  const next = basePatch(source);
  if (next.includes(KIND_NEW)) return next;
  return replaceOnce(next, KIND_OLD, KIND_NEW, "guest inboundEventKind guest_message → user_request (cascade: telegram-guest-mode-bot.2)");
}
export const check = { gate: "required", assertions: [
  contains(KIND_NEW, "guest inbound kind = user_request"),
  notContains("? \"guest_message\" :", "остаток guest_message в effectiveInboundEventKind"),
  contains("\t\t\tinboundEventKind: effectiveInboundEventKind,\n", "payload.message.inboundEventKind всё ещё берётся из effectiveInboundEventKind"),
  (src) => (src.split("const effectiveInboundEventKind = ").length - 1) === 1 ? null : "effectiveInboundEventKind объявлен не один раз",
] };
