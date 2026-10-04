// Port-модуль метки guest-ack-edit (часть 1/2, delivery; new 2026-10-04; OpenClaw 2026.9.7, чанк delivery-BE0K214i.mjs).
// Guest-модуль (INCLUDE_GUEST=1), каскад поверх telegram-guest-mode-delivery → guest-plain-delivery-normalize → guest-single-answer-guard
// → guest-no-chat-fallback (ставится ПОСЛЕДНИМ в ключе delivery; переписывает guest-ветку deliverTextReply целиком, сохраняя маркеры/строки,
// которые проверяют assertions перечисленных портов).
//
// Проблема: у Telegram Guest Mode один ответ на guest_query (answerGuestQuery), а TTL query не документирован (по журналу ответы проходили
// до 248 с; истечение — после простоя gateway). Длинный ран (web_search, субагенты, 15+ мин) → «query is too old» → guest-single-answer-guard
// молча дропает ответ, гость не видит ничего.
// Лечение: реестр ack-состояний на globalThis.__openclawHotfixGuestAck (общий для чанков bot-message и delivery, без новых экспортов чанка):
//   • arm({bot, token, runtime, guestQueryId, sessionKey}) — вызывает bot-message в начале runTelegramDispatchTurn (часть 2/2). Через
//     ackAfterSeconds (дефолт 45) без финала → answerGuestQuery плейсхолдером (placeholderText [+ etaText]) → сохраняем inline_message_id.
//     Дальше heartbeat-правки того же сообщения («⏱ 1 мин 30 с») с троттлингом (progress.minIntervalSeconds, дефолт 15, растёт до 60 с на
//     длинных ранах; progress.enabled=false выключает). Прогресс по времени, не по событиям инструментов: для гостей in-run progress
//     выключен guest-suppress-inrun-progress, onToolStart до бота не доходит (noteTool оставлен best-effort).
//   • финал в deliverTextReply (guest-ветка): если у entry есть inline_message_id → editMessageText(inline_message_id, …) (rich → plain
//     fallback); если плейсхолдер в полёте → дождаться; если таймер ещё не сработал → снять и ответить одним answerGuestQuery как раньше.
//     Истёк TTL без сохранённого id → прежнее поведение (guard: дроп без sendMessage).
//   • settle({failed}) в finally runTelegramDispatchTurn: таймеры снимаются; если плейсхолдер стоит, а финала не было — правка «⚠️ …» /
//     «обработано без текста». Entry живёт retentionMinutes (дефолт 360) ради поздних payload'ов той же guest-сессии (announce субагента,
//     который иначе дропает guest-no-chat-fallback): deliverReplyPlan дописывает их в то же inline-сообщение (appendLater, лимит appendMax).
//   • Rich: Bot API 10.3 разрешает InputRichMessageContent в результатах guest-query и rich_message в editMessageText; chunk.richMessage
//     (planTelegramTextDeliveryPages) уже InputRichMessage {blocks, skip_entity_detection?} → уходит как есть, если richMessages включены,
//     rules.rich.enabled и в блоках нет медиа (upload для inline запрещён); любая ошибка rich → повтор plain (запрос ещё не отвечен /
//     правка не применена). Текст > 4096 → обрезка с пометкой (второго сообщения у гостя нет, ссылку дать некуда — обосновано в отчёте).
// Файл правил (горячий, кэш по mtime+size, один statSync на обращение): <OPENCLAW_STATE_DIR | $HOME/.openclaw>/hotfix-guest-ack.json
//   { "enabled": true, "ackAfterSeconds": 45, "placeholderText": "Принял, работаю…", "etaText": "", "progress": { "enabled": true,
//     "minIntervalSeconds": 15 }, "rich": { "enabled": true }, "appendLater": true, "appendMax": 5, "retentionMinutes": 360 }
//   нет файла / битый JSON → дефолты + один warn; enabled:false → реестр ничего не делает (поведение как до порта).
//   Путь — env OPENCLAW_HOTFIX_GUEST_ACK_FILE (офлайн-репро; читается при загрузке модуля).
// 2026-10-04 (v2 реестра, вместе с guest-announce-final-inline): registry.appendBySession(sessionKey,
//   texts, {linkPreview}) — вход для финала рана guest-сессии, который доставляет ядро (deliverAgentCommandResult: announce/settle-ход субагента;
//   раньше такой финал шёл бы в чат адресата записи сессии = DM владельца). Append заменяет служебный текст settle (entry.serviceText), при
//   переполнении 4096 ужимает старый текст, а не новый итог; причины отказа возвращаются вызывающему для лога.
// 2026-10-04 (v3 реестра): append/replace в inline-сообщении гостя — rich. Реестр хранит исходный
//   markdown документа (entry.lastSource) и параметры рендера (entry.richMessages/tableMode: из turn при arm, из params при финале); объединённый
//   документ (старый источник + новый итог, либо только новый при замене служебного текста) собирается тем же конвейером, что chunk.richMessage
//   обычных ответов — planTelegramTextDeliveryPages (импорт чанка из send-*) с maxChars=4096 → editMessageText(inline_message_id, rich_message);
//   любая ошибка rich → повтор plain отрендеренным plainText страницы (без markdown-звёздочек), лог «rich append failed, retrying plain».
//   Лимит 4096 считается по итоговому тексту документа (одна страница плана); приоритет у нового итога; обрезка по границам блоков markdown
//   (пустая строка вне ```-fence): сначала с конца старого текста (маркер «…»), затем с конца нового (пометка «[Ответ обрезан…]»), и только
//   один неделимый блок длиннее лимита режется по символам (truncateTelegramGuestText). Heartbeat/плейсхолдер остаются plain; гонка
//   «heartbeat в полёте поверх финала» закрыта: claimFinal/settle ждут entry.progressInflight, колбэк heartbeat проверяет entry.claimed.
// В чанке уже есть: formatErrorMessage, logVerbose, fetch (global), planTelegramTextDeliveryPages (send-*), normalizeTelegramGuestPlainText/
// TELEGRAM_GUEST_TEXT_LIMIT/truncateTelegramGuestText/buildTelegramGuestTextResult/answerTelegramGuestQuery (порты выше). Добавляется import fs (node:fs).
// Kit v1.2.0: the rules file path is not hard-coded. Runtime resolution inside the patched bundle:
//   OPENCLAW_HOTFIX_GUEST_ACK_FILE, else <OPENCLAW_STATE_DIR | $HOME/.openclaw>/hotfix-guest-ack.json
import { replaceOnce, insertBefore, contains, notContains, rulesFileExpression } from "../lib/patch-helpers.mjs";
import { patch as basePatch } from "./telegram-guest-mode-delivery.mjs";
import { patch as plainPatch } from "./guest-plain-delivery-normalize.mjs";
import { patch as guardPatch } from "./guest-single-answer-guard.mjs";
import { patch as noChatPatch } from "./guest-no-chat-fallback.mjs";
const MARK = "hotfix: guest-ack-edit";
export const label = "guest-ack-edit-delivery";
export const verdict = "port";
export const target = { key: "delivery", label: "Telegram delivery.replies bundle", needles: ["async function deliverTextReply(params) {", "async function deliverReplyPlan(params, createPlan) {", "function filterEmptyTelegramTextChunks(chunks) {"] };
const FS_IMPORT = "import fs from \"node:fs\"; // hotfix: guest-ack-edit (rules file)\n";
const REGION_START = `//#region ${MARK} (registry)`;
const REGION_END = "//#endregion\n";
const REGISTRY = [
  `${REGION_START} 2026-10-04 — реестр плейсхолдеров guest-query: таймер → answerGuestQuery(плейсхолдер) → heartbeat-правки → финал editMessageText(inline_message_id)`,
  `const HOTFIX_GUEST_ACK_FILE = ${rulesFileExpression("OPENCLAW_HOTFIX_GUEST_ACK_FILE", "hotfix-guest-ack.json")};`,
  "const HOTFIX_GUEST_ACK_DEFAULTS = Object.freeze({",
  "\tenabled: true,",
  "\tackAfterSeconds: 45,",
  "\tplaceholderText: \"Принял, работаю…\",",
  "\tetaText: \"\",",
  "\tprogressEnabled: true,",
  "\tprogressMinIntervalSeconds: 15,",
  "\trichEnabled: true,",
  "\tappendLater: true,",
  "\tappendMax: 5,",
  "\tretentionMinutes: 360",
  "});",
  "const HOTFIX_GUEST_ACK_EDIT_UNCHANGED_RE = /message is not modified/i;",
  "const HOTFIX_GUEST_ACK_EDIT_GONE_RE = /MESSAGE_ID_INVALID|message to edit not found|message can't be edited|inline message id is invalid/i;",
  "let hotfixGuestAckRulesCache = { stamp: null, rules: null, warned: null };",
  "function hotfixGuestAckNumber(value, fallback, min, max) {",
  "\tconst n = typeof value === \"number\" ? value : typeof value === \"string\" && value.trim() ? Number(value) : NaN;",
  "\tif (!Number.isFinite(n)) return fallback;",
  "\treturn Math.min(max, Math.max(min, n));",
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
  "\t\t\tplaceholderText: typeof parsed.placeholderText === \"string\" && parsed.placeholderText.trim() ? parsed.placeholderText.trim() : d.placeholderText,",
  "\t\t\tetaText: typeof parsed.etaText === \"string\" ? parsed.etaText.trim() : d.etaText,",
  "\t\t\tprogressEnabled: parsed.progress?.enabled !== false,",
  "\t\t\tprogressMinIntervalSeconds: hotfixGuestAckNumber(parsed.progress?.minIntervalSeconds, d.progressMinIntervalSeconds, 10, 600),",
  "\t\t\trichEnabled: parsed.rich?.enabled !== false,",
  "\t\t\tappendLater: parsed.appendLater !== false,",
  "\t\t\tappendMax: hotfixGuestAckNumber(parsed.appendMax, d.appendMax, 0, 50),",
  "\t\t\tretentionMinutes: hotfixGuestAckNumber(parsed.retentionMinutes, d.retentionMinutes, 1, 2880)",
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
  "\treturn m > 0 ? `${m} мин ${s} с` : `${s} с`;",
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
  "// v3: rich для append/replace — тот же фильтр, но richMessages берётся из entry (turn при arm / params при финале), а не из params.",
  "function hotfixGuestAckRichForEntry(entry, richMessage) {",
  "\tif (!entry?.rules?.richEnabled || entry.richMessages !== true) return;",
  "\tif (!richMessage || !Array.isArray(richMessage.blocks) || richMessage.blocks.length === 0 || hotfixGuestAckHasMediaBlocks(richMessage.blocks)) return;",
  "\treturn richMessage;",
  "}",
  "// v3: блоки markdown — куски между пустыми строками ВНЕ ```-fence (таблица/список/абзац/код целиком), чтобы обрезка не рвала разметку.",
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
  "// v3: документ гостя из markdown тем же конвейером, что chunk.richMessage обычных ответов (planTelegramTextDeliveryPages из send-*):",
  "// одна страница с maxChars=4096 → fits; plainText страницы — plain-fallback без markdown-разметки.",
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
  "const HOTFIX_GUEST_ACK_TRUNCATED_NOTE = \"[Ответ обрезан из-за лимита Telegram guest mode.]\";",
  "// v3: объединённый документ prev + add в лимит 4096 по ИТОГОВОМУ тексту. Приоритет у нового итога: (1) целиком; (2) с конца старого текста",
  "// снимаются блоки, на их месте «…»; (3) старый отброшен, с конца нового снимаются блоки, в конец — пометка об обрезке; (4) единственный",
  "// неделимый блок длиннее лимита → truncateTelegramGuestText по символам (единственный случай, где разметка может порваться).",
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
  "\t\tdoc = hotfixGuestAckPlanDocument(entry, join(addBlocks.join(\"\\n\\n\"), HOTFIX_GUEST_ACK_TRUNCATED_NOTE), linkPreview);",
  "\t\tif (doc.fits) return { ...doc, truncated: \"new\" };",
  "\t}",
  "\tdoc = hotfixGuestAckPlanDocument(entry, truncateTelegramGuestText(addBlocks[0] ?? add), linkPreview);",
  "\tif (!doc.fits) doc = { ...doc, plainText: truncateTelegramGuestText(doc.plainText), richMessage: void 0 };",
  "\treturn { ...doc, truncated: \"chars\" };",
  "}",
  "async function hotfixGuestAckEditViaOfficialApi(token, body) {",
  "\tif (!token?.trim()) throw new Error(\"telegram editMessageText fallback unavailable: missing bot token\");",
  "\tconst res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, { method: \"POST\", headers: { \"content-type\": \"application/json\" }, body: JSON.stringify(body) });",
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
  "\treturn await hotfixGuestAckEditViaOfficialApi(entry.token, body);",
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
  "\t\t// v3: правка heartbeat всегда plain (плейсхолдер rich не содержит); claimFinal/settle ждут progressInflight, чтобы heartbeat не лёг поверх финала",
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
  "\t\trichMessages: input.richMessages === true, // v3: rich для append/replace (turn.richMessages аккаунта; финал в deliverTextReply уточняет по params)",
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
  "\t\t\tif (entry.progressInflight) await entry.progressInflight.catch(() => void 0); // v3: heartbeat в полёте не должен лечь поверх служебного текста",
  "\t\t\tif (entry.state !== \"placeholder\") return;",
  "\t\t\tconst text = info?.failed ? \"⚠️ Не удалось обработать запрос. Попробуйте ещё раз.\" : \"Запрос обработан, но текстового ответа не получилось. Попробуйте переформулировать.\";",
  "\t\t\ttry {",
  "\t\t\t\tawait hotfixGuestAckEditInline(entry, { text });",
  "\t\t\t\tentry.lastText = text;",
  "\t\t\t\tentry.lastSource = text;",
  "\t\t\t\tentry.serviceText = true; // поздний итог (announce субагента) заменит служебный текст, а не допишется к нему",
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
  "// Финал: вернуть { inlineMessageId } если плейсхолдер уже стоит (нужна правка), иначе undefined (отвечать answerGuestQuery); таймер снимается.",
  "async function hotfixGuestAckClaimFinal(entry) {",
  "\tif (!entry) return;",
  "\tif (entry.state === \"armed\") { hotfixGuestAckClearTimers(entry); entry.state = \"claimed\"; return; }",
  "\tif (entry.inflight) await entry.inflight.catch(() => void 0);",
  "\tentry.claimed = true; // v3: новые heartbeat-правки не стартуют",
  "\tif (entry.progressTimer) { clearTimeout(entry.progressTimer); entry.progressTimer = void 0; }",
  "\tif (entry.progressInflight) await entry.progressInflight.catch(() => void 0); // v3: дождаться heartbeat в полёте, иначе он ляжет поверх финала",
  "\tif (entry.state === \"placeholder\" && entry.inlineMessageId) return { inlineMessageId: entry.inlineMessageId };",
  "\treturn;",
  "}",
  "// v3: source — исходный markdown финала (для пересборки документа при append), render — {richMessages, tableMode} из params доставки.",
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
  "// Дописать текст(ы) в уже отвеченное inline-сообщение (второй payload того же рана или поздний payload той же guest-сессии — announce субагента).",
  "// Служебный текст settle («Запрос обработан, но текстового ответа…» / «⚠️ …») заменяется, не дописывается. v3: документ = старый источник",
  "// (markdown, entry.lastSource) + новый итог, собирается hotfixGuestAckComposeDocument (лимит 4096 по итоговому тексту, обрезка по блокам,",
  "// приоритет у нового) и правится rich_message (если rich разрешён для entry и в блоках нет медиа); ошибка rich → повтор plain (plainText",
  "// страницы, без markdown-разметки). options: { linkPreview, richMessages, tableMode } — уточняют параметры рендера entry, если переданы.",
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
  "// Финал рана guest-сессии, доставляемый ядром (deliverAgentCommandResult: announce/settle-ход субагента, deliver:true) — порт",
  "// guest-announce-final-inline. Возвращает { delivered: true, inlineMessageId } либо { delivered: false, reason } (вызывающий дропает payload с логом).",
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
].join("\n");
// Guest-ветка deliverTextReply после каскадов telegram-guest-mode-delivery + guest-plain-delivery-normalize + guest-single-answer-guard (прод 9.7 байт-в-байт).
const GUEST_BRANCH_OLD = `\tif (params.guestQueryId) {
\t\tif (params.progress.guestAnswered) return;
\t\tconst guestReplyText = normalizeTelegramGuestPlainText(params.text);
\t\tconst guestChunks = filterEmptyTelegramTextChunks(params.chunkText(guestReplyText));
\t\tconst firstChunk = guestChunks[0];
\t\tconst useHtml = false;
\t\tconst fallbackText = normalizeTelegramGuestPlainText(firstChunk?.plainText ?? guestReplyText);
\t\tconst text = guestChunks.length > 1 ? \`\${fallbackText.trimEnd()}\\n\\n[Ответ обрезан из-за лимита Telegram guest mode.]\` : fallbackText;
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
// v1 ветки: append второго payload plain-текстом, MarkAnswered без источника. Остаётся для апгрейда v1 → v2 на пропатченном чанке.
const GUEST_BRANCH_V1 = `\tif (params.guestQueryId) {
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
\t\tconst text = guestChunks.length > 1 ? \`\${fallbackText.trimEnd()}\\n\\n[Ответ обрезан из-за лимита Telegram guest mode.]\` : fallbackText;
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
\t\t\t\tconst richResult = { type: "article", id: buildTelegramGuestResultId(), title: "Ответ", input_message_content: { rich_message: guestRichMessage }, ...params.replyMarkup ? { reply_markup: params.replyMarkup } : {} };
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
const GUEST_BRANCH_NEW = GUEST_BRANCH_V1_TO_V2.reduce((acc, [from, to]) => {
  if (acc.split(from).length !== 2) throw new Error(`guest-ack-edit: v1 branch template must contain exactly once: ${from}`);
  return acc.replace(from, to);
}, GUEST_BRANCH_V1);
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
  if (start === -1) return insertBefore(source, "async function deliverTextReply(params) {", REGISTRY, "guest-ack registry before deliverTextReply");
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
  const answer = src.indexOf("await sendTelegramGuestText(params.bot, params.guestQueryId, text", start);
  const send = src.indexOf("params.sender.sendText(", start);
  if (claim < 0 || answer < 0 || send < 0 || !(claim < answer && answer < send)) return "guest-ack claim must precede answerGuestQuery and sender.sendText in deliverTextReply";
  return null;
};
export const check = { gate: "required", assertions: [
  contains(MARK, "маркер guest-ack-edit"),
  contains(REGISTRY, "актуальный регион реестра целиком"),
  contains(GUEST_BRANCH_NEW, "guest-ветка deliverTextReply с правкой плейсхолдера"),
  contains(PLAN_NEW, "поздний append перед guard'ом guest-no-chat-fallback"),
  contains(FS_IMPORT, "import fs для файла правил"),
  contains(`const HOTFIX_GUEST_ACK_FILE = ${rulesFileExpression("OPENCLAW_HOTFIX_GUEST_ACK_FILE", "hotfix-guest-ack.json")};`, "rules file resolved from env / OpenClaw state dir (not hard-coded)"),
  (c) => /"\/[^"\n]*\/\.openclaw\/hotfix-guest-ack\.json"/.test(c) ? "unexpected hard-coded host-specific rules path" : null,
  contains("globalThis.__openclawHotfixGuestAck", "общий реестр на globalThis"),
  contains("input_message_content: { rich_message: guestRichMessage }", "rich-ответ гостю (InputRichMessageContent)"),
  notContains(GUEST_BRANCH_OLD, "старая guest-ветка без ack-edit"),
  notContains(GUEST_BRANCH_V1, "guest-ветка v1 (plain append без источника) не осталась"),
  // v3: rich append — конвейер документа и его зависимости в чанке
  contains("function hotfixGuestAckComposeDocument(entry, prevSource, addSource, linkPreview) {", "сборка объединённого документа гостя (v3)"),
  contains("function hotfixGuestAckSplitBlocks(markdown) {", "разбиение markdown на блоки для обрезки (v3)"),
  contains("rich append failed, retrying plain", "fallback rich → plain у append (v3)"),
  contains("planTelegramTextDeliveryPages({ text, maxChars: TELEGRAM_GUEST_TEXT_LIMIT,", "документ гостя строится planTelegramTextDeliveryPages (v3)"),
  contains("T as planTelegramTextDeliveryPages", "planTelegramTextDeliveryPages импортируется чанком из send-*"),
  contains("entry.lastSource = ", "реестр хранит markdown-источник документа (v3)"),
  contains("if (entry.progressInflight) await entry.progressInflight.catch(() => void 0); // v3: дождаться heartbeat в полёте", "claimFinal ждёт heartbeat в полёте (v3)"),
  // маркеры/строки, на которые опираются assertions соседних guest-портов, должны пережить перезапись ветки
  contains("params.progress.guestAnswered", "guard guestAnswered (telegram-guest-mode-delivery)"),
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
