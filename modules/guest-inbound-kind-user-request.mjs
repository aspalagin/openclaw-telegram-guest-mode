// Module guest-inbound-kind-user-request: cascade over telegram-guest-mode-bot.2 (same bot-message chunk).
// bot.2 set inboundEventKind = "guest_message" for guest turns; the core forwards it as is into the message-action
// runner → actionParams.inboundTurnKind, and the gateway request schema MessageActionParamsSchema only accepts the enum
// ["user_request", "room_event"] → EVERY message tool call from a guest turn was rejected ("invalid message.action params:
// at /inboundTurnKind: must be equal to one of the allowed values"). Neither the gateway (send-*: anything but
// room_event → user_request) nor the guest modules give "guest_message" a meaning — the guest marker in the context is
// GuestMode/GuestQueryId/GuestDeliveryHint. Fix: a guest is a regular user_request (a guest chat is not a group;
// ack reactions / sourceReplyDeliveryMode / includeBeforeSelf behave as for a direct chat). Second layer of defence:
// message-inbound-turn-kind-normalize (runner).
import { replaceOnce, contains, notContains, countExactly } from "../lib/patch-helpers.mjs";
import { patch as basePatch, target as baseTarget } from "./telegram-guest-mode-bot.2.mjs";
export const label = "guest-inbound-kind-user-request";
export const target = baseTarget;
const KIND_OLD = "\tconst effectiveInboundEventKind = msg.guest_query_id ? \"guest_message\" : inboundEventKind;\n";
const KIND_NEW = "\tconst effectiveInboundEventKind = msg.guest_query_id ? \"user_request\" : inboundEventKind; // hotfix: guest-inbound-kind-user-request (2026-10-04): \"guest_message\" is not in the inboundTurnKind enum (user_request|room_event) of MessageActionParamsSchema — every message tool call from a guest turn was rejected by the gateway; the guest marker is GuestMode/GuestQueryId\n";
export function patch(source) {
  const next = basePatch(source);
  if (next.includes(KIND_NEW)) return next;
  return replaceOnce(next, KIND_OLD, KIND_NEW, "guest inboundEventKind guest_message → user_request (cascade: telegram-guest-mode-bot.2)");
}
export const check = { assertions: [
  contains(KIND_NEW, "guest inbound kind = user_request"),
  notContains("? \"guest_message\" :", "guest_message remnant in effectiveInboundEventKind"),
  contains("\t\t\tinboundEventKind: effectiveInboundEventKind,\n", "payload.message.inboundEventKind still taken from effectiveInboundEventKind"),
  countExactly("const effectiveInboundEventKind = ", 1, "effectiveInboundEventKind declaration"),
] };
