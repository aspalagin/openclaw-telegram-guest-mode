# OpenClaw Telegram Guest Mode

Portable patch layer that adds Telegram Bot API guest-query support
(`supports_guest_queries` / `guest_message` / `answerGuestQuery`) to OpenClaw.
The scripts target OpenClaw `2026.7.1-2`.

This repository is an operator patch, not an upstream OpenClaw release. It
patches built `dist/*.js` bundles in an installed OpenClaw package, so review
it before running it on a production host.

## What it adds

- The Telegram poller subscribes to `guest_message` updates.
- A `bot.on("guest_message")` handler normalizes each guest query into the
  regular inbound pipeline — the same dedupe, media, and dispatch path as
  direct messages.
- Guest turns run in isolated OpenClaw sessions keyed with a
  `:guest:<scope>` session-key suffix, so guests never share history or
  context with the owner's sessions.
- The final reply is delivered as a single plain-text `answerGuestQuery`
  result with guarded fallbacks (see the design section).
- Guest answers are normalized to plain text: startup/model headers are
  stripped and accidental HTML falls back to its plain-text rendering.

## Status

In production since 2026-06-13 on two bots.

Upstream, the feature is discussed in openclaw/openclaw#79077; the design this
layer implements is described in
[this comment](https://github.com/openclaw/openclaw/issues/79077#issuecomment-5013547439).
A related upstream PR, openclaw/openclaw#83632, has gone stale. Until an
upstream implementation lands, this repository maintains the feature as a
portable dist patch layer pinned to one OpenClaw version at a time.

## Design and security model

- **Authorization is not bypassed.** Guest queries pass through the same
  `dmPolicy` / `allowFrom` gate as any other inbound Telegram message. The
  patch adds a transport, not a new access path.
- **Isolated guest sessions.** Each guest scope gets its own OpenClaw session
  via the `:guest:<scope>` session-key suffix. The scope is the caller chat
  id, else the caller user id, else the guest query id — lowercased,
  restricted to `[a-z0-9_-]`, and length-capped.
- **Single plain-text answer.** Guests receive exactly one text reply of at
  most 4096 characters (longer replies are truncated with an explicit
  marker), sent via `answerGuestQuery` with a 3-step call fallback:
  `bot.api.answerGuestQuery`, then `bot.api.raw.answerGuestQuery`, then a
  direct Bot API HTTP call. The last step matters for self-hosted
  `telegram-bot-api` servers whose client bindings do not expose the method
  yet; it uses the bot token from delivery options and never logs it.
- **Inline-or-dropped.** When Telegram reports the guest query as expired or
  invalid, the payload is dropped with a `[hotfix][guest-single-answer]` log
  line. There is deliberately no `sendMessage` fallback (changed in v1.1.1):
  the fallback chat id is the chat the query was typed in, which for private
  chats resolves to the operator's DM with the bot — a privacy leak.
- **At-most-once delivery.** A `guestAnswered` progress flag guards against
  duplicate answers, and durable replay is deliberately disabled for guest
  deliveries: guest queries are short-lived, so replaying one after a restart
  would answer into the void or double-send.
- **Single payload even in verbose mode.** Session-service extras that the
  runtime normally emits as separate payloads (the "🧭 New session" banner,
  the auto-compaction notice, the trailing plugin-status payload) are
  suppressed for `:guest:`-scoped sessions, so the one-shot `answerGuestQuery`
  always carries the actual reply (added in v1.1.1).
- **Reduced surface.** No streaming, no typing or voice cues, no reactions,
  and no media for guests. Media-only replies produce a plain-text
  placeholder.

## Install

Clone this repository on the OpenClaw host:

```bash
git clone https://github.com/aspalagin/openclaw-telegram-guest-mode.git
cd openclaw-telegram-guest-mode
```

Check syntax:

```bash
node --check apply-guest-mode.mjs
node --check check-guest-mode.mjs
```

Dry-run against the installed package (no files are written):

```bash
OPENCLAW_PACKAGE_ROOT=/usr/lib/node_modules/openclaw \
  node apply-guest-mode.mjs --dry-run
```

Apply:

```bash
OPENCLAW_PACKAGE_ROOT=/usr/lib/node_modules/openclaw \
  OPENCLAW_HOTFIX_BACKUP_DIR=./backups \
  node apply-guest-mode.mjs
```

Restart OpenClaw Gateway from a shell you control:

```bash
sudo systemctl restart openclaw-gateway
```

If you are operating from inside an OpenClaw Telegram session, do not restart
the gateway directly from that same session. Use SSH or schedule the restart
from an external shell.

The apply script is idempotent: re-running it reports every patch as `ok` and
`changed=0`.

## Verify

```bash
OPENCLAW_PACKAGE_ROOT=/usr/lib/node_modules/openclaw \
  node check-guest-mode.mjs
```

All seven patches are required; the checker exits with code 1 when any
signature is missing.

> **This patches the installed dist.** Any OpenClaw update (`npm install`,
> version upgrade, or reinstall) reverts the patched bundles. Re-run the apply
> script and the checker after every OpenClaw update. The scripts are pinned
> to OpenClaw `2026.7.1-2`: on any other version the signature guards refuse
> unmatched code, and the layer must be re-reviewed and re-tested before use.

## Uninstall

The apply script writes per-file backups before changing anything. By default
they go under `./backups/<timestamp>/`, or under `OPENCLAW_HOTFIX_BACKUP_DIR`
if you set it. To roll back, restore the changed files from the latest backup
directory, then restart the gateway.

For a full package rollback, reinstall the pinned OpenClaw package version or
restore your package-level backup.

## Privacy model (v1.1.0)

A guest reply is published **in a chat the bot does not own**, visible to
everyone in that conversation. Three properties enforce that this cannot leak
anything beyond the guest exchange itself:

- **Per-chat session scope.** The guest session key is scoped to
  `<callerId>-at-<chatId>`, so the same caller invoking the bot in two
  different chats gets two isolated sessions. Without this, context from a
  conversation with one third party surfaces in a reply published to another.
- **No operator transcript in guest prompts.** Guest turns skip the private
  session transcript that normal DM turns include, so the operator's private
  history can never reach a third-party chat.
- **Delivery tools denied at policy level.** Guest runs cannot call `message`,
  `sessions_spawn`, `cron`, `gateway`, or `nodes`. The earlier prompt-only hint
  was observed being ignored by the model, which then attempted to message an
  unrelated chat.

Diagnostics note: for guest updates the inbound log line prints the id of the
**chat where the query was typed** in the `from` field — not the sender. The
line now names the real caller explicitly (`(guest query by <id>)`); reading
the chat id as the sender has already caused one misdiagnosis.

## Known limitations

- **No rate limiting.** The patch itself does not throttle guest queries. If
  your bot is publicly discoverable, add rate limiting at your own proxy or
  bot-api front end.
- A few user-facing fallback strings (the truncation marker, the media
  placeholder, and the guest result title) are in Russian.
- **No config toggle.** Applying the patch enables the feature; to disable
  it, restore the bundles from `backups/`.
- **BotFather setup required.** Enable guest queries
  (`supports_guest_queries`) for the bot in BotFather; otherwise Telegram
  never delivers `guest_message` updates.

## AI assistance

This patch layer was developed with AI assistance and reviewed by the author.
