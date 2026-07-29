# Hotfix notes

Tested baseline: OpenClaw `2026.7.1-2`.

## Patch inventory and apply order

The layer consists of ten guarded transformations across six dist bundles
(v1.1.0 added per-chat guest session scope, guest prompt-context isolation, an
honest inbound log line, and a tool-policy deny step in the agent tools bundle;
v1.1.1 added single-payload delivery in the agent runner runtime; v1.1.2 added
in-run progress suppression in the auto-reply dispatch bundle).
Bundles are discovered by stable code signatures, never by file name.

| # | Patch id | Bundle | Purpose |
| --- | --- | --- | --- |
| 1 | `telegram-guest-allowed-update` | allowed updates | subscribe the poller to `guest_message` |
| 2 | `telegram-guest-mode-bot` | Telegram bot | inbound handler, session isolation, delivery hint, context fields |
| 3 | `telegram-guest-mode-delivery` | Telegram delivery | `answerGuestQuery` delivery with fallbacks |
| 4 | `guest-plain-bot-hint` | Telegram bot | extended plain-text delivery hint |
| 5 | `guest-plain-delivery-normalize` | Telegram delivery | plain-text normalization of guest answers |
| 6 | `guest-deny-delivery-tools` | agent tools policy | deny `message` / `sessions_spawn` / `cron` / `gateway` / `nodes` in guest runs |
| 7 | `guest-suppress-verbose-payloads` | agent runner runtime | suppress post-run verbose extras for guest sessions |
| 8 | `guest-single-answer-guard` | Telegram delivery | guest replies are inline-or-dropped; no `sendMessage` fallback |
| 9 | `guest-suppress-inrun-progress` | auto-reply dispatch | suppress in-run verbose progress for guest sessions |
| 10 | `guest-no-chat-fallback` | Telegram delivery | drop guest-session payloads that carry no guest query id |

Patches 2 and 3 also carry the v1.1.0 privacy hardening (session scope, prompt
isolation, inbound log line), which the checker validates as a separate
`guest-privacy-hardening` signature.

The order is load-bearing. Patch 4 rewrites the delivery-hint text that patch
2 inserts, patch 5 extends the guest delivery branch that patch 3 inserts, and
patch 8 rewrites the expired-query branch produced by 3 and 5; all fail with an
explicit cascade error when their prerequisite is missing. The apply script
always runs 2 before 4, 3 before 5, and 5 before 8, and its dry-run mode keeps
transformations cumulative in memory so the cascade also holds without writing
package files. Patches 9 and 10 are independent of that cascade — they anchor
on unpatched upstream code.

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
  `query ID is invalid`) drop the payload with a
  `[hotfix][guest-single-answer]` log line. There is deliberately no
  `sendMessage` fallback (changed in v1.1.1): the fallback chat id is the chat
  the query was typed in, which for private chats is the operator's own DM with
  the bot.
- A payload belonging to a `:guest:`-scoped session that carries no
  `guestQueryId` never reaches the chat: `deliverReplies` drops it with a
  `[hotfix][guest-no-chat-fallback]` log line (v1.1.2). This covers delivery
  paths that do not run through the guest branch of `deliverTextReply` at all,
  such as rich-message delivery.
- Media replies for guests deliver the reply text when present, otherwise a
  plain-text "media unavailable" placeholder.
- `guest-plain-delivery-normalize` strips a leading model/startup header,
  converts accidental HTML to plain text via the bundle's own HTML-to-plain
  fallback, and forces `parse_mode` off for guest answers.

## Progress suppression (dispatch bundle)

`answerGuestQuery` is one-shot, so a guest turn must produce exactly one
outbound payload. Two mechanisms would otherwise break that, and both were
observed in production before being closed:

- Post-run extras (new-session banner, auto-compaction notice, trailing
  plugin-status payload) — suppressed in the agent runner runtime for
  `:guest:`-scoped sessions (v1.1.1).
- In-run progress (commentary, tool progress, tool summaries) — suppressed in
  the dispatch bundle for the same sessions (v1.1.2). This matters
  specifically because guest queries have streaming draft delivery disabled:
  with no draft to edit, the runtime falls back to emitting progress as
  standalone payloads, and the first one consumes the inline answer. The
  failure therefore only appears on turns that actually call a tool, which
  makes it look intermittent.

Diagnostic: a guest turn whose answer reached the guest leaves a
`channel-final` delivery mirror in the session transcript. No mirror means the
answer never arrived, regardless of what the delivery logs report.

## Verification mechanism

The apply script discovers each target bundle by code signatures and refuses
to patch when a bundle cannot be uniquely identified or a transformation
anchor does not match; this is the expected safe outcome on any OpenClaw
version other than `2026.7.1-2`. Every write is preceded by a per-file backup
under the backup directory. The checker validates the applied signatures
independently and exits non-zero when any of its eleven checks fails.
Run the checker after every OpenClaw package update.

This repository intentionally omits host-specific production notes, node ids,
private paths, tokens, IP addresses, and operator chat ids.
