# Changelog

## v1.2.0 - 2026-10-04

Re-port to OpenClaw `2026.9.7` plus the Guest Mode work of 2026-10-04. The kit
is now modular (`lib/plan.mjs` + `modules/*.mjs`); anchors are located by
content needles and every module carries its own drift assertions. Nothing is
imported from an operator's private hotfix layer; host-specific paths and ids
are gone (rules files resolve via env or the OpenClaw state dir, the media
staging chat must be configured explicitly).

New behaviour:

- **Placeholder + in-place final** (`guest-ack-edit-delivery` v3 registry,
  `guest-ack-edit-bot` arm v2): after `ackAfterSeconds` the query is answered
  with a placeholder, a heartbeat edits the elapsed time, the final reply is
  edited into the same inline message by `inline_message_id`; settle text when
  the run fails or yields no text. Long runs no longer die on "query is too
  old".
- **Rich replies and rich append**: Markdown → Telegram rich message both for
  the first answer and for every later edit/append (re-rendered as one
  document through `planTelegramTextDeliveryPages`), plain-text retry on rich
  errors, 4096 limit enforced by trimming whole Markdown blocks (old text
  first, then new, chars only for a single oversized block).
- **Sub-agent finals in the guest message** (`guest-announce-final-inline` v2,
  `guest-announce-final-text-instruction` v2,
  `guest-announce-final-text-settle-wake` v2, shared instruction text,
  `guest-announce-fallback-skip` conditional): announce/settle completion
  turns of a guest session — including private completion with
  `deliver=false` — append their text to the guest's inline message instead of
  sending to the chat on the session record (the owner's DM) or keeping it
  internal; the completion instruction tells the sub-agent to answer with the
  final text, not with a messaging tool.
- **Tool policy v3** (`guest-deny-delivery-tools`): deny `gateway` always;
  deny `message` only in `announce:` completion turns. Interactive guest turns
  may use `message`, `sessions_spawn`, `cron`, `nodes`.
- **Guest hint v4** (`guest-plain-bot-hint`): rich allowed, media recipe
  (send with `media` and no target), code-mode recipe (call the `message`
  global, not `catalog.search`).
- **`message` from a guest turn** (`guest-inbound-kind-user-request`,
  `message-inbound-turn-kind-normalize`): the kit no longer sends
  `inboundEventKind: "guest_message"`, which the gateway schema rejected
  (`inboundTurnKind` enum `user_request | room_event`); the runner also
  normalizes unknown kinds.
- **Files and photos for guests** (`telegram-sent-media-file-ids` v2,
  `guest-media-staging-runner` v3, `guest-media-staging-delivery`): media sent
  from a guest session is uploaded to a configured staging chat (direct Bot
  API multipart for local files, regular pipeline for URLs/buffers), the
  `file_id` is attached to the guest's inline message as a rich block
  (`editMessageMedia` fallback; documents only via that fallback, caption
  ≤ 1024), result reported to the model as `guestMediaDelivery`.
- **Optional `--with-ultrafast`** (`guest-ultrafast-service-tier` v2,
  `openai-ultrafast-tier.1/.2`): OpenAI `service_tier: "ultrafast"` by default
  for session keys listed in a rules file (default `:guest:`), explicit
  `serviceTier` wins.

Re-anchored for 2026.9.7: `telegram-guest-mode-bot` is now two modules
(ingress drain-factory + bot-message, `resolveTelegramTargetSession`,
`sendChatAction`), `telegram-guest-mode-delivery` (`deliverTextReply(textReply)`,
`sender.sendText`), `guest-no-chat-fallback` (guard at the head of
`deliverReplyPlan`, export-list drift guard), `guest-context-isolation`
(`sessionTranscript` field instead of the removed prompt-messages anchor),
`guest-deny-delivery-tools` (`createEmbeddedMessageInvocationPolicy`, step
`source`), `guest-suppress-verbose-payloads` (`buildReplyDiagnosticsPayload`).
`telegram-guest-allowed-update` is conditional: grammy 1.46 already lists
`guest_message` in `DEFAULT_UPDATE_TYPES`.

Tooling: all-or-nothing apply with in-memory composition, idempotency
double-pass, per-entry assertions and `node --check` before any write;
`manifest.json` in each backup directory; `--json` reports; checker prints
`n/a` for conditional modules and covers the optional set with
`--with-ultrafast`.

Known limitations are listed in README (inline media constraints, staging
copy, registry lost on restart, Russian fallback strings).

## v1.1.3 - 2026-09-19

Portability fix, no behaviour change.

- `normalizeTelegramGuestSessionScope` (inserted into the bot-message bundle
  by the session-scope patch) called `normalizeLowercaseStringOrEmpty`, a
  helper the bundle imported from `string-coerce` only in the pinned baseline.
  Once a newer OpenClaw build stopped importing it (observed on `2026.9.4`),
  every `guest_message` failed inside the ingress spool with
  `ReferenceError: normalizeLowercaseStringOrEmpty is not defined` and was
  retried forever, while the checker stayed green because it validates
  anchors and markers, not identifier resolution. The helper is now
  self-contained (`String(value ?? "").trim().toLowerCase()`).
- Operational note: after re-applying on a fresh build, run one live guest
  query. A syntax/import-clean bundle is not proof that inserted code links.

## v1.1.2 - 2026-07-29

Completes the multi-payload fix started in v1.1.1, which suppressed only
POST-RUN verbose extras. With verbose enabled, guest runs that called a tool
still emitted IN-RUN progress payloads, and the first one consumed the one-shot
`answerGuestQuery` — the guest saw a progress line where the answer should
have been, and the answer itself was dropped tens of seconds later as an
expired query. Runs without tools were unaffected, which made the bug look
intermittent (production, 2026-07-29: 5 of 11 guest runs, all five with a
web-search call).

- In-run verbose progress (commentary, tool progress, tool summaries) is
  disabled for `:guest:`-scoped sessions in a single place
  (`guest-suppress-inrun-progress`, patches a sixth bundle: the auto-reply
  dispatch bundle). Root cause: guest queries have streaming draft delivery
  disabled, so progress is emitted as standalone payloads rather than draft
  edits.
- A payload belonging to a guest session that carries no `guestQueryId` is
  dropped with a `[hotfix][guest-no-chat-fallback]` log line instead of being
  delivered as a plain message into the chat the query was typed in
  (`guest-no-chat-fallback`). This closes a bypass of the v1.1.1 guard through
  the rich-message delivery path, observed in production and stopped only by
  Telegram's "bot can't initiate conversation with a user" error.
- Checker covers both new signatures (eleven checks in total).

Diagnostic note for this class of bug: a guest run whose answer reached the
guest leaves a `channel-final` delivery mirror in the session transcript. No
mirror means the answer never arrived, whatever the logs show as delivered.

## v1.1.1 - 2026-07-27

Multi-payload delivery fix after a production incident (the first guest query
after a session reset, with verbose enabled, produced two reply payloads: the
"🧭 New session" banner consumed the one-shot answerGuestQuery, and the real
reply fell back to sendMessage into the operator's DM with the bot):

- Verbose extras (new-session banner, auto-compaction notice, trailing
  plugin-status payload) are suppressed for `:guest:`-scoped sessions — a
  guest reply is always a single plain-text payload
  (`guest-suppress-verbose-payloads`, patches a fifth bundle: the agent
  runner runtime).
- Guest replies are now inline-or-dropped: when `answerGuestQuery` reports the
  query as expired, the payload is dropped with a
  `[hotfix][guest-single-answer]` log line instead of falling back to
  `sendMessage` — the fallback delivered guest replies into the operator's DM
  (`guest-single-answer-guard`). This changes the documented v1.0.0
  "expired queries degrade gracefully" behaviour in favour of privacy.

## v1.1.0 - 2026-07-26

Privacy hardening after a production review of guest traffic (11 guest events
audited; caller/session invariant held in all of them, but three leak paths
were found in the surrounding behaviour):

- Guest session scope is now `<callerId>-at-<chatId>`: a caller's guest queries
  in different chats no longer share a session, so context from one
  conversation cannot surface in a reply published in another chat.
- Guest turns no longer receive the operator's private session transcript in
  the prompt context (observed: a private infrastructure session summary was
  pulled into a guest reply published in a third-party chat).
- `message`, `sessions_spawn`, `cron`, `gateway`, and `nodes` are denied at the
  tool-policy level for any `:guest:`-scoped session — the previous
  prompt-only hint was ignored by the model at least once, which then tried to
  message an unrelated chat.
- The inbound log line names the real caller for guest updates
  (`telegram:<chatId> (guest query by <callerId>)`): the `from` field carries
  the chat id, which reads as the sender and caused a misdiagnosis.
- Checker covers the two new signatures (`guest-privacy-hardening`,
  `guest-deny-delivery-tools`); the kit now patches four bundles, adding the
  agent tools policy bundle.

## v1.0.0 - 2026-07-19

- Initial public release, ported to OpenClaw `2026.7.1-2`.
- Standalone apply script with signature-guarded, idempotent transformations,
  a `--dry-run` mode with cumulative in-memory transformations, and per-file
  backups before every write.
- Standalone checker validating all five guest-mode patch signatures; exits
  with code 1 when any signature is missing.
- Extracted only the guest-mode transforms; unrelated rich-delivery gate
  changes from the origin patch layer are not included.
