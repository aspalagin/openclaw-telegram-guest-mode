// Apply plan: target key → ordered module list. Order inside an entry is load-bearing: cascade
// modules rewrite code inserted by the module before them. Chunks are located by content needles
// (see each module's `target`), never by the hashed chunk file name.
export const PLAN = {
  "followup-queue": ["guest-query-ownership-enqueue"],
  "followup-drain": ["guest-query-ownership-collector"],
  "route-reply": ["guest-query-ownership-route"],
  "completion-mutation": ["guest-query-ownership-blocked-notice"],
  "reply-admission": ["guest-query-ownership-admission"],
  // Telegram ingress drain-factory (createTelegramInboundHandlers): guest_message registration + handler
  "telegram-ingress": ["telegram-guest-mode-bot.1"],
  // Telegram bot-message bundle: message context, session key, delivery hint, ack/edit arming, privacy
  "telegram-bot-message": [
    "telegram-guest-mode-bot.2",
    "guest-plain-bot-hint",
    "guest-inbound-kind-user-request",
    "guest-ack-edit-bot",
    "guest-session-per-chat",
    "guest-context-isolation",
    "guest-inbound-log-sender",
  ],
  // Telegram delivery.replies bundle: answerGuestQuery transport, guards, ack/edit registry, media staging
  "telegram-delivery": [
    "telegram-guest-mode-delivery",
    "guest-plain-delivery-normalize",
    "guest-single-answer-guard",
    "guest-no-chat-fallback",
    "guest-ack-edit-delivery",
    "guest-media-staging-delivery",
  ],
  // Telegram send bundle: file_id registry of outgoing media (for guest attachments)
  "telegram-send": ["telegram-sent-media-file-ids"],
  // Core: agent tool policy (guest deny list)
  "agent-tools": ["guest-deny-delivery-tools"],
  // Core: agent runner runtime (post-run verbose extras)
  "agent-runner": ["guest-query-ownership-followup", "guest-suppress-verbose-payloads"],
  // Core: auto-reply dispatch (in-run verbose progress)
  "auto-reply-dispatch": ["guest-suppress-inrun-progress"],
  // Core: agent command delivery (sub-agent completion finals of a guest session → inline message)
  "agent-command-delivery": ["guest-announce-final-inline"],
  // Core: sub-agent announce coordinator / settle-wake (completion instruction for guest requesters)
  "subagent-announce": ["guest-query-ownership-announce", "guest-announce-final-text-instruction"],
  "subagent-settle-wake": ["guest-query-ownership-settle", "guest-announce-final-text-settle-wake"],
  // Core: sub-agent announce delivery (conditional: only when a silent-completion fallback sender exists)
  "subagent-announce-delivery": ["guest-query-ownership-terminal", "guest-announce-fallback-skip"],
  // Core: message tool action runner (inboundTurnKind normalization + guest media staging reroute)
  "message-action-runner": ["message-inbound-turn-kind-normalize", "guest-media-staging-runner", "guest-query-ownership-message"],
  // Core: sessions_spawn tool (owner parent → child run launched with operator.admin)
  "sessions-spawn-tool": ["guest-query-ownership-spawn", "subagent-inherit-owner-scope"],
};
export const AI_PLAN = {};

// Optional (--with-ultrafast): OpenAI service_tier "ultrafast" by default for guest sessions.
export const ULTRAFAST_PLAN = {
  "builtin-openclaw": ["guest-ultrafast-service-tier"],
};
export const ULTRAFAST_AI_PLAN = {
  "ai-openai-responses-params": ["openai-ultrafast-tier.2"],
};

export function allModuleNames(includeUltrafast = true) {
  const lists = [...Object.values(PLAN), ...Object.values(AI_PLAN)];
  if (includeUltrafast) lists.push(...Object.values(ULTRAFAST_PLAN), ...Object.values(ULTRAFAST_AI_PLAN));
  return lists.flat();
}
