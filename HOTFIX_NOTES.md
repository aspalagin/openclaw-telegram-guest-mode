# Hotfix notes

Tested baseline: OpenClaw `2026.9.7` (grammy 1.46.0, Bot API 10.3 types).

## Module inventory and apply order

`lib/plan.mjs` maps a target key to an ordered module list. Chunks are located
by content needles (`target.needles` in each module); the hashed chunk file
names below are the 2026.9.7 names and are informational only.

| Target key | Chunk (2026.9.7) | Modules (in order) | Version |
| --- | --- | --- | --- |
| `telegram-ingress` | `transport-status-*.mjs` | `telegram-guest-mode-bot.1` | 9.7 re-anchor |
| `telegram-bot-message` | `bot-message-*.mjs` | `telegram-guest-mode-bot.2`, `guest-plain-bot-hint` (v4), `guest-inbound-kind-user-request`, `guest-ack-edit-bot` (arm v3), `guest-session-per-chat`, `guest-context-isolation`, `guest-inbound-log-sender` | v1.2.1 |
| `telegram-delivery` | `delivery-*.mjs` | `telegram-guest-mode-delivery` (apiRoot helper, English strings), `guest-plain-delivery-normalize`, `guest-single-answer-guard`, `guest-no-chat-fallback`, `guest-ack-edit-delivery` (registry v4: strings in rules), `guest-media-staging-delivery` (v4: uploads through the bot client) | v1.2.1 |
| `telegram-allowed-updates` | `allowed-updates-*.mjs` | `telegram-guest-allowed-update` (conditional) | n/a on grammy ≥ 1.46 |
| `telegram-send` | `send-*.mjs` | `telegram-sent-media-file-ids` (v3, rich hook conditional) | v1.2.1 |
| `agent-tools` | `agent-tools-*.mjs` | `guest-deny-delivery-tools` (v3) | 2026-10-04 |
| `agent-runner` | `agent-runner.runtime-*.mjs` | `guest-suppress-verbose-payloads` | 9.7 re-anchor |
| `auto-reply-dispatch` | `dispatch-from-config-*.mjs` | `guest-suppress-inrun-progress` | unchanged |
| `agent-command-delivery` | `delivery.runtime-*.mjs` | `guest-announce-final-inline` (v3) | v1.2.1 |
| `subagent-announce` | `subagent-announce-*.mjs` | `guest-announce-final-text-instruction` (v3) | v1.2.1 |
| `subagent-settle-wake` | `subagent-announce.requester-settle-wake-*.mjs` | `guest-announce-final-text-settle-wake` (v3) | v1.2.1 |
| `subagent-announce-delivery` | `subagent-announce-delivery-*.mjs` | `guest-announce-fallback-skip` (conditional) | 2026-10-04 |
| `message-action-runner` | `message-action-runner-*.mjs` | `message-inbound-turn-kind-normalize`, `guest-media-staging-runner` (v4: realpath allowlist) | v1.2.1 |
| optional `openai-fast-mode` | `minimax-fast-mode-*.mjs` | `openai-ultrafast-tier.1` | 2026-09-29 |
| optional `builtin-openclaw` | `builtin-openclaw-*.mjs` | `guest-ultrafast-service-tier` (v2) | v1.2.1 (comments) |
| optional `ai-openai-responses-params` | `node_modules/@openclaw/ai/dist/openai-responses-prompt-observer-internal-*.mjs` | `openai-ultrafast-tier.2` | v1.2.1 (comment) |

Version bumps in v1.2.1 change only comments, user-facing default strings and
the two security fixes (realpath, apiRoot); the runtime logic of every module
is otherwise the same as v1.2.0. A v1.2.0 install is upgraded in place (nine
entries rewritten, result byte-identical to a fresh v1.2.1 apply).

Cascades: modules that extend code inserted by an earlier module import and
call that module's `patch()` first (`guest-plain-bot-hint`,
`guest-inbound-kind-user-request`, `guest-session-per-chat` over
`telegram-guest-mode-bot.2`; `guest-plain-delivery-normalize`,
`guest-single-answer-guard` over `telegram-guest-mode-delivery`;
`guest-ack-edit-delivery` over the whole delivery cascade;
`guest-media-staging-delivery` over `guest-ack-edit-delivery`). The apply
computes each target in memory, re-runs the whole cascade a second time
(must be a no-op), runs every module's assertions on the result and
`node --check`s it before anything is written. Older module revisions found on
an already-patched install (v1/v2 of the registry, arm, deny list, hint,
announce guard, staging runner) are recognized and upgraded in place.

## Runtime model

- **Registry** `globalThis.__openclawHotfixGuestAck` (delivery chunk) is shared
  with the bot-message chunk (which imports delivery statically) and with core
  chunks (`delivery.runtime`, `message-action-runner`) through `globalThis`;
  no new chunk exports. Entry per guest query: `armed → inflight → placeholder
  → answered` (or `claimed` when the final arrives before the placeholder,
  `closed`/`failed`). `bySession` index serves late appends and media.
- **arm** in `runTelegramDispatchTurn` right after `beginDeliveryCorrelation`,
  **settle** in its `finally`; **claimFinal / markAnswered / appendToAnswered**
  in the guest branch of `deliverTextReply`; **appendLater** at the head of
  `deliverReplyPlan` before the no-chat-fallback guard; **appendBySession**
  from `deliverAgentCommandResult` (core) before `if (!deliver)`;
  **attachMediaBySession / stageAndAttachMedia / mediaRules** from
  `executeMessageSend` (message action runner).
- **Rules** are read with an mtime+size cache (one `statSync` per access).
- **Rich**: `chunk.richMessage` of the planned page is sent as
  `InputRichMessageContent`; edits use `editMessageText{rich_message}`; any
  rich error → plain retry (the query is still unanswered / the edit not
  applied). Media blocks are carried along in every later edit (wrapper over
  `hotfixGuestAckEditInline`), otherwise the final would erase the attachment.
- **Media**: `InputRichBlock{Photo,Video,Animation,Audio,VoiceNote}` with
  `InputMedia{media: file_id}`; `InputRichBlockDocument` is rejected by Bot
  API for inline messages in practice → `editMessageMedia` fallback
  (`mediaReplaced` mode: text edits → `editMessageCaption` ≤ 1024).
- **Sent-media registry** `globalThis.__openclawHotfixTelegramSentMedia`
  (bounded Map, 300 entries) records the `file_id` of every outgoing Telegram
  media message (`acceptMany` in the send chunk); the runner looks it up by
  `chatId:messageId` from the send result (both the flat plugin form and the
  core `{result:{chatId,messageId,receipt}}` form).
- **Staging direct mode**: local files from a guest session are uploaded by
  the registry itself (`sendPhoto/Video/Animation/Audio/Document`, 50 MB,
  photos ≤ 10 MB, document retry), bypassing the outbound pipeline — a
  rich-enabled account embeds text+local media into a rich send whose
  `file_id` would not reach the registry. The runner resolves every local
  path with `fs.realpathSync` **before** the allowlist check
  (`ctx.mediaAccess.localRoots`, `isPathInside` on the canonical path,
  fail-closed; realpath failure = denied) and hands the realpath to the
  registry; the `message-action-runner` chunk gets `import fs from "node:fs"`
  for that. The upload itself goes through `bot.api.raw.<method>` with a
  grammy `InputFile` (grammy is imported lazily with `import("grammy")` from
  the delivery chunk — the send chunk already imports it, so the same module
  instance is used and `instanceof InputFile` holds); the bot client applies
  `apiRoot`, proxy fetch and the account throttler. Fallback (no raw API /
  grammy unavailable): multipart `fetch` against `hotfixTelegramApiRoot(bot)`
  = `bot.clientConfig.apiRoot` or `https://api.telegram.org`. The same helper
  (inserted by `telegram-guest-mode-delivery`) serves every JSON HTTP fallback
  of the kit. URLs and buffers go through the regular pipeline and are picked
  up from `acceptMany`.
- **Payload hygiene**: `guestMediaDelivery` carries file names, kinds, sizes
  and reasons — no staging chat id, no `file_id`; log lines print a
  `name:mode` summary instead of the item dump.

## Diagnostics

Log tags: `[hotfix][guest-ack]` (placeholder/heartbeat/final/append/media),
`[hotfix][guest-announce-final]` (sub-agent finals appended or dropped, empty
payload diagnostic), `[hotfix][guest-media-staging]` (reroute, attach result),
`[hotfix][guest-single-answer]`, `[hotfix][guest-no-chat-fallback]`,
`[hotfix][telegram-sent-media]`, `[hotfix][guest-ultrafast]`. The inbound log
line names the real caller: `telegram:<chatId> (guest query by <callerId>)`.

A guest run whose answer reached the guest leaves a `channel-final` delivery
mirror in the session transcript; no mirror means the answer never arrived.

## Porting to another OpenClaw version

1. `node apply-guest-mode.mjs --dry-run --allow-untested --package-root <copy>`
   on a copy of the new dist (without `--allow-untested` the apply refuses an
   untested version outright). Each failing entry names the module and the
   missing/ambiguous anchor.
2. Fix the anchor in `modules/<name>.mjs` (keep `check.assertions` honest:
   they are the drift guards for the next upgrade), keep old-version anchors
   where an in-place upgrade from a patched install is needed.
3. Add the version to `TESTED_OPENCLAW_VERSIONS` in `lib/kit.mjs` only after a
   live guest query, a long run (placeholder + final edit), a sub-agent final
   and a file delivery have been observed on that version.
