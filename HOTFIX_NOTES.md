# Hotfix notes

Tested baseline: OpenClaw `2026.7.1-2`.

## Patch inventory and apply order

The layer consists of five guarded transformations across three dist bundles.
Bundles are discovered by stable code signatures, never by file name.

| # | Patch id | Bundle | Purpose |
| --- | --- | --- | --- |
| 1 | `telegram-guest-allowed-update` | allowed updates | subscribe the poller to `guest_message` |
| 2 | `telegram-guest-mode-bot` | Telegram bot | inbound handler, session isolation, delivery hint, context fields |
| 3 | `telegram-guest-mode-delivery` | Telegram delivery | `answerGuestQuery` delivery with fallbacks |
| 4 | `guest-plain-bot-hint` | Telegram bot | extended plain-text delivery hint |
| 5 | `guest-plain-delivery-normalize` | Telegram delivery | plain-text normalization of guest answers |

The order is load-bearing. Patch 4 rewrites the delivery-hint text that patch
2 inserts, and patch 5 extends the guest delivery branch that patch 3
inserts; both fail with an explicit cascade error when their prerequisite is
missing. The apply script always runs 2 before 4 and 3 before 5, and its
dry-run mode keeps transformations cumulative in memory so the cascade also
holds without writing package files.

## Ingress (bot bundle)

- `guest_message` is added to the allowed update types next to
  `message_reaction`, so long polling actually receives guest updates.
- `bot.on("guest_message")` extracts the guest query, resolves the sender
  from `from` or `guest_bot_caller_user`, and pushes a synthetic context
  through `handleInboundMessageLike` — the same path as normal direct
  messages, so dedupe and the `dmPolicy` / `allowFrom` authorization gate
  apply unchanged.
- The message-context header treats guest updates as direct chats (never
  group), and disables the reaction API for guest turns.
- `resolveTelegramGuestSessionKey` appends `:guest:<scope>` to the session
  key. Scope preference: caller chat id, caller user id, guest query id;
  normalized to lowercase `[a-z0-9_-]` and capped at 96 characters.
- Typing and voice-recording cues are suppressed for guests; streaming
  delivery and durable replay are disabled for guest queries (at-most-once
  delivery by design).
- The inbound context payload carries `GuestMode`, `GuestQueryId`,
  `GuestBotCallerUserId`, and `GuestBotCallerChatId`, plus a delivery hint
  instructing the agent to answer in concise plain text without delivery
  tools, media, or reactions. The `guest-plain-bot-hint` patch extends this
  hint to also forbid model/context/status headers, startup banners, HTML
  tags, and Markdown-only formatting.

## Delivery (delivery bundle)

- `buildTelegramGuestTextResult` wraps the reply into an `article` guest
  result. Texts above the 4096-character guest limit are truncated with an
  explicit marker appended.
- `answerTelegramGuestQuery` tries `bot.api.answerGuestQuery`, then
  `bot.api.raw.answerGuestQuery`, then a direct
  `https://api.telegram.org/bot<token>/answerGuestQuery` HTTP call. The HTTP
  fallback exists for self-hosted `telegram-bot-api` builds whose client
  bindings do not expose the method; the bot token comes from delivery
  options and is never logged.
- `deliverTextReply` short-circuits for guest queries: at most one answer per
  query (`progress.guestAnswered`), and multi-chunk replies collapse to the
  first chunk plus the truncation marker.
- Expired guest queries (`query is too old`, `response timeout expired`,
  `query ID is invalid`) fall back to the normal `sendMessage` path.
- Media replies for guests deliver the reply text when present, otherwise a
  plain-text "media unavailable" placeholder.
- `guest-plain-delivery-normalize` strips a leading model/startup header,
  converts accidental HTML to plain text via the bundle's own HTML-to-plain
  fallback, and forces `parse_mode` off for guest answers.

## Verification mechanism

The apply script discovers each target bundle by code signatures and refuses
to patch when a bundle cannot be uniquely identified or a transformation
anchor does not match; this is the expected safe outcome on any OpenClaw
version other than `2026.7.1-2`. Every write is preceded by a per-file backup
under the backup directory. The checker validates the applied signatures
independently and exits non-zero when any of the five patches is missing.
Run the checker after every OpenClaw package update.

This repository intentionally omits host-specific production notes, node ids,
private paths, tokens, IP addresses, and operator chat ids.
