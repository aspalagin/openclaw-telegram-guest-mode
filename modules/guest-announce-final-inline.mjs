// Module guest-announce-final-inline (delivery.runtime chunk, src/agents/command/delivery.ts deliverAgentCommandResult).
// The final of a sub-agent completion turn (announce/settle, deliver:true) in a guest session is sent by the CORE —
// deliverAgentCommandResult → sendDurableMessageBatchCore to the recipient on the session record — bypassing the Telegram
// path of deliverReplyPlan (bot-message) where guest-no-chat-fallback and the late append of guest-ack-edit sit.
// Second root: a guest main run that called sessions_spawn with completionTarget "parent" → the settle-wake runs as a
// private completion (subagent-announce-delivery: parentOnly → deliveryTarget {deliver:false}, privateCompletion:true;
// agent-turn-service requires request.deliver === false) → in deliverAgentCommandResult `deliver=false` → the early
// `if (!deliver) { logPayload; return completeDelivery(); }` → the result text ends up only in the log/transcript, the
// guest gets nothing. For regular sessions "final reply stays internal" is the intent of a private completion (the model
// sends updates through message); for a guest message is denied, the inline message is the only channel.
// Fix: the guest branch sits BEFORE `if (!deliver)` and fires for a sessionKey with ":guest:" when deliver=true OR the
// runId has the "announce:" prefix (announce/settle completion turns, private ones included). With deliver=false, after
// the append/drop, completeDelivery() is returned without a status — like the upstream internal path (the private
// completion classifier does not read the delivery status); with deliver=true the statuses are "sent"/resultCount 1 →
// automaticFinalDelivered, or "suppressed"/guest_inline_unavailable → terminal without retries.
// Regular guest turns (bot-message, runId without "announce:", deliver=false) do not enter the branch — their final goes
// through the regular reply path (deliverReplyPlan). Non-guest sessions never enter the branch.
// Diagnostics: `… appended … mode=deliver|private`, `… dropping … mode=…`, and for an empty visible payload of a guest
// announce turn (NO_REPLY/suppress) — `… has no visible payload — nothing to append` (tells "the model stayed silent"
// from "the path was not reached").
import { replaceOnce, insertAfter, contains, notContains, count } from "../lib/patch-helpers.mjs";
const MARK = "hotfix: guest-announce-final-inline";
export const label = "guest-announce-final-inline";
export const target = { key: "command-yield-ack-custody", label: "agent command delivery runtime (deliverAgentCommandResult)", needles: ["async function deliverAgentCommandResult(params) {", "const effectiveSessionKey = outboundSession?.key ?? opts.sessionKey;"] };
const ANCHOR_OLD = "\tif (!deliver) {\n\t\tfor (const payload of deliveryPayloads) logPayload(payload);\n\t\treturn completeDelivery();\n\t}\n";
// v1: branch AFTER `if (!deliver)` — did not fire for deliver=false (private completion). Kept for the in-place upgrade.
const GUEST_BLOCK_V1 = `\t//#region ${MARK} (2026-10-04): финал рана guest-сессии (announce/settle субагента) — в inline-сообщение гостя, не в чат адресата записи сессии
\tif (typeof effectiveSessionKey === "string" && effectiveSessionKey.includes(":guest:")) {
\t\tconst guestTexts = deliveryPayloads.map((payload) => typeof payload?.text === "string" ? payload.text : "").filter((text) => text.trim());
\t\tconst guestMediaCount = deliveryPayloads.filter((payload) => payload?.mediaUrl || Array.isArray(payload?.mediaUrls) && payload.mediaUrls.length > 0).length;
\t\tlet guestAppend;
\t\ttry {
\t\t\tguestAppend = await globalThis.__openclawHotfixGuestAck?.appendBySession?.(effectiveSessionKey, guestTexts, { runId: opts.runId });
\t\t} catch (err) {
\t\t\tguestAppend = { delivered: false, reason: \`append threw: \${String(err)}\` };
\t\t}
\t\tfor (const payload of deliveryPayloads) logPayload(payload);
\t\tif (guestAppend?.delivered === true) {
\t\t\truntime.log(\`[hotfix][guest-announce-final] guest-session final appended to inline message (session=\${effectiveSessionKey} run=\${opts.runId ?? "?"} texts=\${guestTexts.length} media_dropped=\${guestMediaCount} inline=\${guestAppend.inlineMessageId ?? "?"})\`);
\t\t\treturn completeDelivery({ requested: true, attempted: true, status: "sent", succeeded: true, resultCount: 1, reason: "guest_inline_append" }, true);
\t\t}
\t\tconst guestDropMessage = \`[hotfix][guest-announce-final] dropping guest-session final instead of sending to \${deliveryChannel ?? "?"}:\${deliveryTarget ?? "?"} (session=\${effectiveSessionKey} run=\${opts.runId ?? "?"} texts=\${guestTexts.length} media=\${guestMediaCount} reason=\${guestAppend?.reason ?? (globalThis.__openclawHotfixGuestAck ? "no inline message" : "guest-ack registry not loaded")})\`;
\t\truntime.error?.(guestDropMessage);
\t\tif (!runtime.error) runtime.log(guestDropMessage);
\t\treturn completeDelivery({ requested: true, attempted: false, status: "suppressed", succeeded: true, reason: "guest_inline_unavailable", resultCount: 0 }, true);
\t}
\t//#endregion
`;
const GUEST_BLOCK_BODY = `\tconst guestInlineSession = typeof effectiveSessionKey === "string" && effectiveSessionKey.includes(":guest:");
\tconst guestAnnounceRun = typeof opts.runId === "string" && opts.runId.startsWith("announce:");
\tif (guestInlineSession && (deliver || guestAnnounceRun)) {
\t\tconst guestMode = deliver ? "deliver" : "private";
\t\tconst guestTexts = deliveryPayloads.map((payload) => typeof payload?.text === "string" ? payload.text : "").filter((text) => text.trim());
\t\tconst guestMediaCount = deliveryPayloads.filter((payload) => payload?.mediaUrl || Array.isArray(payload?.mediaUrls) && payload.mediaUrls.length > 0).length;
\t\tlet guestAppend;
\t\ttry {
\t\t\tguestAppend = await globalThis.__openclawHotfixGuestAck?.appendBySession?.(effectiveSessionKey, guestTexts, { runId: opts.runId });
\t\t} catch (err) {
\t\t\tguestAppend = { delivered: false, reason: \`append threw: \${String(err)}\` };
\t\t}
\t\tfor (const payload of deliveryPayloads) logPayload(payload);
\t\tif (guestAppend?.delivered === true) {
\t\t\truntime.log(\`[hotfix][guest-announce-final] guest-session final appended to inline message (session=\${effectiveSessionKey} run=\${opts.runId ?? "?"} mode=\${guestMode} texts=\${guestTexts.length} media_dropped=\${guestMediaCount} inline=\${guestAppend.inlineMessageId ?? "?"})\`);
\t\t\treturn deliver ? completeDelivery({ requested: true, attempted: true, status: "sent", succeeded: true, resultCount: 1, reason: "guest_inline_append" }, true) : completeDelivery();
\t\t}
\t\tconst guestDropMessage = \`[hotfix][guest-announce-final] dropping guest-session final instead of \${deliver ? \`sending to \${deliveryChannel ?? "?"}:\${deliveryTarget ?? "?"}\` : "keeping it internal (deliver=false)"} (session=\${effectiveSessionKey} run=\${opts.runId ?? "?"} mode=\${guestMode} texts=\${guestTexts.length} media=\${guestMediaCount} reason=\${guestAppend?.reason ?? (globalThis.__openclawHotfixGuestAck ? "no inline message" : "guest-ack registry not loaded")})\`;
\t\truntime.error?.(guestDropMessage);
\t\tif (!runtime.error) runtime.log(guestDropMessage);
\t\treturn deliver ? completeDelivery({ requested: true, attempted: false, status: "suppressed", succeeded: true, reason: "guest_inline_unavailable", resultCount: 0 }, true) : completeDelivery();
\t}
\t//#endregion
`;
// kit v1.2.0 revision (Russian region header) — recognized for the in-place upgrade
const GUEST_BLOCK_V2 = `\t//#region ${MARK} v2 (2026-10-04): финал рана guest-сессии (announce/settle субагента, в т.ч. private completion с deliver=false) — в inline-сообщение гостя, не в чат адресата записи сессии и не «internal»
${GUEST_BLOCK_BODY}`;
const REGION_HEADER = `\t//#region ${MARK} v3: the final of a guest-session run (sub-agent announce/settle, private completion with deliver=false included) goes into the guest's inline message — not to the chat on the session record and not "internal"`;
const GUEST_BLOCK = `${REGION_HEADER}
${GUEST_BLOCK_BODY}`;
const EMPTY_ANCHOR = "\tif (deliveryPayloads.length === 0) {\n";
const EMPTY_DIAG_V2 = `\t\tif (typeof effectiveSessionKey === "string" && effectiveSessionKey.includes(":guest:") && typeof opts.runId === "string" && opts.runId.startsWith("announce:")) runtime.log(\`[hotfix][guest-announce-final] guest-session announce final has no visible payload — nothing to append (session=\${effectiveSessionKey} run=\${opts.runId} deliver=\${deliver} suppressed=\${replyNormalization.kind === "suppress" ? replyNormalization.reason ?? "?" : "no"})\`); // ${MARK} v2 (diag)\n`;
const EMPTY_DIAG = `\t\tif (typeof effectiveSessionKey === "string" && effectiveSessionKey.includes(":guest:") && typeof opts.runId === "string" && opts.runId.startsWith("announce:")) runtime.log(\`[hotfix][guest-announce-final] guest-session announce final has no visible payload — nothing to append (session=\${effectiveSessionKey} run=\${opts.runId} deliver=\${deliver} suppressed=\${replyNormalization.kind === "suppress" ? replyNormalization.reason ?? "?" : "no"})\`); // ${MARK} (diag)\n`;
export function patch(source) {
  let next = source;
  if (!next.includes(GUEST_BLOCK)) {
    if (next.includes(GUEST_BLOCK_V2)) next = replaceOnce(next, GUEST_BLOCK_V2, GUEST_BLOCK, "guest guard v2 → v3 (region header) in deliverAgentCommandResult");
    else if (next.includes(`${ANCHOR_OLD}${GUEST_BLOCK_V1}`)) next = replaceOnce(next, `${ANCHOR_OLD}${GUEST_BLOCK_V1}`, `${GUEST_BLOCK}${ANCHOR_OLD}`, "guest guard v1 → v3 (before `if (!deliver)`) in deliverAgentCommandResult");
    else next = replaceOnce(next, ANCHOR_OLD, `${GUEST_BLOCK}${ANCHOR_OLD}`, "guest guard before `if (!deliver)` in deliverAgentCommandResult");
  }
  if (next.includes(EMPTY_DIAG_V2)) next = replaceOnce(next, EMPTY_DIAG_V2, EMPTY_DIAG, "guest announce no-payload diagnostic v2 → v3");
  if (!next.includes(EMPTY_DIAG)) next = insertAfter(next, EMPTY_ANCHOR, EMPTY_DIAG, "guest announce no-payload diagnostic in deliverAgentCommandResult");
  return next;
}
export const check = { assertions: [
  contains(`${MARK} v3`, "guest-announce-final-inline v3 marker"),
  contains(GUEST_BLOCK, "guest branch of deliverAgentCommandResult (whole)"),
  contains(EMPTY_DIAG, "empty-payload diagnostic of a guest announce turn"),
  contains("[hotfix][guest-announce-final] dropping guest-session final", "drop diagnostic"),
  notContains(GUEST_BLOCK_V1, "guest branch v1 (after `if (!deliver)`) remnant"),
  notContains(GUEST_BLOCK_V2, "guest branch v2 (kit v1.2.0) remnant"),
  notContains(EMPTY_DIAG_V2, "empty-payload diagnostic v2 remnant"),
  contains(ANCHOR_OLD, "upstream `if (!deliver)` kept"),
  // identifiers used by the branch must exist in the function
  contains("const effectiveSessionKey = outboundSession?.key ?? opts.sessionKey;", "effectiveSessionKey"),
  contains("const deliver = opts.deliver === true;", "deliver"),
  contains("const replyNormalization = normalizeReplyPayloads(payloads);", "replyNormalization"),
  contains("const deliveryPayloads = projectOutboundPayloadPlanForOutbound(outboundPayloadPlan);", "deliveryPayloads"),
  contains("const completeDelivery = (status, deliverySucceeded) => {", "completeDelivery(status, deliverySucceeded)"),
  contains("const { deliveryChannel, isDeliveryChannelKnown, defaultAccountId, resolvedAccountId, resolvedTarget, deliveryTarget, resolvedReplyToId, resolvedThreadTarget, deliveryPlugin } = deliveryRouting;", "deliveryChannel/deliveryTarget from deliveryRouting"),
  // order: logPayload declaration → guest branch → `if (!deliver)` → first platform send
  (c) => { const fn = c.indexOf("async function deliverAgentCommandResult(params) {"); const lp = c.indexOf("const logPayload = (payload) => {", fn); const g = c.indexOf(REGION_HEADER, fn); const nd = c.indexOf(ANCHOR_OLD, fn); const send = c.indexOf("send = await sendDurableMessageBatchCore({", fn); return fn >= 0 && lp >= 0 && g > lp && nd > g && send > nd ? null : "guest branch is not between the logPayload declaration and `if (!deliver)` (or sendDurableMessageBatchCore comes earlier)"; },
  (c) => { const fn = c.indexOf("async function deliverAgentCommandResult(params) {"); const empty = c.indexOf(EMPTY_ANCHOR, fn); const diag = c.indexOf(EMPTY_DIAG, fn); return fn >= 0 && empty >= 0 && diag === empty + EMPTY_ANCHOR.length ? null : "empty-payload diagnostic is not the first line of the `if (deliveryPayloads.length === 0)` block"; },
  (c) => count(c, "async function deliverAgentCommandResult(params) {") === 1 && count(c, "send = await sendDurableMessageBatchCore({") === 1 ? null : "deliverAgentCommandResult/sendDurableMessageBatchCore occur more than once (new send path bypassing the guest branch?)",
  (c) => count(c, "appendBySession") === 1 ? null : "appendBySession called more than once",
  (c) => count(c, `//#region ${MARK}`) === 1 ? null : "guest-announce-final-inline region occurs more than once (v1 remnant?)",
] };
