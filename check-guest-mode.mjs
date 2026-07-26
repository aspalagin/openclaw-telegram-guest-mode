#!/usr/bin/env node
// Signature checker for the OpenClaw Telegram Guest Mode patch layer
// (apply-guest-mode.mjs). All five patches are required: any missing
// signature fails the run with exit code 1. Run this after applying the
// patches and after every OpenClaw package update.
import fs from "node:fs";
import path from "node:path";

const packageRoot = process.env.OPENCLAW_PACKAGE_ROOT || "/usr/lib/node_modules/openclaw";
const distDir = path.join(packageRoot, "dist");
const expectedVersion = "2026.7.1-2";

function rel(file) {
  return path.relative("/", file);
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function walkJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function findOneJs(files, label, needles) {
  const matches = [];
  for (const file of files) {
    const content = readText(file);
    if (needles.every((needle) => content.includes(needle))) matches.push({ file, content });
  }
  if (matches.length === 0) throw new Error(`could not locate ${label}`);
  if (matches.length > 1) {
    throw new Error(`located multiple ${label}: ${matches.map((match) => rel(match.file)).join(", ")}`);
  }
  return matches[0];
}

function contains(needle, detail = needle) {
  return (content) => content.includes(needle) ? null : `missing ${detail}`;
}

function runCheck(files, check) {
  try {
    const target = check.locate(files);
    const failures = check.assertions.map((assertion) => assertion(target.content, target.file)).filter(Boolean);
    return { ...check, ok: failures.length === 0, file: target.file, failures };
  } catch (err) {
    return { ...check, ok: false, file: null, failures: [err instanceof Error ? err.message : String(err)] };
  }
}

const checks = [
  {
    id: "telegram-guest-allowed-update",
    locate: (files) => findOneJs(files, "Telegram allowed updates bundle", [
      "resolveTelegramAllowedUpdates",
      "message_reaction",
      "channel_post",
    ]),
    assertions: [
      contains('updates.includes("guest_message")', "guest_message allowed update"),
    ],
  },
  {
    id: "telegram-guest-mode-bot",
    locate: (files) => findOneJs(files, "Telegram bot bundle", [
      "handleInboundMessageLike",
      "buildChannelInboundEventContext",
      "sendTyping",
    ]),
    assertions: [
      contains('bot.on("guest_message"', "guest_message handler"),
      contains("resolveTelegramGuestSessionKey", "guest session key helper"),
      contains("const isGuest = Boolean(guestQueryId);", "guest mode flag"),
      contains('GuestMode: msg.guest_query_id ? true : void 0', "GuestMode context flag"),
      contains("GuestQueryId", "GuestQueryId context field"),
      contains("if (isGuest) return;", "guest typing/voice cue suppression"),
      contains("guestModeDeliveryHint", "guest delivery hint"),
    ],
  },
  {
    id: "telegram-guest-mode-delivery",
    locate: (files) => findOneJs(files, "Telegram delivery bundle", [
      "deliverTextReply",
      "sendChunkedTelegramReplyText",
      "formatErrorMessage",
    ]),
    assertions: [
      contains("answerGuestQuery", "answerGuestQuery API path"),
      contains("answerTelegramGuestQueryViaOfficialApi", "official API fallback"),
      contains("sendTelegramGuestText", "guest text sender"),
      contains("params.progress.guestAnswered", "guest duplicate-send guard"),
      contains("guestQueryId", "guest query id delivery option"),
    ],
  },
  {
    id: "guest-plain-bot-hint",
    locate: (files) => findOneJs(files, "Telegram bot bundle", [
      "handleInboundMessageLike",
      "buildChannelInboundEventContext",
      "sendTyping",
    ]),
    assertions: [
      contains("Do not include model/context/status headers", "extended guest plain-text hint"),
    ],
  },
  {
    id: "guest-plain-delivery-normalize",
    locate: (files) => findOneJs(files, "Telegram delivery bundle", [
      "deliverTextReply",
      "sendChunkedTelegramReplyText",
      "formatErrorMessage",
    ]),
    assertions: [
      contains("function normalizeTelegramGuestPlainText(text)", "guest plain normalize helper"),
      contains("TELEGRAM_GUEST_MODEL_HEADER_RE", "guest model-header strip regex"),
    ],
  },
  {
    // v1.1.0 privacy hardening: per-chat guest session scope, prompt-context isolation,
    // and an honest inbound log line naming the real caller.
    id: "guest-privacy-hardening",
    locate: (files) => findOneJs(files, "Telegram bot bundle", [
      "handleInboundMessageLike",
      "buildChannelInboundEventContext",
      "sendTyping",
    ]),
    assertions: [
      contains("`${callerUserId}-at-${chatScope}`", "per-chat guest session scope"),
      contains("isGroup || isSessionBoundaryMessage || isGuestMessage ? []", "guest prompt-context isolation"),
      contains("(guest query by ${context.ctxPayload.SenderId", "guest caller named in inbound log"),
    ],
  },
  {
    // v1.1.0 privacy hardening: delivery/spawn tools denied at policy level in guest runs.
    id: "guest-deny-delivery-tools",
    locate: (files) => findOneJs(files, "agent tools policy bundle", [
      'label: "gateway sender owner-only tools"',
      "const ownerOnlyCoreToolPolicy = ownerOnlyCoreToolDenylist.length > 0",
    ]),
    assertions: [
      contains('label: "guest session tools.deny"', "guest deny policy step"),
      contains('options.sessionKey.includes(":guest:")', "guest session gate"),
    ],
  },
];

function main() {
  if (!fs.existsSync(distDir)) throw new Error(`dist directory does not exist: ${distDir}`);
  const pkg = JSON.parse(readText(path.join(packageRoot, "package.json")));
  const files = walkJs(distDir);
  const results = checks.map((check) => runCheck(files, check));
  const failed = results.filter((result) => !result.ok);

  console.log(`[openclaw-guest-mode] package=${pkg.name ?? "openclaw"}@${pkg.version ?? "unknown"} root=${packageRoot}`);
  if (pkg.version !== expectedVersion) {
    console.log(`[openclaw-guest-mode] warn: version differs from tested baseline ${expectedVersion}; review signatures before treating this as green`);
  }
  for (const result of results) {
    const filePart = result.file ? ` ${rel(result.file)}` : "";
    console.log(`[${result.ok ? "ok" : "fail"}] ${result.id}${filePart}`);
    for (const failure of result.failures) console.log(`  - ${failure}`);
  }
  console.log(`[openclaw-guest-mode] summary ok=${results.length - failed.length} failed=${failed.length}`);
  if (failed.length > 0) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error(`[openclaw-guest-mode] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
