// Module guest-media-staging-runner (message-action-runner bundle, src/infra/outbound/message-action-send.ts).
// The bot is not a member of the guest's chat, so a direct `message send` into it is impossible; a guest can only
// receive the file_id of an already uploaded file (Bot API 10.3, inline message of answerGuestQuery). Intercept in
// executeMessageSend (agent side of the tool call; on the gateway side of the same call input.gatewayOwnedDelivery=true →
// skipped):
//   conditions: channel telegram; input.sessionKey ends with `:guest:<callerId>-at-<chatId>` (guest-session-per-chat);
//   the send carries media (media/mediaUrls/path/filePath/fileUrl/image/buffer/attachments); the target (after
//   resolveActionTarget — explicit, or implicit from the tool context, which for a guest is the guest chat itself)
//   equals the guest's chat id; the guest-ack registry is loaded and media.enabled.
//   action: `to` → staging chat (registry.mediaRules().stagingChatId from the rules file; no default — media stays off
//   until it is configured); local files (direct mode) are resolved with fs.realpathSync and checked against the
//   local media roots (ctx.mediaAccess.localRoots, fail-closed) BEFORE anything is read — a symlink inside an allowed
//   root pointing outside it is denied; the realpath is what gets uploaded (registry.stageAndAttachMedia). URLs and
//   buffers (pipeline mode) go through the regular send path (media roots, stageGatewayWorkspaceMedia, gateway send);
//   afterwards messageId/chatId from payload.result (+receipt.parts for albums) → file_id from
//   globalThis.__openclawHotfixTelegramSentMedia (telegram-sent-media-file-ids) → registry.attachMediaBySession(sessionKey,
//   {kind, fileId, …, caption}) (guest-media-staging-delivery). The outcome goes into the tool payload:
//   payload.guestMediaDelivery = {delivered, mode, guestChatId, items:[{fileName, delivered, mode?, kind?, size?, reason?}], note}
//   — the model sees whether the guest got the file; the staging chat id and file_ids are not part of it.
//   An explicit target of another chat → regular send. Side effect: a copy of the file in the staging chat.
// Available in the chunk: readToolStringParam, collectActionMediaSourceHints, readBooleanParam, isPathInside, path,
// formatErrorMessage, log (createSubsystemLogger("outbound/message-action")). Adds `import fs from "node:fs"`.
import { replaceOnce, replaceRegion, contains, notContains, count } from "../lib/patch-helpers.mjs";
import { target as baseTarget } from "./message-inbound-turn-kind-normalize.mjs";
export const label = "guest-media-staging-runner";
export const target = baseTarget;
const MARK = "hotfix: guest-media-staging";
const FS_IMPORT = "import fs from \"node:fs\"; // hotfix: guest-media-staging (realpath of local media)\n";
// Region start carries a trailing space: it matches the helpers region of every revision ("(runner) v4: …", "(runner) 2026-10-04 — …")
// but not the inline insert in executeMessageSend ("(runner): …"), so replaceRegion never sees two starts.
const REGION_START = `//#region ${MARK} (runner) `;
const REGION_VERSION = "v4";
const HELPERS = `${REGION_START}${REGION_VERSION}: message send with media from a guest session → staging chat → file_id → guest inline message
const HOTFIX_GUEST_SESSION_RE = /:guest:(?:(\\d+)-at-)?(-?\\d+)$/;
function hotfixTelegramTargetChatId(value) {
\tlet text = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
\tfor (;;) {
\t\tconst next = text.replace(/^(?:telegram|tg|user|chat|group|channel):/i, "").trim();
\t\tif (next === text) break;
\t\ttext = next;
\t}
\tconst topic = /^(-?\\d+):(?:(?:direct-topic|topic):)?\\d+$/i.exec(text);
\treturn topic ? topic[1] : text;
}
// Local media source (/abs, file:///abs) → absolute path; URL/~/anything else → undefined (pipeline mode).
function hotfixGuestMediaLocalPath(value) {
\tconst text = typeof value === "string" ? value.trim() : "";
\tif (!text) return;
\tif (/^file:\\/\\//i.test(text)) {
\t\ttry {
\t\t\treturn path.resolve(decodeURIComponent(new URL(text).pathname));
\t\t} catch {
\t\t\treturn;
\t\t}
\t}
\tif (text.startsWith("/") && !text.startsWith("//")) return path.resolve(text);
\treturn;
}
// Allowlist check on the canonical path: realpath failure (missing file, dangling symlink) → denied; a symlink that
// resolves outside every allowed root → denied. Returns { file, real, denied }.
function hotfixGuestMediaResolveLocal(file, roots) {
\tlet real;
\ttry {
\t\treal = fs.realpathSync(file);
\t} catch (err) {
\t\treturn { file, real: void 0, denied: \`not readable (\${formatErrorMessage(err)})\` };
\t}
\tif (!roots.some((root) => isPathInside(root, real))) return { file, real, denied: \`outside the allowed local media roots (\${roots.length} configured)\` };
\treturn { file, real, denied: void 0 };
}
function hotfixGuestMediaSummary(items) {
\treturn items.map((item) => \`\${item.fileName}:\${item.delivered ? item.mode ?? "ok" : "failed"}\`).join(",");
}
// Direct mode: each local file is uploaded to the staging chat through the guest-ack registry (bot client / Bot API multipart) and attached to the guest; the regular send is not executed.
async function hotfixGuestMediaStagingDirect(ctx, staging) {
\tconst registry = globalThis.__openclawHotfixGuestAck;
\tconst items = [];
\tfor (const local of staging.locals) {
\t\tconst fileName = path.basename(local.file);
\t\tif (local.denied) {
\t\t\titems.push({ fileName, delivered: false, reason: \`media path \${local.denied}\` });
\t\t\tcontinue;
\t\t}
\t\ttry {
\t\t\tconst result = await registry.stageAndAttachMedia(staging.sessionKey, { path: local.real, fileName: staging.locals.length === 1 ? staging.fileName : void 0, mimeType: staging.locals.length === 1 ? staging.mimeType : void 0, caption: staging.caption, stagingChatId: staging.stagingTo, forceDocument: staging.forceDocument });
\t\t\titems.push({ fileName: result?.fileName ?? fileName, delivered: result?.delivered === true, mode: result?.mode, kind: result?.kind, size: result?.size, uploadMethod: result?.uploadMethod, stagingMessageId: result?.stagingMessageId, ...(result?.delivered ? {} : { reason: result?.reason ?? "unknown" }) });
\t\t} catch (err) {
\t\t\titems.push({ fileName, delivered: false, reason: formatErrorMessage(err) });
\t\t}
\t}
\tconst delivered = items.some((item) => item.delivered);
\tconst failed = items.filter((item) => !item.delivered).map((item) => \`\${item.fileName}: \${item.reason}\`);
\tconst note = delivered
\t\t? \`Guest delivery: \${items.filter((i) => i.delivered).length} attachment(s) inserted into the guest's inline message (a copy stays in the operator's staging chat).\${failed.length ? \` Not attached: \${failed.join("; ")}.\` : ""} Do not resend; mention the attachment briefly in your final text.\`
\t\t: \`Guest delivery FAILED: the file was NOT attached to the guest's message (\${failed.join("; ") || "unknown"}). Tell the guest in words what the file contains.\`;
\tlog.info(\`[hotfix][guest-media-staging] \${delivered ? "attached" : "not attached"} (direct): guestChat=\${staging.guestChatId} items=\${hotfixGuestMediaSummary(items)}\${failed.length ? \` failed=\${failed.join("; ")}\` : ""}\`);
\tconst stagingMessageIds = items.map((item) => item.stagingMessageId).filter(Boolean);
\treturn { ok: delivered, channel: ctx.channel, to: staging.stagingTo, messageId: stagingMessageIds.at(-1), stagingMessageIds, guestMediaDelivery: { delivered, mode: "direct", guestChatId: staging.guestChatId, items, ...(delivered ? {} : { reason: failed.join("; ") }), note } };
}
function hotfixResolveGuestMediaStaging(ctx, to) {
\ttry {
\t\tconst input = ctx?.input;
\t\tif (!input || input.gatewayOwnedDelivery === true || ctx.dryRun) return;
\t\tif ((ctx.channel ?? "") !== "telegram") return;
\t\tconst sessionKey = typeof input.sessionKey === "string" ? input.sessionKey : "";
\t\tconst match = HOTFIX_GUEST_SESSION_RE.exec(sessionKey);
\t\tif (!match) return;
\t\tconst registry = globalThis.__openclawHotfixGuestAck;
\t\tif (typeof registry?.attachMediaBySession !== "function" || typeof registry?.mediaRules !== "function") return;
\t\tconst rules = registry.mediaRules();
\t\tif (!rules?.enabled || !rules.stagingChatId) return;
\t\tconst hasBuffer = Boolean(readToolStringParam(ctx.params, "buffer", { trim: false }));
\t\tconst sources = collectActionMediaSourceHints(ctx.params, void 0, { structuredAttachments: "all" }).map((value) => String(value).trim()).filter(Boolean);
\t\tif (!hasBuffer && sources.length === 0) return;
\t\tconst guestChatId = match[2];
\t\tconst targetChatId = hotfixTelegramTargetChatId(to);
\t\tif (!guestChatId || targetChatId !== guestChatId) return;
\t\tconst stagingTo = String(rules.stagingChatId);
\t\tif (hotfixTelegramTargetChatId(stagingTo) === guestChatId) return;
\t\tconst caption = readToolStringParam(ctx.params, "caption", { trim: false }) ?? readToolStringParam(ctx.params, "message", { trim: false }) ?? "";
\t\t// Local files are uploaded to staging directly (direct mode): the outbound pipeline of a rich-enabled account embeds text + local media
\t\t// into sendRichMessage (prefer-payload) and the file_id never reaches the registry. URLs/buffers keep the pipeline mode (regular send,
\t\t// file_id from acceptMany).
\t\tconst localPaths = sources.map((value) => hotfixGuestMediaLocalPath(value)).filter((value) => value !== void 0);
\t\tconst direct = !hasBuffer && sources.length > 0 && localPaths.length === sources.length;
\t\tconst roots = Array.isArray(ctx.mediaAccess?.localRoots) ? ctx.mediaAccess.localRoots.map((root) => path.resolve(String(root))) : [];
\t\tconst locals = direct ? localPaths.map((file) => hotfixGuestMediaResolveLocal(file, roots)) : [];
\t\tconst deniedCount = locals.filter((local) => local.denied).length;
\t\tlog.info(\`[hotfix][guest-media-staging] guest session media send rerouted: guestChat=\${guestChatId} mode=\${direct ? "direct" : "pipeline"} sources=\${sources.length}\${deniedCount ? \` deniedByRoots=\${deniedCount}\` : ""} session=\${sessionKey}\`);
\t\treturn { sessionKey, guestChatId, originalTo: to, stagingTo, caption, mode: direct ? "direct" : "pipeline", locals, roots, forceDocument: readBooleanParam(ctx.params, "forceDocument") ?? readBooleanParam(ctx.params, "asDocument") ?? false, fileName: readToolStringParam(ctx.params, "filename"), mimeType: readToolStringParam(ctx.params, "contentType") ?? readToolStringParam(ctx.params, "mimeType") };
\t} catch (err) {
\t\tlog.warn(\`[hotfix][guest-media-staging] detection failed, sending normally: \${formatErrorMessage(err)}\`);
\t\treturn;
\t}
}
// Two result shapes of send: Telegram actions.handleAction → jsonResult({ ok, messageId, chatId?, receipt:{threadId, replyToId} }) (flat,
// chatId may be undefined, no deliveryStatus); core path → { channel, to, result:{chatId, messageId, receipt:{parts, platformMessageIds}}, deliveryStatus }.
function hotfixGuestMediaSentIds(payload, fallbackChatId) {
\tconst out = [];
\tconst seen = new Set();
\tconst push = (chatId, messageId) => {
\t\tconst c = chatId == null || String(chatId).trim() === "" ? (fallbackChatId ?? "") : String(chatId).trim();
\t\tconst m = messageId == null ? "" : String(messageId).trim();
\t\tif (!m || m === "unknown" || m === "suppressed" || seen.has(\`\${c}:\${m}\`)) return;
\t\tseen.add(\`\${c}:\${m}\`);
\t\tout.push({ chatId: c, messageId: m });
\t};
\tconst root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : void 0;
\tif (!root) return out;
\tconst result = root.result && typeof root.result === "object" ? root.result : void 0;
\tif (result) {
\t\tpush(result.chatId, result.messageId);
\t\tfor (const part of result.receipt?.parts ?? []) push(result.chatId, part?.platformMessageId);
\t\tfor (const id of result.receipt?.platformMessageIds ?? []) push(result.chatId, id);
\t}
\tif (root.messageId != null) push(root.chatId, root.messageId);
\tfor (const part of root.receipt?.parts ?? []) push(root.chatId, part?.platformMessageId);
\tfor (const id of root.receipt?.platformMessageIds ?? []) push(root.chatId, id);
\treturn out;
}
// acceptMany in the send chunk records the file_id before the result returns; as a safety net wait up to ~0.6 s and look up by messageId without chatId.
async function hotfixGuestMediaLookupSent(sentMedia, id) {
\tif (!(sentMedia instanceof Map)) return;
\tfor (let attempt = 0; attempt < 4; attempt++) {
\t\tif (id.chatId) {
\t\t\tconst exact = sentMedia.get(\`\${id.chatId}:\${id.messageId}\`);
\t\t\tif (exact) return exact;
\t\t}
\t\tlet byMessage;
\t\tfor (const entry of sentMedia.values()) if (entry?.messageId === id.messageId && (!byMessage || (entry.at ?? 0) > (byMessage.at ?? 0))) byMessage = entry;
\t\tif (byMessage) return byMessage;
\t\tif (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 150));
\t}
}
async function hotfixGuestMediaStagingAfterSend(ctx, staging, payload) {
\tconst registry = globalThis.__openclawHotfixGuestAck;
\tconst sentMedia = globalThis.__openclawHotfixTelegramSentMedia;
\tconst items = [];
\tlet reason;
\ttry {
\t\tconst root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
\t\tconst status = root.deliveryStatus ?? root.status ?? (root.ok === true ? "ok" : void 0);
\t\tconst ids = hotfixGuestMediaSentIds(payload, hotfixTelegramTargetChatId(staging.stagingTo));
\t\tif (ids.length === 0) reason = \`staging send returned no message id (status=\${status ?? "unknown"}, keys=\${Object.keys(root).join(",") || "-"}\${root.error ? \`, error=\${root.error}\` : ""})\`;
\t\tfor (const id of ids) {
\t\t\tconst media = await hotfixGuestMediaLookupSent(sentMedia, id);
\t\t\tif (!media) continue;
\t\t\tconst attached = await registry.attachMediaBySession(staging.sessionKey, { ...media, caption: staging.caption });
\t\t\titems.push({ fileName: media.fileName ?? \`\${media.kind ?? "media"}-\${id.messageId}\`, stagingMessageId: id.messageId, kind: media.kind, size: media.size, delivered: attached?.delivered === true, mode: attached?.mode, ...(attached?.delivered ? {} : { reason: attached?.reason ?? "unknown" }) });
\t\t}
\t\tif (!reason && items.length === 0) reason = \`no media file_id recorded for the staged message(s) \${ids.map((id) => id.messageId).join(",")} (text-only send, Telegram returned no media, or sent-media registry missing: \${sentMedia instanceof Map ? \`\${sentMedia.size} entries\` : "absent"})\`;
\t} catch (err) {
\t\treason = formatErrorMessage(err);
\t}
\tconst delivered = items.some((item) => item.delivered);
\tconst failed = items.filter((item) => !item.delivered).map((item) => item.reason).filter(Boolean);
\tconst note = delivered
\t\t? \`Guest delivery: \${items.filter((i) => i.delivered).length} attachment(s) inserted into the guest's inline message; a copy was sent to the operator's staging chat.\${failed.length ? \` Not attached: \${failed.join("; ")}.\` : ""} Do not resend; mention the attachment briefly in your final text.\`
\t\t: \`Guest delivery FAILED: the file was NOT attached to the guest's message (\${reason ?? failed.join("; ") ?? "unknown"}); a copy is in the operator's staging chat only. Tell the guest in words what the file contains.\`;
\tlog.info(\`[hotfix][guest-media-staging] \${delivered ? "attached" : "not attached"}: guestChat=\${staging.guestChatId} items=\${hotfixGuestMediaSummary(items)}\${reason ? \` reason=\${reason}\` : ""}\`);
\tconst guestMediaDelivery = { delivered, mode: "pipeline", guestChatId: staging.guestChatId, items, ...(reason ? { reason } : {}), note };
\treturn payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload, guestMediaDelivery } : { payload, guestMediaDelivery };
}
//#endregion
`;
const TO_OLD = "\tconst to = readToolStringParam(params, \"to\", { required: true });\n\tlet sendPayload = await buildMessagePayload({\n";
// v1/v2 inline insert (no direct mode) — recognized for upgrades of a patched chunk.
const TO_V2 = `\tlet to = readToolStringParam(params, "to", { required: true });
\t//#region ${MARK} (runner): медиа гостю → staging-чат
\tconst guestMediaStaging = hotfixResolveGuestMediaStaging(ctx, to);
\tif (guestMediaStaging) {
\t\tto = guestMediaStaging.stagingTo;
\t\tparams.to = to;
\t}
\t//#endregion
\tlet sendPayload = await buildMessagePayload({
`;
// v3 (kit v1.2.0): direct mode, Russian region comment.
const TO_V3 = `\tlet to = readToolStringParam(params, "to", { required: true });
\t//#region ${MARK} (runner): медиа гостю → staging-чат
\tconst guestMediaStaging = hotfixResolveGuestMediaStaging(ctx, to);
\tif (guestMediaStaging?.mode === "direct") return await annotateSourceDelivery({ kind: "send", channel, action, to: guestMediaStaging.stagingTo, handledBy: "plugin", payload: await hotfixGuestMediaStagingDirect(ctx, guestMediaStaging), dryRun }, ctx, false);
\tif (guestMediaStaging) {
\t\tto = guestMediaStaging.stagingTo;
\t\tparams.to = to;
\t}
\t//#endregion
\tlet sendPayload = await buildMessagePayload({
`;
const TO_NEW = `\tlet to = readToolStringParam(params, "to", { required: true });
\t//#region ${MARK} (runner): guest media → staging chat
\tconst guestMediaStaging = hotfixResolveGuestMediaStaging(ctx, to);
\tif (guestMediaStaging?.mode === "direct") return await annotateSourceDelivery({ kind: "send", channel, action, to: guestMediaStaging.stagingTo, handledBy: "plugin", payload: await hotfixGuestMediaStagingDirect(ctx, guestMediaStaging), dryRun }, ctx, false);
\tif (guestMediaStaging) {
\t\tto = guestMediaStaging.stagingTo;
\t\tparams.to = to;
\t}
\t//#endregion
\tlet sendPayload = await buildMessagePayload({
`;
const RET_GW_OLD = "\t\treturn await annotateSourceDelivery(withSendNormalization(gatewayPluginAction, sendPayload.normalization), ctx, reply?.source === \"explicit\");\n";
const RET_GW_NEW = `\t\treturn await annotateSourceDelivery(withSendNormalization(guestMediaStaging ? { ...gatewayPluginAction, payload: await hotfixGuestMediaStagingAfterSend(ctx, guestMediaStaging, gatewayPluginAction.payload) } : gatewayPluginAction, sendPayload.normalization), ctx, reply?.source === "explicit"); // ${MARK}\n`;
const RET_CORE_OLD = "\t\thandledBy: send.handledBy,\n\t\tpayload: send.payload,\n\t\t...send.deliveredText ? { deliveredText: send.deliveredText } : {},\n";
const RET_CORE_NEW = `\t\thandledBy: send.handledBy,\n\t\tpayload: guestMediaStaging ? await hotfixGuestMediaStagingAfterSend(ctx, guestMediaStaging, send.payload) : send.payload, // ${MARK}\n\t\t...send.deliveredText ? { deliveredText: send.deliveredText } : {},\n`;
// The helpers region sits before UNRESOLVED_PREFIX_VAR_PATTERN; on a version upgrade the whole region is replaced.
export function patch(source) {
  if (source.includes(FS_IMPORT) && source.includes(HELPERS) && source.includes(TO_NEW) && source.includes(RET_GW_NEW) && source.includes(RET_CORE_NEW)) return source;
  let next = source;
  if (!next.includes(FS_IMPORT)) next = next.includes("import fs from \"node:fs\";") ? next : `${FS_IMPORT}${next}`;
  if (!next.includes(HELPERS)) next = replaceRegion(next, { start: REGION_START, body: HELPERS, anchor: "const UNRESOLVED_PREFIX_VAR_PATTERN", label: "guest-media-staging runner helpers before executeMessageSend" });
  if (!next.includes(TO_NEW)) {
    const old = [TO_V3, TO_V2].find((candidate) => next.includes(candidate));
    next = old ? replaceOnce(next, old, TO_NEW, "executeMessageSend target rewrite upgrade (earlier revision → v4)") : replaceOnce(next, TO_OLD, TO_NEW, "executeMessageSend target rewrite (guest media → staging)");
  }
  if (!next.includes(RET_GW_NEW)) next = replaceOnce(next, RET_GW_OLD, RET_GW_NEW, "executeMessageSend gateway-action return (attach after send)");
  if (!next.includes(RET_CORE_NEW)) next = replaceOnce(next, RET_CORE_OLD, RET_CORE_NEW, "executeMessageSend core return (attach after send)");
  return next;
}
export const check = { assertions: [
  contains(HELPERS, "guest-media-staging runner helpers (whole region)"),
  contains(FS_IMPORT, "import fs for realpath"),
  contains(TO_NEW, "target redirect in executeMessageSend"),
  contains(RET_GW_NEW, "attach after gateway send"),
  contains(RET_CORE_NEW, "attach after core send"),
  notContains(TO_OLD, "old const to without the intercept"),
  notContains(TO_V2, "inline insert v2 (no direct mode) remnant"),
  notContains(TO_V3, "inline insert v3 (kit v1.2.0) remnant"),
  (c) => count(c, "hotfixResolveGuestMediaStaging(") === 2 ? null : `hotfixResolveGuestMediaStaging expected 2 times (declaration + call), found ${count(c, "hotfixResolveGuestMediaStaging(")}`,
  (c) => count(c, `${REGION_START}${REGION_VERSION}`) === 1 && count(c, REGION_START) === 1 ? null : `guest-media-staging (runner) helpers region expected once, found ${count(c, REGION_START)} (upgrade left an old revision?)`,
  (c) => count(c, "hotfixGuestMediaStagingAfterSend(") === 3 ? null : `hotfixGuestMediaStagingAfterSend expected 3 times (declaration + 2 calls), found ${count(c, "hotfixGuestMediaStagingAfterSend(")}`,
  contains("if (root.messageId != null) push(root.chatId, root.messageId);", "flat result shape of telegram handleAction (top-level messageId)"),
  contains("async function hotfixGuestMediaLookupSent(sentMedia, id) {", "file_id lookup by messageId with a wait"),
  contains("if (guestMediaStaging?.mode === \"direct\") return await annotateSourceDelivery({ kind: \"send\", channel, action, to: guestMediaStaging.stagingTo, handledBy: \"plugin\", payload: await hotfixGuestMediaStagingDirect(ctx, guestMediaStaging), dryRun }, ctx, false);", "direct mode: upload without the pipeline"),
  contains("real = fs.realpathSync(file);", "local media resolved with realpath before the allowlist check"),
  contains("if (!roots.some((root) => isPathInside(root, real))) return { file, real, denied:", "allowlist of local roots checked on the realpath (fail-closed)"),
  contains("stageAndAttachMedia(staging.sessionKey, { path: local.real,", "the realpath is what gets uploaded"),
  notContains("items=${JSON.stringify(items)}", "full item dump (paths/file_id) in the log"),
  notContains("stagingTo: staging.stagingTo, originalTo: staging.originalTo, items", "staging chat id exposed in guestMediaDelivery"),
  contains("import { r as isPathInside } from \"./path-guards-", "isPathInside imported"),
  contains("import path from \"node:path\";", "path imported"),
  (c) => count(c, "import fs from \"node:fs\"") === 1 ? null : `expected exactly one import fs, found ${count(c, "import fs from \"node:fs\"")}`,
  contains("import { t as readBooleanParam } from \"./boolean-param-", "readBooleanParam imported"),
  // chunk dependencies
  contains("h as readToolStringParam", "readToolStringParam imported"),
  contains("o as collectActionMediaSourceHints", "collectActionMediaSourceHints imported"),
  contains("const log = createSubsystemLogger(\"outbound/message-action\");", "outbound/message-action logger in the chunk"),
  contains("import { t as formatErrorMessage } from \"./errors-", "formatErrorMessage in the chunk"),
  // the intercept must precede buildMessagePayload and executeGatewayAction inside executeMessageSend
  (c) => {
    const fn = c.indexOf("async function executeMessageSend(ctx) {");
    const rewrite = c.indexOf("const guestMediaStaging = hotfixResolveGuestMediaStaging(ctx, to);", fn);
    const build = c.indexOf("let sendPayload = await buildMessagePayload({", fn);
    const gw = c.indexOf("const gatewayPluginAction = requiresCoreDelivery ? null : await executeGatewayAction(ctx, {", fn);
    if (fn < 0 || rewrite < 0 || build < 0 || gw < 0) return "executeMessageSend / intercept / buildMessagePayload / executeGatewayAction not found";
    return fn < rewrite && rewrite < build && build < gw ? null : "the guest-media-staging intercept must precede buildMessagePayload and executeGatewayAction";
  },
] };
