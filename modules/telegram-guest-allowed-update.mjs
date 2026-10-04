// Module telegram-guest-allowed-update. CONDITIONAL.
// The Telegram poller must subscribe to `guest_message` updates. OpenClaw derives its allowed-updates list
// from grammy's API_CONSTANTS.DEFAULT_UPDATE_TYPES; grammy >= 1.46.0 (pinned by OpenClaw 2026.9.x) already
// lists "guest_message" there, so on such installs this module is "not applicable" and the chunk is left
// untouched (the kit still asserts the upstream derivation and filter are unchanged). On a build whose
// grammy lacks guest_message, the module pushes it explicitly next to message_reaction.
import fs from "node:fs";
import path from "node:path";
import { replaceOnce, contains } from "../lib/patch-helpers.mjs";
export const label = "telegram-guest-allowed-update";
export const target = { key: "allowed", label: "Telegram allowed updates bundle", needles: ["DEFAULT_TELEGRAM_UPDATE_TYPES", "message_reaction", "channel_post"] };
const PATCH_LINE = '\tif (!updates.includes("guest_message")) updates.push("guest_message");\n';
function grammyHasGuestMessage(file) {
  // file = <packageRoot>/dist/<chunk>; grammy lives in <packageRoot>/node_modules/grammy
  try {
    const root = path.resolve(path.dirname(file), "..");
    const botJs = path.join(root, "node_modules", "grammy", "out", "bot.js");
    if (!fs.existsSync(botJs)) return null; // unknown
    const s = fs.readFileSync(botJs, "utf8");
    const i = s.indexOf("DEFAULT_UPDATE_TYPES = [");
    const j = i < 0 ? -1 : s.indexOf("];", i);
    if (i < 0 || j < 0) return null;
    return s.slice(i, j).includes('"guest_message"');
  } catch { return null; }
}
export function applicable(source, file) {
  if (source.includes('updates.includes("guest_message")')) return null; // already patched: keep managing it
  return grammyHasGuestMessage(file) === true ? "not applicable: grammy DEFAULT_UPDATE_TYPES already includes guest_message" : null;
}
export function patch(source) {
  if (source.includes('updates.includes("guest_message")')) return source;
  return replaceOnce(
    source,
    '\tif (!updates.includes("message_reaction")) updates.push("message_reaction");',
    `${PATCH_LINE}\tif (!updates.includes("message_reaction")) updates.push("message_reaction");`,
    "guest_message allowed update",
  );
}
export const check = { assertions: [
  contains("const DEFAULT_TELEGRAM_UPDATE_TYPES = API_CONSTANTS.DEFAULT_UPDATE_TYPES;", "allowed updates derived from grammy API_CONSTANTS.DEFAULT_UPDATE_TYPES"),
  contains('const updates = DEFAULT_TELEGRAM_UPDATE_TYPES.filter((type) => type !== "stopped_message_generation");', "upstream filter of default update types (guest_message must not be filtered out)"),
  (c, file) => c.includes('updates.includes("guest_message")') || grammyHasGuestMessage(file) === true ? null : "guest_message neither pushed explicitly nor present in grammy DEFAULT_UPDATE_TYPES (poller will not receive guest queries)",
] };
