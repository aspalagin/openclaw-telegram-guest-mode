# OpenClaw Telegram Guest Mode

Portable patch layer that adds Telegram Bot API guest-query support
(`supports_guest_queries` / `guest_message` / `answerGuestQuery`, Bot API 10.3)
to OpenClaw. Version 1.2.1 targets OpenClaw `2026.9.7`.

This repository is an operator patch, not an upstream OpenClaw release. It
patches built `dist/*.mjs` bundles in an installed OpenClaw package, so review
it before running it on a production host.

## What it adds

- **Guest queries as a transport.** The Telegram poller receives
  `guest_message` updates; each guest query is normalized into the regular
  inbound pipeline (same dedupe, media and dispatch path as a direct message,
  same `dmPolicy` / `allowFrom` authorization gate).
- **Isolated guest sessions.** Guest turns run in sessions keyed
  `…:guest:<callerId>-at-<chatId>`: no shared history with the owner, and no
  shared history between two chats of the same caller. The owner's session
  transcript is never injected into a guest prompt.
- **One answer per query, edited in place.** The reply is delivered through
  `answerGuestQuery` (`bot.api` → `bot.api.raw` → direct Bot API HTTP call
  against the bot's configured `apiRoot`).
  Long runs no longer time out: after `ackAfterSeconds` a placeholder is
  answered, a heartbeat edits it with the elapsed time, and the final reply is
  written into the same inline message with `editMessageText` by
  `inline_message_id`. No placeholder yet → one direct answer, as before.
- **Rich replies.** Markdown answers go out as Telegram rich messages
  (`InputRichMessageContent` / `rich_message` in `editMessageText`), with an
  automatic plain-text retry when Telegram rejects the rich payload.
- **Sub-agent results reach the guest.** A guest turn may spawn sub-agents.
  Their completion finals (announce / settle-wake turns, including "private
  completion" with `deliver=false`) are appended to the guest's inline message
  instead of being sent to the chat recorded on the session (the owner's DM)
  or kept internal. Appended text is re-rendered as one rich document; the
  4096-character limit is enforced by trimming whole Markdown blocks, newest
  text first.
- **The `message` tool works from a guest turn.** Guest turns are classified
  as `user_request` (the gateway schema only accepts `user_request` /
  `room_event`), and the action runner normalizes any unknown kind.
- **Files and photos for the guest.** The bot is not a member of the guest's
  chat, and an inline message can only carry a `file_id` of an already uploaded
  file. A `message send` with media and no explicit target (or the guest chat
  as target) is rerouted to a **staging chat** you configure; the Bot API
  response's `file_id` is then inserted into the guest's inline message as a
  rich media block (`editMessageText` with `rich_message`), with an
  `editMessageMedia` fallback. The tool result carries `guestMediaDelivery`
  so the model knows whether the guest actually got the file.
- **Single payload even in verbose mode.** New-session banners, compaction
  notices, trailing status payloads and in-run progress are suppressed for
  guest sessions; a guest-session payload without a guest query id is never
  delivered as a plain message into someone's chat.
- **Optional: OpenAI Ultrafast for guests** (`--with-ultrafast`). Guest
  sessions (and any session keys you list) get `service_tier: "ultrafast"` by
  default on the `openai` provider, with an explicit `params.serviceTier`
  always taking precedence.

## Status

The author's private patch layer, from which this kit is extracted, has been
in production since 2026-06-13 on two bots; the kit itself exists since v1.0.0
(2026-07-19), and the 1.2.x feature set has been in production on OpenClaw
2026.9.7 since 2026-10-04.

Upstream, the feature is discussed in openclaw/openclaw#79077. Until an
upstream implementation lands, this repository maintains the feature as a
portable dist patch layer pinned to one OpenClaw version at a time.

## Layout

```
apply-guest-mode.mjs     apply (all-or-nothing, dry-run, backups, idempotent, upgrades older module versions)
check-guest-mode.mjs     signature checker (markers, anchors, drift guards)
lib/plan.mjs             target key → ordered module list
lib/kit.mjs              CLI options, content-based chunk locator, module contract
lib/patch-helpers.mjs    string helpers shared by the modules (replaceOnce, replaceRegion, assertions)
modules/*.mjs            one file per transformation (label, target needles, patch(), check assertions)
scripts/check-syntax.mjs node --check over every kit file (npm run check:syntax, cross-platform)
examples/                sample rules files
```

Chunks are located by **content needles**, never by hashed file names. The
modules are self-contained: nothing is imported from an operator's private
hotfix layer, and inserted code relies only on identifiers that the checker
asserts exist in the target chunk (lesson of v1.1.3).

## Install

```bash
git clone https://github.com/aspalagin/openclaw-telegram-guest-mode.git
cd openclaw-telegram-guest-mode
npm run check:syntax
```

Dry-run against the installed package (nothing is written; cascades are
computed in memory, syntax-checked and asserted). `--check` is a synonym of
`--dry-run`; `--json` prints a machine-readable report after the log lines:

```bash
OPENCLAW_PACKAGE_ROOT=/usr/lib/node_modules/openclaw node apply-guest-mode.mjs --dry-run
OPENCLAW_PACKAGE_ROOT=/usr/lib/node_modules/openclaw node apply-guest-mode.mjs --check --json
```

Options of `apply-guest-mode.mjs`: `--dry-run` | `--check`, `--package-root <dir>`
(or `OPENCLAW_PACKAGE_ROOT`), `--backup-dir <dir>` (or
`OPENCLAW_HOTFIX_BACKUP_DIR`), `--with-ultrafast` (or
`OPENCLAW_GUEST_MODE_ULTRAFAST=1`), `--allow-untested` (or
`OPENCLAW_GUEST_MODE_ALLOW_UNTESTED=1`), `--json`, `--help`. Unknown options,
missing option values and stray arguments are rejected with usage and exit
code 2. `check-guest-mode.mjs` accepts `--package-root`, `--with-ultrafast`,
`--json`, `--help`.

Apply (per-file backups under `./backups/<timestamp>/` or
`OPENCLAW_HOTFIX_BACKUP_DIR`):

```bash
OPENCLAW_PACKAGE_ROOT=/usr/lib/node_modules/openclaw node apply-guest-mode.mjs
# optional OpenAI Ultrafast default for guest sessions:
OPENCLAW_PACKAGE_ROOT=/usr/lib/node_modules/openclaw node apply-guest-mode.mjs --with-ultrafast
```

Verify, then restart the gateway from a shell you control (never from inside
an OpenClaw session that the restart would kill):

```bash
OPENCLAW_PACKAGE_ROOT=/usr/lib/node_modules/openclaw node check-guest-mode.mjs
sudo systemctl restart openclaw-gateway
```

Re-running apply reports `status=unchanged changed=0`; an install patched by
an earlier kit version (v1.1.x, v1.2.0) is upgraded in place. Two modules are
conditional and report `n/a` when they do not apply to your build:
`telegram-guest-allowed-update` (applied only when `DEFAULT_UPDATE_TYPES` of
the installed grammy lacks `guest_message`; grammy 1.46 pinned by 2026.9.7
already lists it) and `guest-announce-fallback-skip` (only relevant when a
separate "silent completion fallback" hotfix is installed).

> **This patches the installed dist.** Any OpenClaw update reverts the patched
> bundles: re-run apply and check after every update. The anchors are pinned
> to OpenClaw `2026.9.7` (`TESTED_OPENCLAW_VERSIONS` in `lib/kit.mjs`). On any
> other version the apply **refuses to run** (`status=refused`, nothing
> written) unless `--allow-untested` is given; with the flag, unmatched anchors
> still fail the whole run before anything is written, but matching anchors on
> another version are not a verified port — test on a copy and follow
> HOTFIX_NOTES.md "Porting" before using it on a live host. The checker only
> warns about an untested version.

## Configuration

### BotFather

Enable guest queries (`supports_guest_queries`) for the bot; otherwise
Telegram never delivers `guest_message` updates. Keep rich messages enabled for
the account if you want rich replies (`channels.telegram.richMessages`).

### Who may ask

Guest queries pass the same `dmPolicy` / `allowFrom` gate as direct messages.
With `dmPolicy: "allowlist"` only listed callers get answers; with `"open"`
anyone who can see the bot in a chat can query it — then add rate limiting at
your proxy or bot-api front end, the kit does not throttle.

### Rules file (hot-reloaded)

Path: `OPENCLAW_HOTFIX_GUEST_ACK_FILE`, else
`$OPENCLAW_STATE_DIR/hotfix-guest-ack.json`, else `~/.openclaw/hotfix-guest-ack.json`
(the home of the user running the gateway). Re-read on change (mtime+size
cache), no restart needed. Missing or invalid file → built-in defaults plus one
log warning. See `examples/hotfix-guest-ack.json`.

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | `false` disables placeholder/edit/append/media entirely (one `answerGuestQuery`, as in v1.1.x) |
| `ackAfterSeconds` | `45` (3–600) | when to answer the placeholder if the run has not finished |
| `placeholderText`, `etaText` | `"Working on it…"`, `""` | placeholder text (and optional suffix) |
| `progress.enabled`, `progress.minIntervalSeconds` | `true`, `15` (10–600) | heartbeat edits "⏱ Nm Ms"; interval grows to 60 s on long runs |
| `truncatedNote` | `"[Reply truncated: Telegram guest mode limit.]"` | appended when a reply or an appended document had to be trimmed to 4096 characters |
| `settleFailedText`, `settleEmptyText` | `"⚠️ The request could not be processed. Please try again."`, `"The request was processed but produced no text reply. Please rephrase it."` | service text written into the placeholder when the run fails / yields no text |
| `rich.enabled` | `true` | rich replies/edits; plain-text retry on any rich error |
| `appendLater`, `appendMax` | `true`, `5` (0–50) | late payloads of the same guest session (sub-agent finals) are appended to the answered message |
| `retentionMinutes` | `360` (1–2880) | how long an answered `inline_message_id` is remembered |
| `mediaStagingChatId` (alias `media.stagingChatId`) | *(empty = media disabled)* | chat id or `@username` the bot can post to; files for guests are uploaded there first |
| `media.enabled`, `media.maxBlocks` | `true`, `10` (1–20) | guest media delivery switch and attachments per guest message |

All user-facing strings default to English; `examples/hotfix-guest-ack.json`
shows the Russian set. One marker is fixed: when a single indivisible Markdown
block is longer than 4096 characters it is cut by characters with the English
`[Reply truncated: Telegram guest mode limit.]` (base helper of the delivery
cascade, not rules-driven).

The kit ships **no default staging chat**: set `mediaStagingChatId` (typically
the owner's DM with the bot, or a private service channel) before guests can
receive files. A copy of every file sent to a guest stays in that chat.

#### Guest media: limits and transport

- Local files (absolute path or `file://`) are uploaded **directly** by the
  kit: `fs.realpathSync` first, then the canonical path must lie inside one of
  the local media roots the message tool already enforces
  (`ctx.mediaAccess.localRoots`, fail-closed: no roots → every local file is
  denied; a symlink pointing outside the roots is denied). URLs and buffers go
  through the regular outbound pipeline and the `file_id` is picked up from
  the send result.
- Direct uploads: 50 MB per file; photos (jpeg/png/webp) ≤ 10 MB go as
  `sendPhoto`, gif → `sendAnimation`, `video/*` → `sendVideo`, `audio/*` →
  `sendAudio`, everything else (and `asDocument: true`) → `sendDocument`; a
  rejected photo/video/animation/audio upload is retried once as a document.
  MIME by extension: jpg/jpeg/png/webp/gif/heic/bmp, mp4/mov/webm/mkv,
  mp3/m4a/aac/ogg/oga/opus/wav/flac, pdf/md/txt/csv/json/html,
  docx/xlsx/pptx/zip; unknown → `application/octet-stream` (an explicit
  `contentType`/`mimeType` param wins).
- Uploads go through the bot's own grammy client (`bot.api.raw.sendX` with a
  grammy `InputFile`): the configured `channels.telegram.apiRoot`, proxy and
  per-account throttler all apply. Only when the bot object has no raw API, or
  grammy cannot be loaded, the kit falls back to a direct multipart HTTP call
  against the configured `apiRoot` (default `https://api.telegram.org`); the
  same `apiRoot` rule holds for every other HTTP fallback of the kit
  (`answerGuestQuery`, `editMessageText`, `editMessageMedia`,
  `editMessageCaption`).
- What the model sees: `payload.guestMediaDelivery = { delivered, mode,
  guestChatId, items: [{ fileName, delivered, mode, kind, size, reason }],
  note }`. The staging chat id and the Telegram `file_id` are not part of it;
  the standard send result (`to`, `messageId`) still names the staging chat,
  as for any send. Gateway log lines (`[hotfix][guest-media-staging]`,
  `[hotfix][guest-ack]`) print file names and sizes, never full paths or
  `file_id`s; the bot token is never logged.

### Ultrafast rules file (optional module)

Path: `OPENCLAW_HOTFIX_ULTRAFAST_SESSIONS_FILE`, else
`$OPENCLAW_STATE_DIR/hotfix-ultrafast-sessions.json`, else
`~/.openclaw/hotfix-ultrafast-sessions.json`. Keys: `enabled`,
`sessionKeyIncludes` (default `[":guest:"]`), `sessionKeyPrefixes` (key equals
the prefix or starts with `<prefix>:`), `sessionKeys` (exact). Only the
`openai` provider is affected; an explicit `serviceTier` in run, model or agent
params always wins. The set also patches `normalizeOpenAIServiceTier` to accept
`"ultrafast"` and keeps `service_tier=ultrafast` on the ChatGPT Codex backend
(where upstream strips all tiers). See `examples/hotfix-ultrafast-sessions.json`.

## Design and security model

- **Authorization is not bypassed.** The patch adds a transport, not a new
  access path.
- **Per-chat isolation.** Session scope is `<callerId>-at-<chatId>`; guest
  turns get no session transcript context (`sessionTranscript` is dropped for
  guest messages).
- **Tool policy for guest runs.** `gateway` is always denied in `:guest:`
  sessions. In sub-agent completion turns of a guest session (`runId` prefix
  `announce:`) `message` is denied too — their result must be *text*, which
  the kit edits into the guest's message. In interactive guest turns
  `message`, `sessions_spawn`, `cron` and `nodes` are available (v1.1.x denied
  them; the owner may re-tighten the list in
  `modules/guest-deny-delivery-tools.mjs`).
- **Inline-or-dropped.** A guest answer never falls back to `sendMessage`. A
  payload of a guest session without a guest query id and without an answered
  inline message to append to is dropped with a
  `[hotfix][guest-no-chat-fallback]` log line. Sub-agent finals that cannot be
  appended (expired entry, gateway restarted) are dropped with
  `[hotfix][guest-announce-final] dropping …` instead of being sent to the
  owner's chat.
- **At-most-once.** `guestAnswered` progress flag, durable replay disabled for
  guest deliveries, heartbeat/final race closed (the final waits for an
  in-flight heartbeat edit; heartbeats check `claimed`).
- **Reduced surface.** No streaming drafts, typing/voice cues or reactions for
  guests.

## Known limitations

- **Bot API constraints for inline messages.** Uploading new files into an
  inline message is impossible; only `file_id`/URL. `InputRichBlockDocument`
  is not accepted by Bot API for inline messages in practice — documents fall
  back to `editMessageMedia`, which turns the whole guest message into a media
  message with a caption (≤ 1024 characters; later text edits go to the
  caption, rich edits are retried as plain). Photos work as rich blocks.
  `video_note` and stickers cannot be attached.
- **Staging copy.** Every file delivered to a guest is also posted in the
  staging chat (that is where it is uploaded).
- **Gateway restart forgets inline messages.** The ack/edit registry lives in
  process memory; after a restart, late sub-agent finals for earlier guest
  queries are dropped (logged), not appended.
- **No rate limiting; no config toggle.** Applying the kit enables the
  feature; disable behaviour via the rules file (`enabled: false`) or roll
  back the bundles.
- **Rules file is the only i18n.** Placeholder, truncation note and settle
  texts come from the rules file (English defaults); the inline-result title
  and the character-level truncation marker are fixed English strings.
- **Code-mode tool catalog.** In code-mode sandboxes `catalog.search('message')`
  does not find directly visible tools; the guest hint tells the model to call
  the `message` global directly.

## Rollback

Restore the files listed in `backups/<timestamp>/manifest.json` from the
`.bak` copies next to it, then restart the gateway. For a full rollback
reinstall the pinned OpenClaw package. Disabling without rollback: set
`"enabled": false` in the rules file (placeholder/edit/append/media off,
single `answerGuestQuery` stays).

## AI assistance

This patch layer was developed with AI assistance and reviewed by the author.
