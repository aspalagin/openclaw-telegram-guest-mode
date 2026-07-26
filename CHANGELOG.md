# Changelog

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
