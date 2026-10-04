// Module telegram-sent-media-file-ids (Telegram send bundle, extensions/telegram/src/send-message-media.ts).
// Part of guest media delivery through the staging chat: Bot API 10.3 lets a guest inline message carry only the
// file_id of an ALREADY uploaded file. The file first goes to the staging chat through the regular send, but the core
// delivery result ({messageId, chatId, receipt}) carries no file_id, and the Bot API response (Message with
// document/photo/…) is only visible here, in acceptMany of the media parts. The file_id is written into a bounded
// registry on globalThis.__openclawHotfixTelegramSentMedia (Map "chatId:messageId" → {kind, fileId, fileName, mimeType,
// size, …}, at most 300 entries, oldest evicted), read by guest-media-staging-runner (same gateway process) by the
// messageId of the send result. Recorded for all outgoing Telegram media (cheap, bounded); result/receipt schemas are unchanged.
// hotfixTelegramSentMediaDescriptor has a reduced copy in guest-media-staging-delivery (different chunk) — keep them in sync.
import { replaceOnce, replaceRegion, contains, count } from "../lib/patch-helpers.mjs";
export const label = "telegram-sent-media-file-ids";
export const target = { key: "telegramSend", label: "Telegram send bundle (send-message-media)", needles: ["await sender.acceptMany(mediaParts, async (part) => {", "//#region extensions/telegram/src/outbound-media.ts\n"] };
const MARK = "hotfix: telegram-sent-media-file-ids";
const HELPER_START = `//#region ${MARK}`;
const HELPER = `${HELPER_START} v3: file_id of outgoing media → globalThis.__openclawHotfixTelegramSentMedia (for attaching to a guest inline message)
const HOTFIX_TELEGRAM_SENT_MEDIA_MAX = 300;
const hotfixTelegramSentMedia = globalThis.__openclawHotfixTelegramSentMedia ?? (globalThis.__openclawHotfixTelegramSentMedia = new Map());
function hotfixTelegramSentMediaDescriptor(message) {
\tif (!message || typeof message !== "object") return;
\tif (message.animation?.file_id) return { kind: "animation", fileId: message.animation.file_id, fileUniqueId: message.animation.file_unique_id, fileName: message.animation.file_name, mimeType: message.animation.mime_type, size: message.animation.file_size };
\tif (Array.isArray(message.photo) && message.photo.length > 0) {
\t\tconst best = message.photo[message.photo.length - 1];
\t\tif (best?.file_id) return { kind: "photo", fileId: best.file_id, fileUniqueId: best.file_unique_id, width: best.width, height: best.height, size: best.file_size };
\t}
\tif (message.document?.file_id) return { kind: "document", fileId: message.document.file_id, fileUniqueId: message.document.file_unique_id, fileName: message.document.file_name, mimeType: message.document.mime_type, size: message.document.file_size };
\tif (message.video?.file_id) return { kind: "video", fileId: message.video.file_id, fileUniqueId: message.video.file_unique_id, fileName: message.video.file_name, mimeType: message.video.mime_type, size: message.video.file_size };
\tif (message.audio?.file_id) return { kind: "audio", fileId: message.audio.file_id, fileUniqueId: message.audio.file_unique_id, fileName: message.audio.file_name, mimeType: message.audio.mime_type, size: message.audio.file_size };
\tif (message.voice?.file_id) return { kind: "voice", fileId: message.voice.file_id, fileUniqueId: message.voice.file_unique_id, mimeType: message.voice.mime_type, size: message.voice.file_size };
\tif (message.video_note?.file_id) return { kind: "video_note", fileId: message.video_note.file_id, fileUniqueId: message.video_note.file_unique_id, size: message.video_note.file_size };
\tif (message.sticker?.file_id) return { kind: "sticker", fileId: message.sticker.file_id, fileUniqueId: message.sticker.file_unique_id, size: message.sticker.file_size };
\t// rich message with embedded media (prefer-payload/rich-embed): the first media block of rich_message.blocks (nested blocks too)
\tconst blocks = Array.isArray(message.rich_message?.blocks) ? message.rich_message.blocks : [];
\tconst stack = [...blocks];
\twhile (stack.length > 0) {
\t\tconst block = stack.shift();
\t\tif (!block || typeof block !== "object") continue;
\t\tconst found = hotfixTelegramSentMediaDescriptor({ photo: block.type === "photo" ? block.photo : void 0, document: block.type === "document" ? block.document : void 0, video: block.type === "video" ? block.video : void 0, animation: block.type === "animation" ? block.animation : void 0, audio: block.type === "audio" ? block.audio : void 0, voice: block.type === "voice_note" ? block.voice_note : void 0 });
\t\tif (found) return { ...found, fromRichBlock: true };
\t\tif (Array.isArray(block.blocks)) stack.unshift(...block.blocks);
\t}
}
function hotfixRecordTelegramSentMedia(chatId, messageId, message) {
\ttry {
\t\tconst descriptor = hotfixTelegramSentMediaDescriptor(message);
\t\tif (!descriptor || chatId == null || messageId == null) return;
\t\tconst key = \`\${String(chatId)}:\${String(messageId)}\`;
\t\thotfixTelegramSentMedia.delete(key);
\t\thotfixTelegramSentMedia.set(key, { ...descriptor, chatId: String(chatId), messageId: String(messageId), caption: typeof message.caption === "string" ? message.caption : void 0, at: Date.now() });
\t\twhile (hotfixTelegramSentMedia.size > HOTFIX_TELEGRAM_SENT_MEDIA_MAX) {
\t\t\tconst oldest = hotfixTelegramSentMedia.keys().next().value;
\t\t\tif (oldest === void 0) break;
\t\t\thotfixTelegramSentMedia.delete(oldest);
\t\t}
\t} catch (err) {
\t\tlogVerbose(\`[hotfix][telegram-sent-media] record failed: \${formatErrorMessage(err)}\`);
\t}
}
//#endregion
`;
const CALL_OLD = "\t\t\t\tconst resolvedChatId = String(part.result.chat?.id ?? chatId);\n\t\t\t\tconst meta = {\n";
const CALL_NEW = `\t\t\t\tconst resolvedChatId = String(part.result.chat?.id ?? chatId);\n\t\t\t\thotfixRecordTelegramSentMedia(resolvedChatId, part.messageId, part.result); // ${MARK}\n\t\t\t\tconst meta = {\n`;
// Rich message with embedded local media (sendRich in the prepared sender) — the sendRichMessage result also carries the file_id (rich_message.blocks).
const RICH_OLD = "\t\t\t\t\t\t} finally {\n\t\t\t\t\t\t\treleaseTelegramRichLocalMedia(attached.ids);\n\t\t\t\t\t\t}\n\t\t\t\t\t\tconst acceptedParams = {\n\t\t\t\t\t\t\t...sent.acceptedParams,\n\t\t\t\t\t\t\t...markup\n\t\t\t\t\t\t};\n";
const RICH_NEW = `\t\t\t\t\t\t} finally {\n\t\t\t\t\t\t\treleaseTelegramRichLocalMedia(attached.ids);\n\t\t\t\t\t\t}\n\t\t\t\t\t\tif (attached.ids.length > 0) hotfixRecordTelegramSentMedia(String(sent?.result?.chat?.id ?? config.chatId), sent?.result?.message_id, sent?.result); // ${MARK} (rich-embedded media)\n\t\t\t\t\t\tconst acceptedParams = {\n\t\t\t\t\t\t\t...sent.acceptedParams,\n\t\t\t\t\t\t\t...markup\n\t\t\t\t\t\t};\n`;
// The rich-embedded hook (RICH_OLD/RICH_NEW) anchors on code that only exists when the operator's separate "rich local
// media" hotfix is installed (releaseTelegramRichLocalMedia). Vanilla OpenClaw has no such path: local media sent
// together with text goes through acceptMany, so the first hook already records the file_id. The rich hook is applied
// only when its anchor exists.
const hasRichLocalMediaPath = (source) => source.includes("releaseTelegramRichLocalMedia(attached.ids);");
export function patch(source) {
  const wantRich = hasRichLocalMediaPath(source);
  if (source.includes(CALL_NEW) && source.includes(HELPER) && (!wantRich || source.includes(RICH_NEW))) return source;
  let next = source.includes(HELPER) ? source : replaceRegion(source, { start: HELPER_START, body: HELPER, anchor: "//#region extensions/telegram/src/outbound-media.ts\n", label: "telegram sent-media registry helper" });
  if (!next.includes(CALL_NEW)) next = replaceOnce(next, CALL_OLD, CALL_NEW, "acceptMany media part → record file_id");
  if (wantRich && !next.includes(RICH_NEW)) next = replaceOnce(next, RICH_OLD, RICH_NEW, "sendRich result → record file_id of rich-embedded media");
  return next;
}
export const check = { assertions: [
  contains(HELPER, "file_id registry of outgoing media (whole helper)"),
  contains(CALL_NEW, "file_id recorded in acceptMany of media parts"),
  contains("globalThis.__openclawHotfixTelegramSentMedia", "global file_id registry"),
  (src) => !hasRichLocalMediaPath(src) || src.includes(RICH_NEW) ? null : "rich-local-media path present but file_id of rich-embedded media is not recorded (rich hook missing)",
  (src) => { const n = count(src, "hotfixRecordTelegramSentMedia("); const want = hasRichLocalMediaPath(src) ? 3 : 2; return n === want ? null : `hotfixRecordTelegramSentMedia expected ${want} times (declaration + calls), found ${n}`; },
  (src) => count(src, HELPER_START) === 1 ? null : "telegram-sent-media helper region declared more than once",
  (src) => count(src, "await sender.acceptMany(mediaParts, async (part) => {") === 1 ? null : "exactly one acceptMany of media parts expected (drift: a second media send path without file_id recording?)",
  contains("import { r as logVerbose", "logVerbose in the chunk"),
  contains("t as formatErrorMessage } from \"./errors-", "formatErrorMessage in the chunk"),
] };
