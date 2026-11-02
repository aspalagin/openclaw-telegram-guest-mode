// Portable OpenClaw 2026.10.9: guest-ack-edit-delivery.
import { patchRegistry } from "./guest-query-ownership-shared.mjs";
// Query-owned registry; public rules, transport and text defaults are preserved.
import { replaceOnce, insertBefore, contains, notContains, rulesFileExpression } from "../lib/patch-helpers.mjs";
import { patch as basePatch } from "./telegram-guest-mode-delivery.mjs";
import { patch as plainPatch } from "./guest-plain-delivery-normalize.mjs";
import { patch as guardPatch } from "./guest-single-answer-guard.mjs";
import { patch as noChatPatch } from "./guest-no-chat-fallback.mjs";
const MARK = "hotfix: guest-ack-edit";
export const label = "guest-ack-edit-delivery";
export const verdict = "port";
export const target = { key: "delivery", label: "Telegram delivery.replies bundle", needles: ["function createReplyDeliverer(config, sender, progress) {", "async function deliverReplyPlan(params, createPlan) {", "const { deliverTextReply, deliverMediaReply } = createReplyDeliverer(params, sender, progress);"] };
const FS_IMPORT = "import fs from \"node:fs\"; // hotfix: guest-ack-edit (rules file)\n";
const REGION_START = `//#region ${MARK} (registry)`;
const REGION_END = "//#endregion\n";
export const REGISTRY_DEFAULT_TEXTS = Object.freeze({
  placeholderText: "Working on it…",
  truncatedNote: "[Reply truncated: Telegram guest mode limit.]",
  settleFailedText: "⚠️ The request could not be processed. Please try again.",
  settleEmptyText: "The request was processed but produced no text reply. Please rephrase it.",
});
const REGISTRY = patchRegistry([
  `${REGION_START} v4: guest-query placeholder registry — timer → answerGuestQuery(placeholder) → heartbeat edits → final editMessageText(inline_message_id); user-facing strings come from the rules file`,
  `const HOTFIX_GUEST_ACK_FILE = ${rulesFileExpression("OPENCLAW_HOTFIX_GUEST_ACK_FILE", "hotfix-guest-ack.json")};`,
  "const HOTFIX_GUEST_ACK_DEFAULTS = Object.freeze({",
  "\tenabled: true,",
  "\tackAfterSeconds: 45,",
  `\tplaceholderText: ${JSON.stringify(REGISTRY_DEFAULT_TEXTS.placeholderText)},`,
  "\tetaText: \"\",",
  "\tprogressEnabled: true,",
  "\tprogressMinIntervalSeconds: 15,",
  "\trichEnabled: true,",
  "\tappendLater: true,",
  "\tappendMax: 5,",
  "\tretentionMinutes: 360,",
  `\ttruncatedNote: ${JSON.stringify(REGISTRY_DEFAULT_TEXTS.truncatedNote)},`,
  `\tsettleFailedText: ${JSON.stringify(REGISTRY_DEFAULT_TEXTS.settleFailedText)},`,
  `\tsettleEmptyText: ${JSON.stringify(REGISTRY_DEFAULT_TEXTS.settleEmptyText)}`,
  "});",
  "const HOTFIX_GUEST_ACK_EDIT_UNCHANGED_RE = /message is not modified/i;",
  "const HOTFIX_GUEST_ACK_EDIT_GONE_RE = /MESSAGE_ID_INVALID|message to edit not found|message can't be edited|inline message id is invalid/i;",
  "let hotfixGuestAckRulesCache = { stamp: null, rules: null, warned: null };",
  "function hotfixGuestAckNumber(value, fallback, min, max) {",
  "\tconst n = typeof value === \"number\" ? value : typeof value === \"string\" && value.trim() ? Number(value) : NaN;",
  "\tif (!Number.isFinite(n)) return fallback;",
  "\treturn Math.min(max, Math.max(min, n));",
  "}",
  "function hotfixGuestAckText(value, fallback) {",
  "\treturn typeof value === \"string\" && value.trim() ? value.trim() : fallback;",
  "}",
  "function hotfixGuestAckWarnOnce(kind, detail) {",
  "\tif (hotfixGuestAckRulesCache.warned === kind) return;",
  "\thotfixGuestAckRulesCache.warned = kind;",
  "\tlogVerbose(`[hotfix][guest-ack] rules file ${kind} (${HOTFIX_GUEST_ACK_FILE}): ${detail}; using built-in defaults`);",
  "}",
  "function loadHotfixGuestAckRules() {",
  "\tlet stat;",
  "\ttry {",
  "\t\tstat = fs.statSync(HOTFIX_GUEST_ACK_FILE);",
  "\t} catch (err) {",
  "\t\tif (hotfixGuestAckRulesCache.stamp !== \"missing\") {",
  "\t\t\thotfixGuestAckWarnOnce(\"missing\", String(err?.message ?? err));",
  "\t\t\thotfixGuestAckRulesCache.stamp = \"missing\";",
  "\t\t\thotfixGuestAckRulesCache.rules = HOTFIX_GUEST_ACK_DEFAULTS;",
  "\t\t}",
  "\t\treturn hotfixGuestAckRulesCache.rules;",
  "\t}",
  "\tconst stamp = `${stat.mtimeMs}:${stat.size}`;",
  "\tif (hotfixGuestAckRulesCache.rules && hotfixGuestAckRulesCache.stamp === stamp) return hotfixGuestAckRulesCache.rules;",
  "\tlet rules = HOTFIX_GUEST_ACK_DEFAULTS;",
  "\ttry {",
  "\t\tconst parsed = JSON.parse(fs.readFileSync(HOTFIX_GUEST_ACK_FILE, \"utf8\"));",
  "\t\tif (!parsed || typeof parsed !== \"object\" || Array.isArray(parsed)) throw new Error(\"root must be a JSON object\");",
  "\t\tconst d = HOTFIX_GUEST_ACK_DEFAULTS;",
  "\t\trules = Object.freeze({",
  "\t\t\tenabled: parsed.enabled !== false,",
  "\t\t\tackAfterSeconds: hotfixGuestAckNumber(parsed.ackAfterSeconds, d.ackAfterSeconds, 3, 600),",
  "\t\t\tplaceholderText: hotfixGuestAckText(parsed.placeholderText, d.placeholderText),",
  "\t\t\tetaText: typeof parsed.etaText === \"string\" ? parsed.etaText.trim() : d.etaText,",
  "\t\t\tprogressEnabled: parsed.progress?.enabled !== false,",
  "\t\t\tprogressMinIntervalSeconds: hotfixGuestAckNumber(parsed.progress?.minIntervalSeconds, d.progressMinIntervalSeconds, 10, 600),",
  "\t\t\trichEnabled: parsed.rich?.enabled !== false,",
  "\t\t\tappendLater: parsed.appendLater !== false,",
  "\t\t\tappendMax: hotfixGuestAckNumber(parsed.appendMax, d.appendMax, 0, 50),",
  "\t\t\tretentionMinutes: hotfixGuestAckNumber(parsed.retentionMinutes, d.retentionMinutes, 1, 2880),",
  "\t\t\ttruncatedNote: hotfixGuestAckText(parsed.truncatedNote, d.truncatedNote),",
  "\t\t\tsettleFailedText: hotfixGuestAckText(parsed.settleFailedText, d.settleFailedText),",
  "\t\t\tsettleEmptyText: hotfixGuestAckText(parsed.settleEmptyText, d.settleEmptyText)",
  "\t\t});",
  "\t\thotfixGuestAckRulesCache.warned = null;",
  "\t\tlogVerbose(`[hotfix][guest-ack] rules loaded: enabled=${rules.enabled} ackAfter=${rules.ackAfterSeconds}s progress=${rules.progressEnabled}/${rules.progressMinIntervalSeconds}s rich=${rules.richEnabled} appendLater=${rules.appendLater}`);",
  "\t} catch (err) {",
  "\t\thotfixGuestAckWarnOnce(\"invalid\", String(err?.message ?? err));",
  "\t}",
  "\thotfixGuestAckRulesCache.stamp = stamp;",
  "\thotfixGuestAckRulesCache.rules = rules;",
  "\treturn rules;",
  "}",
  "function hotfixGuestAckFormatElapsed(ms) {",
  "\tconst total = Math.max(0, Math.round(ms / 1e3));",
  "\tconst m = Math.floor(total / 60);",
  "\tconst s = total % 60;",
  "\treturn m > 0 ? `${m}m ${s}s` : `${s}s`;",
  "}",
  "function hotfixGuestAckHasMediaBlocks(blocks) {",
  "\tconst walk = (list) => Array.isArray(list) && list.some((block) => {",
  "\t\tif (!block || typeof block !== \"object\") return false;",
  "\t\tif ([\"photo\", \"video\", \"document\", \"audio\", \"animation\", \"voice_note\", \"collage\", \"slideshow\", \"map\"].includes(block.type)) return true;",
  "\t\treturn walk(block.blocks) || walk(block.content) || (Array.isArray(block.items) && block.items.some((item) => walk(item?.blocks) || walk(item)));",
  "\t});",
  "\treturn walk(blocks);",
  "}",
  "function hotfixGuestAckRichFromChunk(chunk, params, rules) {",
  "\tif (!rules.richEnabled || params.richMessages !== true) return;",
  "\tconst rich = chunk?.richMessage;",
  "\tif (!rich || !Array.isArray(rich.blocks) || rich.blocks.length === 0 || hotfixGuestAckHasMediaBlocks(rich.blocks)) return;",
  "\treturn rich;",
  "}",
  "// Rich for append/replace: same filter, but richMessages comes from the entry (turn at arm / params at the final).",
  "function hotfixGuestAckRichForEntry(entry, richMessage) {",
  "\tif (!entry?.rules?.richEnabled || entry.richMessages !== true) return;",
  "\tif (!richMessage || !Array.isArray(richMessage.blocks) || richMessage.blocks.length === 0 || hotfixGuestAckHasMediaBlocks(richMessage.blocks)) return;",
  "\treturn richMessage;",
  "}",
  "// Markdown blocks = chunks between blank lines OUTSIDE ```-fences (a table/list/paragraph/code block as a whole), so trimming never tears markup.",
  "function hotfixGuestAckSplitBlocks(markdown) {",
  "\tconst blocks = [];",
  "\tlet current = [];",
  "\tlet inFence = false;",
  "\tfor (const line of String(markdown ?? \"\").split(\"\\n\")) {",
  "\t\tif (/^\\s*(```|~~~)/.test(line)) inFence = !inFence;",
  "\t\tif (!inFence && !line.trim()) {",
  "\t\t\tif (current.length) blocks.push(current.join(\"\\n\"));",
  "\t\t\tcurrent = [];",
  "\t\t\tcontinue;",
  "\t\t}",
  "\t\tcurrent.push(line);",
  "\t}",
  "\tif (current.length) blocks.push(current.join(\"\\n\"));",
  "\treturn blocks;",
  "}",
  "// Guest document from markdown through the same pipeline as chunk.richMessage of regular replies (planTelegramTextDeliveryPages from send-*):",
  "// one page with maxChars=4096 → fits; the page's plainText is the plain fallback without markdown markup.",
  "function hotfixGuestAckPlanDocument(entry, source, linkPreview) {",
  "\tconst text = String(source ?? \"\");",
  "\tif (!text.trim()) return { source: text, plainText: \"\", richMessage: void 0, fits: true };",
  "\tlet pages;",
  "\ttry {",
  "\t\tpages = planTelegramTextDeliveryPages({ text, maxChars: TELEGRAM_GUEST_TEXT_LIMIT, chunkMode: \"length\", tableMode: entry?.tableMode, richMessages: entry?.richMessages === true, skipEntityDetection: linkPreview === false });",
  "\t} catch (err) {",
  "\t\thotfixGuestAckLog(entry, `document plan failed, using raw text: ${formatErrorMessage(err)}`);",
  "\t\tpages = [{ plainText: text }];",
  "\t}",
  "\tconst page = pages[0];",
  "\tconst plainText = typeof page?.plainText === \"string\" && page.plainText.trim() ? page.plainText : text;",
  "\treturn { source: text, plainText, richMessage: page?.richMessage, fits: pages.length <= 1 && plainText.length <= TELEGRAM_GUEST_TEXT_LIMIT };",
  "}",
  "// Combined document prev + add within the 4096 limit of the RESULTING text. The new result has priority: (1) whole; (2) blocks are",
  "// dropped from the end of the old text, replaced by \"…\"; (3) old text dropped, blocks dropped from the end of the new text plus the",
  "// truncation note; (4) a single indivisible block longer than the limit → truncateTelegramGuestText by characters (the only case",
  "// where markup may tear).",
  "function hotfixGuestAckComposeDocument(entry, prevSource, addSource, linkPreview) {",
  "\tconst join = (a, b) => a && b ? `${a}\\n\\n${b}` : a || b;",
  "\tconst prev = String(prevSource ?? \"\").trim();",
  "\tconst add = String(addSource ?? \"\").trim();",
  "\tlet doc = hotfixGuestAckPlanDocument(entry, join(prev, add), linkPreview);",
  "\tif (doc.fits) return { ...doc, truncated: \"none\" };",
  "\tconst oldBlocks = hotfixGuestAckSplitBlocks(prev);",
  "\twhile (oldBlocks.length > 0) {",
  "\t\toldBlocks.pop();",
  "\t\tdoc = hotfixGuestAckPlanDocument(entry, join(oldBlocks.length ? `${oldBlocks.join(\"\\n\\n\")}\\n\\n…` : \"\", add), linkPreview);",
  "\t\tif (doc.fits) return { ...doc, truncated: \"old\" };",
  "\t}",
  "\tconst addBlocks = hotfixGuestAckSplitBlocks(add);",
  "\twhile (addBlocks.length > 1) {",
  "\t\taddBlocks.pop();",
  "\t\tdoc = hotfixGuestAckPlanDocument(entry, join(addBlocks.join(\"\\n\\n\"), entry?.rules?.truncatedNote ?? HOTFIX_GUEST_ACK_DEFAULTS.truncatedNote), linkPreview);",
  "\t\tif (doc.fits) return { ...doc, truncated: \"new\" };",
  "\t}",
  "\tdoc = hotfixGuestAckPlanDocument(entry, truncateTelegramGuestText(addBlocks[0] ?? add), linkPreview);",
  "\tif (!doc.fits) doc = { ...doc, plainText: truncateTelegramGuestText(doc.plainText), richMessage: void 0 };",
  "\treturn { ...doc, truncated: \"chars\" };",
  "}",
  "// Direct Bot API fallback (only when the bot object has no raw API); honours the configured apiRoot (hotfixTelegramApiRoot).",
  "async function hotfixGuestAckEditViaOfficialApi(entry, body) {",
  "\tconst token = entry?.token;",
  "\tif (!token?.trim()) throw new Error(\"telegram editMessageText fallback unavailable: missing bot token\");",
  "\tconst res = await fetch(`${hotfixTelegramApiRoot(entry.bot)}/bot${token}/editMessageText`, { method: \"POST\", headers: { \"content-type\": \"application/json\" }, body: JSON.stringify(body) });",
  "\tconst data = await res.json().catch(() => null);",
  "\tif (!res.ok || !data?.ok) throw new Error(`telegram editMessageText failed: ${typeof data?.description === \"string\" ? data.description : `HTTP ${res.status}`}`);",
  "\treturn data.result;",
  "}",
  "async function hotfixGuestAckEditInline(entry, content) {",
  "\tconst body = {",
  "\t\tinline_message_id: entry.inlineMessageId,",
  "\t\t...(content.richMessage ? { rich_message: content.richMessage } : { text: truncateTelegramGuestText(content.text) }),",
  "\t\t...(content.linkPreview === false ? { link_preview_options: { is_disabled: true } } : {}),",
  "\t\t...(content.replyMarkup ? { reply_markup: content.replyMarkup } : {})",
  "\t};",
  "\tconst api = entry.bot?.api;",
  "\tif (typeof api?.raw?.editMessageText === \"function\") return await api.raw.editMessageText(body);",
  "\treturn await hotfixGuestAckEditViaOfficialApi(entry, body);",
  "}",
  "const hotfixGuestAckRegistry = globalThis.__openclawHotfixGuestAck ?? (globalThis.__openclawHotfixGuestAck = { byQuery: new Map(), bySession: new Map() });",
  "function hotfixGuestAckLog(entry, message) {",
  "\t(entry?.runtime?.log ?? logVerbose)(`[hotfix][guest-ack] ${message} (query=${entry?.guestQueryId ?? \"?\"})`);",
  "}",
  "function hotfixGuestAckSweep(now = Date.now()) {",
  "\tfor (const [key, entry] of hotfixGuestAckRegistry.byQuery) if (entry.expiresAt <= now && entry.state !== \"armed\" && entry.state !== \"inflight\") {",
  "\t\thotfixGuestAckClearTimers(entry);",
  "\t\thotfixGuestAckRegistry.byQuery.delete(key);",
  "\t\tif (entry.sessionKey && hotfixGuestAckRegistry.bySession.get(entry.sessionKey) === entry) hotfixGuestAckRegistry.bySession.delete(entry.sessionKey);",
  "\t}",
  "}",
  "function hotfixGuestAckClearTimers(entry) {",
  "\tif (entry.ackTimer) clearTimeout(entry.ackTimer);",
  "\tif (entry.progressTimer) clearTimeout(entry.progressTimer);",
  "\tentry.ackTimer = void 0;",
  "\tentry.progressTimer = void 0;",
  "}",
  "function hotfixGuestAckPlaceholderText(entry, withElapsed) {",
  "\tconst base = entry.rules.etaText ? `${entry.rules.placeholderText} ${entry.rules.etaText}` : entry.rules.placeholderText;",
  "\treturn withElapsed ? `${base}\\n⏱ ${hotfixGuestAckFormatElapsed(Date.now() - entry.startedAt)}` : base;",
  "}",
  "function hotfixGuestAckScheduleProgress(entry) {",
  "\tif (!entry.rules.progressEnabled || entry.state !== \"placeholder\") return;",
  "\tconst elapsed = Date.now() - entry.startedAt;",
  "\tconst intervalMs = Math.min(6e4, Math.max(entry.rules.progressMinIntervalSeconds * 1e3, Math.round(elapsed / 6)));",
  "\tentry.progressTimer = setTimeout(async () => {",
  "\t\tentry.progressTimer = void 0;",
  "\t\tif (entry.state !== \"placeholder\" || entry.settled || entry.claimed) return;",
  "\t\t// heartbeat edits are always plain (the placeholder carries no rich content); claimFinal/settle await progressInflight so a heartbeat never lands over the final",
  "\t\tentry.progressInflight = hotfixGuestAckEditInline(entry, { text: hotfixGuestAckPlaceholderText(entry, true) });",
  "\t\ttry {",
  "\t\t\tawait entry.progressInflight;",
  "\t\t\tentry.progressFailures = 0;",
  "\t\t\tentry.progressEdits = (entry.progressEdits ?? 0) + 1;",
  "\t\t} catch (err) {",
  "\t\t\tif (!HOTFIX_GUEST_ACK_EDIT_UNCHANGED_RE.test(formatErrorMessage(err))) entry.progressFailures = (entry.progressFailures ?? 0) + 1;",
  "\t\t\thotfixGuestAckLog(entry, `progress edit failed (${entry.progressFailures ?? 0}): ${formatErrorMessage(err)}`);",
  "\t\t\tif ((entry.progressFailures ?? 0) >= 3) return;",
  "\t\t} finally {",
  "\t\t\tentry.progressInflight = void 0;",
  "\t\t}",
  "\t\tif (entry.claimed || entry.settled) return;",
  "\t\thotfixGuestAckScheduleProgress(entry);",
  "\t}, intervalMs);",
  "\tentry.progressTimer.unref?.();",
  "}",
  "async function hotfixGuestAckSendPlaceholder(entry) {",
  "\tif (entry.state !== \"armed\") return;",
  "\tentry.state = \"inflight\";",
  "\tentry.ackTimer = void 0;",
  "\tentry.inflight = (async () => {",
  "\t\ttry {",
  "\t\t\tconst result = buildTelegramGuestTextResult(hotfixGuestAckPlaceholderText(entry, false), { linkPreview: false });",
  "\t\t\tconst sent = await answerTelegramGuestQuery(entry.bot, entry.guestQueryId, result, entry.runtime, { token: entry.token });",
  "\t\t\tconst inlineMessageId = sent?.inline_message_id;",
  "\t\t\tif (typeof inlineMessageId !== \"string\" || !inlineMessageId) throw new Error(\"answerGuestQuery returned no inline_message_id\");",
  "\t\t\tentry.inlineMessageId = inlineMessageId;",
  "\t\t\tentry.state = \"placeholder\";",
  "\t\t\tentry.placeholderAt = Date.now();",
  "\t\t\thotfixGuestAckLog(entry, `placeholder sent after ${hotfixGuestAckFormatElapsed(Date.now() - entry.startedAt)} inline_message_id=${inlineMessageId}`);",
  "\t\t\thotfixGuestAckScheduleProgress(entry);",
  "\t\t} catch (err) {",
  "\t\t\tentry.state = \"failed\";",
  "\t\t\tentry.error = formatErrorMessage(err);",
  "\t\t\thotfixGuestAckLog(entry, `placeholder failed: ${entry.error}`);",
  "\t\t} finally {",
  "\t\t\tentry.inflight = void 0;",
  "\t\t}",
  "\t})();",
  "\tawait entry.inflight;",
  "}",
  "hotfixGuestAckRegistry.rules = loadHotfixGuestAckRules;",
  "hotfixGuestAckRegistry.resolve = (guestQueryId) => typeof guestQueryId === \"string\" && guestQueryId ? hotfixGuestAckRegistry.byQuery.get(guestQueryId) : void 0;",
  "hotfixGuestAckRegistry.resolveBySession = (sessionKey) => typeof sessionKey === \"string\" && sessionKey ? hotfixGuestAckRegistry.bySession.get(sessionKey) : void 0;",
  "hotfixGuestAckRegistry.arm = (input) => {",
  "\tconst guestQueryId = typeof input?.guestQueryId === \"string\" && input.guestQueryId.trim() ? input.guestQueryId.trim() : void 0;",
  "\tif (!guestQueryId || !input?.bot) return;",
  "\tconst rules = loadHotfixGuestAckRules();",
  "\tif (!rules.enabled) return;",
  "\thotfixGuestAckSweep();",
  "\tconst existing = hotfixGuestAckRegistry.byQuery.get(guestQueryId);",
  "\tif (existing) return existing.handle;",
  "\tconst now = Date.now();",
  "\tconst entry = {",
  "\t\tguestQueryId,",
  "\t\tsessionKey: typeof input.sessionKey === \"string\" && input.sessionKey ? input.sessionKey : void 0,",
  "\t\tbot: input.bot,",
  "\t\ttoken: typeof input.token === \"string\" ? input.token : void 0,",
  "\t\truntime: input.runtime,",
  "\t\trichMessages: input.richMessages === true, // rich for append/replace (turn.richMessages of the account; the final in deliverTextReply refines it from params)",
  "\t\ttableMode: input.tableMode,",
  "\t\trules,",
  "\t\tstate: \"armed\",",
  "\t\tstartedAt: now,",
  "\t\texpiresAt: now + rules.retentionMinutes * 6e4,",
  "\t\tappends: 0,",
  "\t\tsettled: false",
  "\t};",
  "\tentry.ackTimer = setTimeout(() => { void hotfixGuestAckSendPlaceholder(entry); }, rules.ackAfterSeconds * 1e3);",
  "\tentry.ackTimer.unref?.();",
  "\tentry.handle = {",
  "\t\tentry,",
  "\t\tnoteTool: (toolName) => { if (typeof toolName === \"string\" && toolName.trim()) entry.lastTool = toolName.trim(); },",
  "\t\tsettle: async (info) => {",
  "\t\t\tif (entry.settled) return;",
  "\t\t\tentry.settled = true;",
  "\t\t\tif (entry.inflight) await entry.inflight.catch(() => void 0);",
  "\t\t\tif (entry.state === \"armed\") { hotfixGuestAckClearTimers(entry); entry.state = \"closed\"; hotfixGuestAckRegistry.byQuery.delete(guestQueryId); return; }",
  "\t\t\tif (entry.progressTimer) { clearTimeout(entry.progressTimer); entry.progressTimer = void 0; }",
  "\t\t\tif (entry.progressInflight) await entry.progressInflight.catch(() => void 0); // a heartbeat in flight must not land over the service text",
  "\t\t\tif (entry.state !== \"placeholder\") return;",
  "\t\t\tconst text = info?.failed ? entry.rules.settleFailedText : entry.rules.settleEmptyText;",
  "\t\t\ttry {",
  "\t\t\t\tawait hotfixGuestAckEditInline(entry, { text });",
  "\t\t\t\tentry.lastText = text;",
  "\t\t\t\tentry.lastSource = text;",
  "\t\t\t\tentry.serviceText = true; // a late result (sub-agent announce) replaces the service text instead of appending to it",
  "\t\t\t\thotfixGuestAckLog(entry, `settled without final: ${info?.failed ? \"run failed\" : \"no visible reply\"}`);",
  "\t\t\t} catch (err) {",
  "\t\t\t\thotfixGuestAckLog(entry, `settle edit failed: ${formatErrorMessage(err)}`);",
  "\t\t\t}",
  "\t\t\tentry.state = \"answered\";",
  "\t\t}",
  "\t};",
  "\thotfixGuestAckRegistry.byQuery.set(guestQueryId, entry);",
  "\tif (entry.sessionKey) hotfixGuestAckRegistry.bySession.set(entry.sessionKey, entry);",
  "\treturn entry.handle;",
  "};",
  "// Final: return { inlineMessageId } when the placeholder is already up (an edit is needed), otherwise undefined (answer with answerGuestQuery); the timer is cleared.",
  "async function hotfixGuestAckClaimFinal(entry) {",
  "\tif (!entry) return;",
  "\tif (entry.state === \"armed\") { hotfixGuestAckClearTimers(entry); entry.state = \"claimed\"; return; }",
  "\tif (entry.inflight) await entry.inflight.catch(() => void 0);",
  "\tentry.claimed = true; // no new heartbeat edits start",
  "\tif (entry.progressTimer) { clearTimeout(entry.progressTimer); entry.progressTimer = void 0; }",
  "\tif (entry.progressInflight) await entry.progressInflight.catch(() => void 0); // wait for a heartbeat in flight, otherwise it lands over the final",
  "\tif (entry.state === \"placeholder\" && entry.inlineMessageId) return { inlineMessageId: entry.inlineMessageId };",
  "\treturn;",
  "}",
  "// source — the final's markdown source (for rebuilding the document on append), render — {richMessages, tableMode} of the delivery params.",
  "function hotfixGuestAckMarkAnswered(entry, inlineMessageId, text, source, render) {",
  "\tif (!entry) return;",
  "\tentry.state = \"answered\";",
  "\tif (typeof inlineMessageId === \"string\" && inlineMessageId && inlineMessageId !== \"guest\") entry.inlineMessageId = inlineMessageId;",
  "\tentry.lastText = text;",
  "\tentry.lastSource = typeof source === \"string\" && source.trim() ? source : text;",
  "\tif (render && typeof render === \"object\") {",
  "\t\tif (typeof render.richMessages === \"boolean\") entry.richMessages = render.richMessages;",
  "\t\tif (render.tableMode !== void 0) entry.tableMode = render.tableMode;",
  "\t}",
  "\tentry.serviceText = false;",
  "\tentry.answeredAt = Date.now();",
  "}",
  "// Append text(s) to an already answered inline message (a second payload of the same run, or a late payload of the same guest session —",
  "// a sub-agent announce). The settle service text is replaced, not appended to. Document = old source (markdown, entry.lastSource) + new",
  "// result, built by hotfixGuestAckComposeDocument (4096 limit on the resulting text, block-wise trimming, new text first) and edited as",
  "// rich_message (when rich is allowed for the entry and the blocks carry no media); rich error → plain retry (page plainText, no markdown",
  "// markup). options: { linkPreview, richMessages, tableMode } refine the entry's render parameters when given.",
  "async function hotfixGuestAckAppendToAnswered(entry, texts, options) {",
  "\tif (!entry || entry.state !== \"answered\" || !entry.inlineMessageId || !entry.rules.appendLater || entry.appends >= entry.rules.appendMax || entry.expiresAt <= Date.now()) return;",
  "\tconst clean = (Array.isArray(texts) ? texts : []).map((text) => typeof text === \"string\" ? normalizeTelegramGuestPlainText(text).trim() : \"\").filter(Boolean);",
  "\tif (clean.length === 0) return;",
  "\tconst linkPreview = options && typeof options === \"object\" ? options.linkPreview : void 0;",
  "\tif (options && typeof options.richMessages === \"boolean\") entry.richMessages = options.richMessages;",
  "\tif (options && options.tableMode !== void 0) entry.tableMode = options.tableMode;",
  "\tconst prev = entry.serviceText ? \"\" : String(entry.lastSource ?? entry.lastText ?? \"\").trim();",
  "\tconst add = clean.join(\"\\n\\n\").trim();",
  "\tconst doc = hotfixGuestAckComposeDocument(entry, prev, add, linkPreview);",
  "\tconst rich = hotfixGuestAckRichForEntry(entry, doc.richMessage);",
  "\tconst plainText = truncateTelegramGuestText(doc.plainText);",
  "\tlet usedRich = false;",
  "\ttry {",
  "\t\tif (rich) try {",
  "\t\t\tawait hotfixGuestAckEditInline(entry, { richMessage: rich, linkPreview });",
  "\t\t\tusedRich = true;",
  "\t\t} catch (richErr) {",
  "\t\t\tif (HOTFIX_GUEST_ACK_EDIT_UNCHANGED_RE.test(formatErrorMessage(richErr))) usedRich = true;",
  "\t\t\telse {",
  "\t\t\t\thotfixGuestAckLog(entry, `rich append failed, retrying plain: ${formatErrorMessage(richErr)}`);",
  "\t\t\t\tawait hotfixGuestAckEditInline(entry, { text: plainText, linkPreview });",
  "\t\t\t}",
  "\t\t}",
  "\t\telse await hotfixGuestAckEditInline(entry, { text: plainText, linkPreview });",
  "\t} catch (err) {",
  "\t\tif (!HOTFIX_GUEST_ACK_EDIT_UNCHANGED_RE.test(formatErrorMessage(err))) {",
  "\t\t\tentry.lastAppendError = formatErrorMessage(err);",
  "\t\t\thotfixGuestAckLog(entry, `append failed: ${entry.lastAppendError}`);",
  "\t\t\tif (HOTFIX_GUEST_ACK_EDIT_GONE_RE.test(entry.lastAppendError)) entry.appends = entry.rules.appendMax;",
  "\t\t\treturn;",
  "\t\t}",
  "\t}",
  "\tentry.lastText = plainText;",
  "\tentry.lastSource = doc.source;",
  "\tentry.serviceText = false;",
  "\tentry.lastAppendError = void 0;",
  "\tentry.appends += 1;",
  "\thotfixGuestAckLog(entry, `payload appended to inline message (${entry.appends}/${entry.rules.appendMax}${prev ? \"\" : \", replaced service/empty text\"}) rich=${usedRich} truncated=${doc.truncated} chars=${plainText.length}`);",
  "\treturn { delivered: true, inlineMessageId: entry.inlineMessageId, rich: usedRich };",
  "}",
  "// Final of a guest-session run delivered by the core (deliverAgentCommandResult: announce/settle turn of a sub-agent, deliver:true) —",
  "// see guest-announce-final-inline. Returns { delivered: true, inlineMessageId } or { delivered: false, reason } (the caller drops the payload with a log line).",
  "hotfixGuestAckRegistry.appendBySession = async (sessionKey, texts, options) => {",
  "\tif (!loadHotfixGuestAckRules().enabled) return { delivered: false, reason: \"guest-ack disabled (rules.enabled=false)\" };",
  "\tconst entry = hotfixGuestAckRegistry.resolveBySession(sessionKey);",
  "\tif (!entry) return { delivered: false, reason: \"no answered guest query for this session (never answered, expired or gateway restarted)\" };",
  "\tif (entry.inflight) await entry.inflight.catch(() => void 0);",
  "\tif (entry.state === \"armed\" || entry.state === \"placeholder\" || entry.state === \"inflight\") return { delivered: false, reason: `guest query of this session is still in flight (state=${entry.state}); the running turn owns the inline message` };",
  "\tif (entry.state !== \"answered\" || !entry.inlineMessageId) return { delivered: false, reason: `no inline message to edit (state=${entry.state})` };",
  "\tif (!entry.rules.appendLater) return { delivered: false, reason: \"appendLater=false in rules\" };",
  "\tif (entry.appends >= entry.rules.appendMax) return { delivered: false, reason: `appendMax=${entry.rules.appendMax} reached` };",
  "\tif (entry.expiresAt <= Date.now()) return { delivered: false, reason: `entry expired (retentionMinutes=${entry.rules.retentionMinutes})` };",
  "\tconst appended = await hotfixGuestAckAppendToAnswered(entry, texts, { linkPreview: options?.linkPreview, richMessages: options?.richMessages, tableMode: options?.tableMode });",
  "\tif (appended) return { delivered: true, inlineMessageId: appended.inlineMessageId, rich: appended.rich };",
  "\treturn { delivered: false, reason: entry.lastAppendError ? `editMessageText failed: ${entry.lastAppendError}` : \"no text to append\" };",
  "};",
  "async function hotfixGuestAckAppendLater(params) {",
  "\tconst entry = hotfixGuestAckRegistry.resolveBySession(params.sessionKeyForInternalHooks);",
  "\tif (!entry) return;",
  "\tconst texts = (Array.isArray(params.replies) ? params.replies : []).map((reply) => typeof reply?.text === \"string\" ? reply.text : \"\");",
  "\tconst appended = await hotfixGuestAckAppendToAnswered(entry, texts, { linkPreview: params.linkPreview, richMessages: params.richMessages, tableMode: params.tableMode });",
  "\treturn appended ? { delivered: true } : void 0;",
  "}",
  "//#endregion",
  "",
].join("\n"));
// Guest-ветка deliverTextReply после каскадов telegram-guest-mode-delivery + guest-plain-delivery-normalize + guest-single-answer-guard (прод 9.7 байт-в-байт).
const GUEST_BRANCH_OLD_97 = `\tif (params.guestQueryId) {
\t\tif (params.progress.guestAnswered) return;
\t\tconst guestReplyText = normalizeTelegramGuestPlainText(params.text);
\t\tconst guestChunks = filterEmptyTelegramTextChunks(params.chunkText(guestReplyText));
\t\tconst firstChunk = guestChunks[0];
\t\tconst useHtml = false;
\t\tconst fallbackText = normalizeTelegramGuestPlainText(firstChunk?.plainText ?? guestReplyText);
\t\tconst text = guestChunks.length > 1 ? \`\${fallbackText.trimEnd()}\\n\\n[Reply truncated: Telegram guest mode limit.]\` : fallbackText;
\t\tlet guestDeliveredMessageId;
\t\ttry {
\t\t\tguestDeliveredMessageId = await sendTelegramGuestText(params.bot, params.guestQueryId, text, params.runtime, {
\t\t\t\tparseMode: void 0,
\t\t\t\tlinkPreview: params.linkPreview,
\t\t\t\treplyMarkup: params.replyMarkup,
\t\t\t\ttoken: params.token
\t\t\t});
\t\t} catch (err) {
\t\t\tif (!isTelegramGuestQueryExpiredError(err)) throw err;
\t\t\t//#region hotfix: guest-single-answer-guard (2026-07-27)
\t\t\tparams.runtime.log?.(\`[hotfix][guest-single-answer] guest query expired; dropping payload without sendMessage fallback: \${formatErrorMessage(err)}\`);
\t\t\treturn;
\t\t\t//#endregion
\t\t}
\t\tif (guestDeliveredMessageId != null) {
\t\t\tparams.progress.guestAnswered = true;
\t\t\tmarkDelivered(params.progress);
\t\t\treturn guestDeliveredMessageId;
\t\t}
\t\t//#region hotfix: guest-single-answer-guard (2026-07-27): guest reply must never fall back to sendMessage
\t\tparams.runtime.log?.("[hotfix][guest-single-answer] inline answer returned no message id; suppressing sendMessage fallback");
\t\treturn;
\t\t//#endregion
\t}
`;
// v1 ветки (04.10 утро): append второго payload plain-текстом, MarkAnswered без источника. Остаётся для апгрейда v1 → v2 на пропатченном чанке.
const GUEST_BRANCH_V1_97 = `\tif (params.guestQueryId) {
\t\tif (params.progress.guestAnswered) return;
\t\t//#region ${MARK} (2026-10-04): финал правит плейсхолдер по inline_message_id; rich → plain fallback; без плейсхолдера — один answerGuestQuery
\t\tconst guestAckRules = loadHotfixGuestAckRules();
\t\tconst guestAckEntry = guestAckRules.enabled ? hotfixGuestAckRegistry.resolve(params.guestQueryId) : void 0;
\t\tconst guestReplyText = normalizeTelegramGuestPlainText(params.text);
\t\tconst guestChunks = filterEmptyTelegramTextChunks(params.chunkText(guestReplyText));
\t\tconst firstChunk = guestChunks[0];
\t\tconst useHtml = false;
\t\tconst guestRichMessage = hotfixGuestAckRichFromChunk(firstChunk, params, guestAckRules);
\t\tconst fallbackText = normalizeTelegramGuestPlainText(firstChunk?.plainText ?? guestReplyText);
\t\tconst text = guestChunks.length > 1 ? \`\${fallbackText.trimEnd()}\\n\\n[Reply truncated: Telegram guest mode limit.]\` : fallbackText;
\t\tconst guestPlaceholder = await hotfixGuestAckClaimFinal(guestAckEntry);
\t\tif (!guestPlaceholder && guestAckEntry?.state === "answered" && guestAckEntry.inlineMessageId) {
\t\t\tconst guestAppended = await hotfixGuestAckAppendToAnswered(guestAckEntry, [text], params.linkPreview);
\t\t\tif (!guestAppended) {
\t\t\t\thotfixGuestAckLog(guestAckEntry, "query already answered; dropping extra payload without sendMessage fallback");
\t\t\t\treturn;
\t\t\t}
\t\t\tparams.progress.guestAnswered = true;
\t\t\tmarkDelivered(params.progress);
\t\t\treturn guestAppended.inlineMessageId;
\t\t}
\t\tif (guestPlaceholder) {
\t\t\tconst guestEditContent = { linkPreview: params.linkPreview, replyMarkup: params.replyMarkup };
\t\t\ttry {
\t\t\t\tif (guestRichMessage) try {
\t\t\t\t\tawait hotfixGuestAckEditInline(guestAckEntry, { ...guestEditContent, richMessage: guestRichMessage });
\t\t\t\t} catch (richErr) {
\t\t\t\t\thotfixGuestAckLog(guestAckEntry, \`rich edit failed, retrying plain: \${formatErrorMessage(richErr)}\`);
\t\t\t\t\tawait hotfixGuestAckEditInline(guestAckEntry, { ...guestEditContent, text });
\t\t\t\t}
\t\t\t\telse await hotfixGuestAckEditInline(guestAckEntry, { ...guestEditContent, text });
\t\t\t} catch (err) {
\t\t\t\tif (!HOTFIX_GUEST_ACK_EDIT_UNCHANGED_RE.test(formatErrorMessage(err))) {
\t\t\t\t\thotfixGuestAckLog(guestAckEntry, \`final edit failed; dropping payload without sendMessage fallback: \${formatErrorMessage(err)}\`);
\t\t\t\t\treturn;
\t\t\t\t}
\t\t\t}
\t\t\thotfixGuestAckMarkAnswered(guestAckEntry, guestPlaceholder.inlineMessageId, text);
\t\t\thotfixGuestAckLog(guestAckEntry, \`final edited into placeholder after \${hotfixGuestAckFormatElapsed(Date.now() - guestAckEntry.startedAt)} rich=\${Boolean(guestRichMessage)}\`);
\t\t\tparams.progress.guestAnswered = true;
\t\t\tmarkDelivered(params.progress);
\t\t\treturn guestPlaceholder.inlineMessageId;
\t\t}
\t\tlet guestDeliveredMessageId;
\t\ttry {
\t\t\tif (guestRichMessage) try {
\t\t\t\tconst richResult = { type: "article", id: buildTelegramGuestResultId(), title: "Reply", input_message_content: { rich_message: guestRichMessage }, ...params.replyMarkup ? { reply_markup: params.replyMarkup } : {} };
\t\t\t\tconst richSent = await answerTelegramGuestQuery(params.bot, params.guestQueryId, richResult, params.runtime, { token: params.token });
\t\t\t\tguestDeliveredMessageId = richSent?.inline_message_id ?? "guest";
\t\t\t\tparams.runtime?.log?.(\`[hotfix][guest-ack] answerGuestQuery rich ok inline_message_id=\${richSent?.inline_message_id ?? "unknown"}\`);
\t\t\t} catch (richErr) {
\t\t\t\tif (isTelegramGuestQueryExpiredError(richErr)) throw richErr;
\t\t\t\tparams.runtime?.log?.(\`[hotfix][guest-ack] answerGuestQuery rich failed, retrying plain: \${formatErrorMessage(richErr)}\`);
\t\t\t}
\t\t\tif (guestDeliveredMessageId == null) guestDeliveredMessageId = await sendTelegramGuestText(params.bot, params.guestQueryId, text, params.runtime, {
\t\t\t\tparseMode: void 0,
\t\t\t\tlinkPreview: params.linkPreview,
\t\t\t\treplyMarkup: params.replyMarkup,
\t\t\t\ttoken: params.token
\t\t\t});
\t\t} catch (err) {
\t\t\tif (!isTelegramGuestQueryExpiredError(err)) throw err;
\t\t\t//#region hotfix: guest-single-answer-guard (2026-07-27)
\t\t\tparams.runtime.log?.(\`[hotfix][guest-single-answer] guest query expired; dropping payload without sendMessage fallback: \${formatErrorMessage(err)}\`);
\t\t\treturn;
\t\t\t//#endregion
\t\t}
\t\tif (guestDeliveredMessageId != null) {
\t\t\thotfixGuestAckMarkAnswered(guestAckEntry, guestDeliveredMessageId, text);
\t\t\tparams.progress.guestAnswered = true;
\t\t\tmarkDelivered(params.progress);
\t\t\treturn guestDeliveredMessageId;
\t\t}
\t\t//#endregion
\t\t//#region hotfix: guest-single-answer-guard (2026-07-27): guest reply must never fall back to sendMessage
\t\tparams.runtime.log?.("[hotfix][guest-single-answer] inline answer returned no message id; suppressing sendMessage fallback");
\t\treturn;
\t\t//#endregion
\t}
`;
// v2 ветки (v3 реестра): второй payload того же query дописывается как markdown-источник (rich через composeDocument), MarkAnswered получает
// исходный markdown финала и параметры рендера — чтобы поздний append (announce субагента) пересобрал документ целиком.
const GUEST_BRANCH_V1_TO_V2 = [
  ["await hotfixGuestAckAppendToAnswered(guestAckEntry, [text], params.linkPreview);", "await hotfixGuestAckAppendToAnswered(guestAckEntry, [guestReplyText], { linkPreview: params.linkPreview, richMessages: params.richMessages, tableMode: params.tableMode }); // v3: markdown-источник → rich"],
  ["hotfixGuestAckMarkAnswered(guestAckEntry, guestPlaceholder.inlineMessageId, text);", "hotfixGuestAckMarkAnswered(guestAckEntry, guestPlaceholder.inlineMessageId, text, guestReplyText, { richMessages: params.richMessages, tableMode: params.tableMode });"],
  ["hotfixGuestAckMarkAnswered(guestAckEntry, guestDeliveredMessageId, text);", "hotfixGuestAckMarkAnswered(guestAckEntry, guestDeliveredMessageId, text, guestReplyText, { richMessages: params.richMessages, tableMode: params.tableMode });"],
];
const GUEST_BRANCH_NEW_97 = GUEST_BRANCH_V1_TO_V2.reduce((acc, [from, to]) => {
  if (acc.split(from).length !== 2) throw new Error(`guest-ack-edit: v1 branch template must contain exactly once: ${from}`);
  return acc.replace(from, to);
}, GUEST_BRANCH_V1_97);
// 10.5: guest-ветка внутри замыкания createReplyDeliverer (см. шапку). Каждая замена обязана сработать (иначе шаблон 9.7 разошёлся с таблицей).
function to105(branch) {
  let out = branch.split("\n").map((line) => line ? `\t${line}` : line).join("\n");
  const exact = [
    ["params.progress.guestAnswered", "progress.guestAnswered"],
    ["markDelivered(params.progress)", "hotfixGuestMarkDelivered(progress)"],
    ["filterEmptyTelegramTextChunks(params.chunkText(guestReplyText))", "hotfixGuestPlanTextChunks(config, guestReplyText)"],
  ];
  for (const [from, to] of exact) { if (!out.includes(from)) throw new Error(`guest-ack-edit to105: template lacks ${from}`); out = out.split(from).join(to); }
  if (out.includes("hotfixGuestAckRichFromChunk(firstChunk, params, guestAckRules)")) out = out.split("hotfixGuestAckRichFromChunk(firstChunk, params, guestAckRules)").join("hotfixGuestAckRichFromChunk(firstChunk, config, guestAckRules)");
  out = out.replace(/\bparams\.(bot|token|runtime|linkPreview|richMessages|tableMode)\b/g, "config.$1");
  const left = out.match(/\bparams\.(?!text\b|guestQueryId\b|replyMarkup\b)[A-Za-z_]+/g);
  if (left) throw new Error(`guest-ack-edit to105: unmapped params fields ${[...new Set(left)].join(", ")}`);
  return out;
}
const GUEST_BRANCH_OLD = to105(GUEST_BRANCH_OLD_97);
const GUEST_BRANCH_V1 = to105(GUEST_BRANCH_V1_97);
const GUEST_BRANCH_NEW = to105(GUEST_BRANCH_NEW_97);
// Поздний payload guest-сессии (без guestQueryId): перед guard'ом guest-no-chat-fallback — попытка дописать в inline-сообщение.
const PLAN_OLD = "async function deliverReplyPlan(params, createPlan) {\n\t//#region hotfix: guest-no-chat-fallback (2026-07-29; 2026-09-24 → deliverReplyPlan)\n";
const PLAN_NEW = `async function deliverReplyPlan(params, createPlan) {
\t//#region ${MARK} (2026-10-04): поздний payload guest-сессии (announce субагента) дописывается в уже отвеченное inline-сообщение
\tif (!params.guestQueryId && typeof params.sessionKeyForInternalHooks === "string" && params.sessionKeyForInternalHooks.includes(":guest:")) {
\t\tconst guestAckAppended = await hotfixGuestAckAppendLater(params);
\t\tif (guestAckAppended) return guestAckAppended;
\t}
\t//#endregion
\t//#region hotfix: guest-no-chat-fallback (2026-07-29; 2026-09-24 → deliverReplyPlan)
`;
const count = (s, n) => s.split(n).length - 1;
function replaceRegistryRegion(source) {
  const start = source.indexOf(REGION_START);
  if (start === -1) return insertBefore(source, "function createReplyDeliverer(config, sender, progress) {", REGISTRY, "guest-ack registry before createReplyDeliverer (top level, 10.5)");
  const endIdx = source.indexOf(REGION_END, start);
  if (endIdx === -1) throw new Error("guest-ack-edit: registry region without //#endregion");
  return `${source.slice(0, start)}${REGISTRY}${source.slice(endIdx + REGION_END.length)}`;
}
export function patch(source) {
  let next = noChatPatch(guardPatch(plainPatch(basePatch(source))));
  if (next.includes(REGISTRY) && next.includes(GUEST_BRANCH_NEW) && next.includes(PLAN_NEW) && next.includes(FS_IMPORT)) return next;
  if (!next.includes(FS_IMPORT)) next = next.includes("import fs from \"node:fs\";") ? next : `${FS_IMPORT}${next}`;
  if (!next.includes(REGISTRY)) next = replaceRegistryRegion(next); // свежая вставка или апгрейд версии регистра
  if (!next.includes(GUEST_BRANCH_NEW)) next = next.includes(GUEST_BRANCH_V1)
    ? replaceOnce(next, GUEST_BRANCH_V1, GUEST_BRANCH_NEW, "guest-ack-edit deliverTextReply guest branch v1 → v2 (markdown source for rich append)")
    : replaceOnce(next, GUEST_BRANCH_OLD, GUEST_BRANCH_NEW, "guest-ack-edit deliverTextReply guest branch (cascade over guest delivery ports)");
  if (!next.includes(PLAN_NEW)) next = replaceOnce(next, PLAN_OLD, PLAN_NEW, "guest-ack-edit late-append before guest-no-chat-fallback guard");
  return next;
}
const guestBranchOrder = (src) => {
  const start = src.indexOf("async function deliverTextReply(params) {");
  if (start < 0) return "deliverTextReply not found";
  const claim = src.indexOf("await hotfixGuestAckClaimFinal(guestAckEntry)", start);
  const answer = src.indexOf("await sendTelegramGuestText(config.bot, params.guestQueryId, text", start);
  const send = src.indexOf("return sender.sendText({", start);
  if (claim < 0 || answer < 0 || send < 0 || !(claim < answer && answer < send)) return "guest-ack claim must precede answerGuestQuery and sender.sendText in deliverTextReply";
  return null;
};
export const check = { gate: "required", assertions: [
  contains(MARK, "маркер guest-ack-edit"),
  contains(REGISTRY, "актуальный регион реестра целиком"),
  contains(GUEST_BRANCH_NEW, "guest-ветка deliverTextReply с правкой плейсхолдера"),
  contains(PLAN_NEW, "поздний append перед guard'ом guest-no-chat-fallback"),
  contains(FS_IMPORT, "import fs для файла правил"),
  contains(rulesFileExpression("OPENCLAW_HOTFIX_GUEST_ACK_FILE", "hotfix-guest-ack.json"), "portable rules path"),
  contains("globalThis.__openclawHotfixGuestAck", "общий реестр на globalThis"),
  contains("input_message_content: { rich_message: guestRichMessage }", "rich-ответ гостю (InputRichMessageContent)"),
  notContains(GUEST_BRANCH_OLD, "старая guest-ветка без ack-edit"),
  notContains(GUEST_BRANCH_V1, "guest-ветка v1 (plain append без источника) не осталась"),
  // v3: rich append — конвейер документа и его зависимости в чанке
  contains("function hotfixGuestAckComposeDocument(entry, prevSource, addSource, linkPreview) {", "сборка объединённого документа гостя (v3)"),
  contains("function hotfixGuestAckSplitBlocks(markdown) {", "разбиение markdown на блоки для обрезки (v3)"),
  contains("rich append failed, retrying plain", "fallback rich → plain у append (v3)"),
  contains("planTelegramTextDeliveryPages({ text, maxChars: TELEGRAM_GUEST_TEXT_LIMIT,", "документ гостя строится planTelegramTextDeliveryPages (v3)"),
  (src) => /^import \{[^\n]*\bas planTelegramTextDeliveryPages\b[^\n]*\} from "\.\/send-[A-Za-z0-9_-]+\.mjs";$/m.test(src) ? null : "planTelegramTextDeliveryPages не импортируется чанком из send-*",
  contains("entry.lastSource = ", "реестр хранит markdown-источник документа (v3)"),
  contains("if (entry.progressInflight) await entry.progressInflight.catch(() => void 0);", "claimFinal ждёт heartbeat в полёте (v3)"),
  // маркеры/строки, на которые опираются assertions соседних guest-портов, должны пережить перезапись ветки
  contains("if (progress.guestAnswered) return;", "guard guestAnswered (telegram-guest-mode-delivery)"),
  contains("hotfixGuestMarkDelivered(progress);", "inline-ответ учитывается в deliveredCount (telegram-guest-mode-delivery, 10.5)"),
  // 10.5: реестр — верхний уровень модуля, перед фабрикой createReplyDeliverer (не внутри замыкания)
  (c) => { const r = c.indexOf(REGION_START); const f = c.indexOf("\nfunction createReplyDeliverer(config, sender, progress) {"); return r >= 0 && f >= 0 && r < f && c.lastIndexOf("\n//#endregion\n", f) > r ? null : "регион реестра guest-ack не на верхнем уровне перед createReplyDeliverer"; },
  contains("hotfix: guest-single-answer-guard", "маркер guest-single-answer-guard сохранён"),
  contains("parseMode: void 0,", "plain parseMode (guest-plain-delivery-normalize)"),
  notContains("falling back to sendMessage", "sendMessage-fallback не вернулся"),
  // зависимости в чанке
  contains("import { t as formatErrorMessage } from \"./errors-", "formatErrorMessage в чанке"),
  contains("import { r as logVerbose, t as danger } from \"./globals-", "logVerbose в чанке"),
  guestBranchOrder,
  (c) => count(c, REGION_START) === 1 && count(c, "hotfixGuestAckRegistry.arm = ") === 1 && count(c, "hotfixGuestAckRegistry.appendBySession = ") === 1 && count(c, "async function hotfixGuestAckClaimFinal(entry) {") === 1 && count(c, "await hotfixGuestAckAppendLater(params)") === 1 && count(c, "async function hotfixGuestAckAppendToAnswered(entry, texts, options) {") === 1 ? null : "регистр/claim/append/appendBySession объявлены или вызваны не по одному разу",
  contains("entry.serviceText = true;", "служебный текст settle помечается для замены поздним итогом"),
  (c) => count(c, "import fs from \"node:fs\"") === 1 ? null : `ожидался ровно один import fs, найдено ${count(c, "import fs from \"node:fs\"")}`,
] };
