// Метка telegram-sent-media-file-ids (new 2026-10-04; чанк send-CsZVcm0x.mjs, extensions/telegram/src/send-message-media.ts).
// Часть дефекта B (медиа гостю через staging): Bot API 10.3 позволяет вложить в inline-сообщение
// гостя только file_id УЖЕ загруженного файла. Файл сначала уходит штатным send в staging-чат, но результат доставки ядра ({messageId, chatId,
// receipt}) file_id не несёт, а сам ответ Bot API (Message с document/photo/…) виден только здесь, в acceptMany медиа-частей.
// Пишем file_id в ограниченный реестр на globalThis.__openclawHotfixTelegramSentMedia (Map "chatId:messageId" → {kind, fileId, fileName, mimeType,
// size, …}, не больше 300 записей, старые вытесняются) — его читает порт guest-media-staging-runner (тот же процесс gateway) по messageId из
// результата send. Запись для всех исходящих медиа Telegram (дёшево, bounded); схема результатов/receipt не меняется.
import { replaceOnce, insertBefore, contains, notContains } from "../lib/patch-helpers.mjs";
export const label = "telegram-sent-media-file-ids";
export const verdict = "port";
export const target = { key: "telegramSend", label: "Telegram send bundle (send-message-media)", needles: ["await sender.acceptMany(mediaParts, async (part) => {", "//#region extensions/telegram/src/outbound-media.ts\n"] };
const MARK = "hotfix: telegram-sent-media-file-ids";
const HELPER = `//#region ${MARK} (2026-10-04): file_id исходящих медиа → globalThis.__openclawHotfixTelegramSentMedia (для вложения в inline-сообщение гостя)
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
\t// v2: rich message со встроенным медиа (prefer-payload/rich-embed) — первый медиа-блок rich_message.blocks (вложенные blocks тоже)
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
// v2: rich message со встроенным локальным медиа (sendRich в prepared sender) — результат sendRichMessage тоже несёт file_id (rich_message.blocks)
const RICH_OLD = "\t\t\t\t\t\t} finally {\n\t\t\t\t\t\t\treleaseTelegramRichLocalMedia(attached.ids);\n\t\t\t\t\t\t}\n\t\t\t\t\t\tconst acceptedParams = {\n\t\t\t\t\t\t\t...sent.acceptedParams,\n\t\t\t\t\t\t\t...markup\n\t\t\t\t\t\t};\n";
const RICH_NEW = `\t\t\t\t\t\t} finally {\n\t\t\t\t\t\t\treleaseTelegramRichLocalMedia(attached.ids);\n\t\t\t\t\t\t}\n\t\t\t\t\t\tif (attached.ids.length > 0) hotfixRecordTelegramSentMedia(String(sent?.result?.chat?.id ?? config.chatId), sent?.result?.message_id, sent?.result); // ${MARK} (rich-embedded media)\n\t\t\t\t\t\tconst acceptedParams = {\n\t\t\t\t\t\t\t...sent.acceptedParams,\n\t\t\t\t\t\t\t...markup\n\t\t\t\t\t\t};\n`;
const HELPER_START = `//#region ${MARK}`;
function replaceHelper(source) {
  const start = source.indexOf(HELPER_START);
  if (start === -1) return insertBefore(source, "//#region extensions/telegram/src/outbound-media.ts\n", HELPER, "telegram sent-media registry helper");
  const endIdx = source.indexOf("//#endregion\n", start);
  if (endIdx === -1) throw new Error("telegram-sent-media-file-ids: helper region without //#endregion");
  return `${source.slice(0, start)}${HELPER}${source.slice(endIdx + "//#endregion\n".length)}`;
}
// Kit v1.2.0: the rich-embedded hook (RICH_OLD/RICH_NEW) anchors on code that only exists when the
// operator's separate "rich local media" hotfix is installed (releaseTelegramRichLocalMedia). Vanilla
// OpenClaw has no such path: local media sent together with text goes through acceptMany, so the
// first hook already records the file_id. The rich hook is applied only when its anchor exists.
const hasRichLocalMediaPath = (source) => source.includes("releaseTelegramRichLocalMedia(attached.ids);");
export function patch(source) {
  const wantRich = hasRichLocalMediaPath(source);
  if (source.includes(CALL_NEW) && source.includes(HELPER) && (!wantRich || source.includes(RICH_NEW))) return source;
  let next = source.includes(HELPER) ? source : replaceHelper(source);
  if (!next.includes(CALL_NEW)) next = replaceOnce(next, CALL_OLD, CALL_NEW, "acceptMany media part → record file_id");
  if (wantRich && !next.includes(RICH_NEW)) next = replaceOnce(next, RICH_OLD, RICH_NEW, "sendRich result → record file_id of rich-embedded media");
  return next;
}
export const check = { gate: "required", assertions: [
  contains(HELPER, "реестр file_id исходящих медиа (helper целиком)"),
  contains(CALL_NEW, "запись file_id в acceptMany медиа-частей"),
  contains("globalThis.__openclawHotfixTelegramSentMedia", "глобальный реестр file_id"),
  (src) => !hasRichLocalMediaPath(src) || src.includes(RICH_NEW) ? null : "rich-local-media path present but file_id of rich-embedded media is not recorded (v2 hook missing)",
  (src) => { const n = src.split("hotfixRecordTelegramSentMedia(").length - 1; const want = hasRichLocalMediaPath(src) ? 3 : 2; return n === want ? null : `hotfixRecordTelegramSentMedia ожидался ${want} раза (объявление + вызовы), найдено ${n}`; },
  (src) => (src.split(HELPER_START).length - 1) === 1 ? null : "регион helper telegram-sent-media объявлен не один раз",
  (src) => (src.split("await sender.acceptMany(mediaParts, async (part) => {").length - 1) === 1 ? null : "ожидался ровно один acceptMany медиа-частей (дрейф: второй путь отправки медиа без записи file_id?)",
  contains("import { r as logVerbose", "logVerbose в чанке"),
  contains("t as formatErrorMessage } from \"./errors-", "formatErrorMessage в чанке"),
] };
