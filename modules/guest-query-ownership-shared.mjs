// Portable OpenClaw 2026.10.9: guest-query-ownership-shared.
import { replaceOnce } from "../lib/patch-helpers.mjs";
import { installGuestQueryOwnership } from "./guest-query-ownership-runtime.mjs";
const one = (s,a,b) => replaceOnce(s,a,b,"guest query ownership v1: " + a.slice(0,100));
export function patchRegistry(s) {
  s = one(s, 'function hotfixGuestAckLog(entry, message) {', installGuestQueryOwnership.toString() + '\ninstallGuestQueryOwnership();\nfunction hotfixGuestAckLog(entry, message) {');
  s = one(s, 'entry.expiresAt <= now && entry.state !== "armed" && entry.state !== "inflight"', 'entry.expiresAt <= now');
  s = one(s, '\t\thotfixGuestAckRegistry.byQuery.delete(key);', '\t\tentry.state = "closed";\n\t\thotfixGuestAckRegistry.byQuery.delete(key);\n\t\tfor (const [runId, owner] of hotfixGuestAckRegistry.byRun) if (owner?.guestQueryId === key) hotfixGuestAckRegistry.byRun.delete(runId);');
  s = one(s, 'if (entry.state !== "armed") return;', 'if (entry.state !== "armed" || entry.expiresAt <= Date.now()) return;');
  s = one(s, '\t\ttableMode: input.tableMode,', '\t\ttableMode: input.tableMode,\n\t\tmediaLocalRoots: Array.isArray(input.mediaLocalRoots) ? [...input.mediaLocalRoots] : [],');
  s = one(s, '\t\t\tif (entry.settled) return;', '\t\t\tif (entry.settled) return;\n\t\t\tif (info?.denied) { entry.settled = true; hotfixGuestAckClearTimers(entry); entry.state = "closed"; return; }\n\t\t\t// Admission returning is not actual queued completion.\n\t\t\tif (info?.admissionOnly && !info?.failed && entry.state !== "answered") return;');
  s = one(s, '\tconst entry = hotfixGuestAckRegistry.resolveBySession(sessionKey);', '\tconst entry = hotfixGuestAckRegistry.resolveOwner(sessionKey, options);');
  s = one(s, '\tconst entry = hotfixGuestAckRegistry.resolveBySession(params.sessionKeyForInternalHooks);', '\tconst entry = hotfixGuestAckRegistry.resolveOwner(params.sessionKeyForInternalHooks, { guestQueryId: (params.guestQueryId), runId: params.runId });');
  s = one(s, 'if (!entry.rules.progressEnabled || entry.state !== "placeholder") return;', 'if (!entry.rules.progressEnabled || entry.state !== "placeholder" || entry.expiresAt <= Date.now()) return;');
  s = one(s, 'if (entry.state !== "placeholder" || entry.settled || entry.claimed) return;', 'if (entry.state !== "placeholder" || entry.settled || entry.claimed || entry.expiresAt <= Date.now()) return;');
  s = one(s, 'async function hotfixGuestAckAppendToAnswered(entry, texts, options) {', [
    'async function hotfixGuestAckAppendToAnswered(entry, texts, options) {',
    '  if (!entry) return;',
    '  const current = (entry.mediaQueue ?? Promise.resolve()).catch(() => void 0).then(() => hotfixGuestAckAppendToAnsweredNow(entry, texts, options));',
    '  entry.mediaQueue = current;',
    '  try { return await current; } finally { if (entry.mediaQueue === current) entry.mediaQueue = void 0; }',
    '}',
    'async function hotfixGuestAckAppendToAnsweredNow(entry, texts, options) {'
  ].join('\n'));
  return s;
}
export function patchMedia(s) {
  s = s.split('\tconst entry = hotfixGuestAckRegistry.resolveBySession(sessionKey);').join('\tconst entry = hotfixGuestAckRegistry.resolveOwner(sessionKey, item);');
  s = one(s, '\t\tif (entry.inflight) await entry.inflight.catch(() => void 0);', '\t\tif (hotfixGuestAckRegistry.resolveOwner(sessionKey, item) !== entry) return { delivered: false, reason: "guest query expired" };\n\t\titem.assertCurrent?.();\n\t\tif (entry.inflight) await entry.inflight.catch(() => void 0);');
  s = one(s, '\t\treturn await hotfixGuestAckEditInlineBase(entry, content);\n\t}\n};', '\t\tthrow err; // Never erase attachments and report text-only success.\n\t}\n};');
  s = one(s, 'edit with media blocks failed, retrying without media (attachment may be lost)', 'edit with media blocks failed; preserving attachment and failing closed');
  const start = s.indexOf('\tlet stat;\n', s.indexOf('hotfixGuestAckRegistry.stageAndAttachMedia ='));
  const end = s.indexOf('\tconst upload = async (plan) =>', start);
  if (start < 0 || end < 0) throw new Error('media validation anchor missing');
  s = s.slice(0,start) + [
    '  if (!filePath.startsWith("/") || !Array.isArray(entry.mediaLocalRoots) || !entry.mediaLocalRoots.length) return { delivered: false, reason: "guest completion supports local files within captured media roots only" };',
    '  let loaded;',
    '  try {',
    '    item.assertCurrent?.();',
    '    loaded = await loadWebMedia(filePath, { localRoots: entry.mediaLocalRoots, maxBytes: HOTFIX_GUEST_MEDIA_MAX_UPLOAD_BYTES, optimizeImages: false });',
    '  } catch (err) { return { delivered: false, reason: "guest media access denied: " + formatErrorMessage(err) }; }',
    '  const buffer = loaded.buffer;',
    '  const stat = { size: buffer.length };',
    '  if (!stat.size || stat.size > HOTFIX_GUEST_MEDIA_MAX_UPLOAD_BYTES) return { delivered: false, reason: "guest media size invalid" };',
    '  const fileName = typeof item.fileName === "string" && item.fileName.trim() ? item.fileName.trim() : loaded.fileName || filePath.split("/").pop() || "file";',
    '  const mime = loaded.contentType || hotfixGuestMediaMime(fileName, item.mimeType);',
    '  const caption = hotfixGuestMediaCaption(item.caption);', ''
  ].join('\n') + s.slice(end);
  s = one(s, '{ ...descriptor, fileName: descriptor.fileName ?? fileName, caption: item.caption }', '{ ...descriptor, fileName: descriptor.fileName ?? fileName, caption: item.caption, guestQueryId: entry.guestQueryId, runId: item.runId, assertCurrent: item.assertCurrent }');
  s = one(s, '\treturn { ...attached, stagingMessageId,', '\treturn { ...attached, guestQueryId: entry.guestQueryId, stagingMessageId,');

  for (const [a,b] of [
  [
    "\tlet message;\n\ttry {\n\t\tmessage = await upload(plan);\n\t} catch (err) {\n\t\tif (plan.method === \"sendDocument\") {\n\t\t\thotfixGuestAckLog(entry, `staging upload failed (${plan.method}): ${formatErrorMessage(err)}`);\n\t\t\treturn { delivered: false, reason: `staging upload failed (${plan.method}): ${formatErrorMessage(err)}` };\n\t\t}\n\t\thotfixGuestAckLog(entry, `staging upload ${plan.method} failed, retrying as document: ${formatErrorMessage(err)}`);\n\t\tplan = { method: \"sendDocument\", field: \"document\", kind: \"document\" };\n\t\ttry {\n\t\t\tmessage = await upload(plan);\n\t\t} catch (err2) {\n\t\t\thotfixGuestAckLog(entry, `staging upload failed (sendDocument): ${formatErrorMessage(err2)}`);\n\t\t\treturn { delivered: false, reason: `staging upload failed: ${formatErrorMessage(err)}; sendDocument: ${formatErrorMessage(err2)}` };\n\t\t}\n\t}\n",
    "\tlet message;\n\ttry { message = await upload(plan); }\n\tcatch (error) {\n\t\tif (plan.method !== \"sendDocument\" && error.guestDocumentFallback === true) {\n\t\t\tplan = { method: \"sendDocument\", field: \"document\", kind: \"document\" };\n\t\t\ttry { message = await upload(plan); }\n\t\t\tcatch (error2) { return { delivered: false, attempted: uploadAttempted, ambiguous: uploadAttempted && error2.guestDefinitiveReject !== true, reason: formatErrorMessage(error2) }; }\n\t\t} else return { delivered: false, attempted: uploadAttempted, ambiguous: uploadAttempted && error.guestDefinitiveReject !== true, reason: formatErrorMessage(error) };\n\t}\n"
  ],
  [
    "if (!descriptor?.fileId) return { delivered: false, reason:",
    "if (!descriptor?.fileId) return { delivered: false, attempted: true, ambiguous: true, reason:"
  ],
  [
    "\tconst attached = await hotfixGuestAckRegistry.attachMediaBySession(sessionKey, { ...descriptor, fileName: descriptor.fileName ?? fileName, caption: item.caption, guestQueryId: entry.guestQueryId, runId: item.runId, assertCurrent: item.assertCurrent });\n\treturn { ...attached, guestQueryId: entry.guestQueryId, stagingMessageId, stagingChatId: resolvedStagingChatId, uploadMethod: plan.method, kind: descriptor.kind, fileId: descriptor.fileId, fileName: descriptor.fileName ?? fileName, size: stat.size };",
    "\tlet attached;\n\ttry { attached = await hotfixGuestAckRegistry.attachMediaBySession(sessionKey, { ...descriptor, fileName: descriptor.fileName ?? fileName, caption: item.caption, guestQueryId: entry.guestQueryId, runId: item.runId, assertCurrent: item.assertCurrent }); }\n\tcatch (error) { attached = { delivered: false, reason: formatErrorMessage(error), ambiguous: true }; }\n\treturn { ...attached, attempted: true, ambiguous: attached.delivered !== true, guestQueryId: entry.guestQueryId, stagingMessageId, stagingChatId: resolvedStagingChatId, uploadMethod: plan.method, kind: descriptor.kind, fileId: descriptor.fileId, fileName: descriptor.fileName ?? fileName, size: stat.size };"
  ],
  [
    "\tconst upload = async (plan) => await hotfixGuestMediaUploadViaBotApi(entry, plan.method, { chatId: stagingChatId, field: plan.field, buffer, fileName, mime, caption });",
    "\tlet uploadAttempted = false;\n\tconst upload = async (plan) => {\n\t\tif (hotfixGuestAckRegistry.resolveOwner(sessionKey, item) !== entry) throw new Error(\"guest query expired before upload\");\n\t\titem.assertCurrent?.();\n\t\tuploadAttempted = true;\n\t\treturn await hotfixGuestMediaUploadViaBotApi(entry, plan.method, { chatId: stagingChatId, field: plan.field, buffer, fileName, mime, caption });\n\t};"
  ],
  [
    "async function hotfixGuestMediaUploadViaBotApi(entry, method, upload) {",
    "function hotfixGuestMediaClassifyUploadError(error, data) {\n\terror.guestDefinitiveReject = data?.error_code >= 400 && data?.error_code < 500;\n\terror.guestDocumentFallback = data?.error_code === 400 && /PHOTO_INVALID_DIMENSIONS|IMAGE_PROCESS_FAILED|failed to process|wrong type|invalid file|can't parse|unsupported/i.test(data?.description ?? \"\");\n\treturn error;\n}\nasync function hotfixGuestMediaUploadViaBotApi(entry, method, upload) {"
  ],
  [
    "\t\tif (InputFile) return await api.raw[method]({ chat_id: upload.chatId, [upload.field]: new InputFile(upload.buffer, upload.fileName), ...(upload.caption ? { caption: upload.caption } : {}) });",
    "\t\tif (InputFile) {\n\t\t\ttry { return await api.raw[method]({ chat_id: upload.chatId, [upload.field]: new InputFile(upload.buffer, upload.fileName), ...(upload.caption ? { caption: upload.caption } : {}) }); }\n\t\t\tcatch (error) { throw hotfixGuestMediaClassifyUploadError(error, error); }\n\t\t}"
  ],
  [
    "\tif (!res.ok || !data?.ok) throw new Error(`telegram ${method} failed: ${typeof data?.description === \"string\" ? data.description : `HTTP ${res.status}`}`);",
    "\tif (!res.ok || !data?.ok) throw hotfixGuestMediaClassifyUploadError(new Error(\"telegram \" + method + \" failed: \" + (data?.description ?? \"HTTP \" + res.status)), data?.ok === false ? data : undefined);"
  ]
 ]) {
    const start = a.startsWith("\tif (!res.ok") ? s.indexOf("async function hotfixGuestMediaUploadViaBotApi(") : 0;
    s = s.slice(0,start) + one(s.slice(start),a,b);
  }
  return s;
}
