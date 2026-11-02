// Portable OpenClaw 2026.10.9: guest-query-ownership-runtime.
// Source template; only stringified into the delivery bundle. Never called by apply/check.
export function installGuestQueryOwnership() {
  // hotfix: guest-query-ownership v1 — no latest-session fallback.
  const r = hotfixGuestAckRegistry;
  r.byRun ??= new Map();
  r.resolveOwner = (sessionKey, options = {}) => {
    const bound = options.runId ? r.byRun.get(options.runId) : void 0;
    if (options.runId && r.byRun.has(options.runId) && !bound) return;
    const queryId = options.guestQueryId ?? bound?.guestQueryId;
    if (!queryId || bound && (bound.sessionKey !== sessionKey || bound.guestQueryId !== queryId)) return;
    const entry = r.resolve(queryId);
    if (!entry || entry.sessionKey !== sessionKey || entry.expiresAt <= Date.now() || ["closed", "failed"].includes(entry.state)) return;
    return entry;
  };
  r.bindRun = (sessionKey, runId, guestQueryId) => {
    if (!runId || !guestQueryId || !r.resolveOwner(sessionKey, { guestQueryId })) return false;
    if (r.byRun.has(runId)) {
      const same = r.byRun.get(runId)?.guestQueryId === guestQueryId && r.byRun.get(runId)?.sessionKey === sessionKey;
      if (!same) r.byRun.set(runId, null);
      return same;
    }
    r.byRun.set(runId, { sessionKey, guestQueryId });
    return true;
  };
  r.bindBatch = (sessionKey, runId, sourceRunIds) => {
    if (!sessionKey?.includes(":guest:")) return false;
    const owners = sourceRunIds.map((id) => r.resolveOwner(sessionKey, { runId: id }));
    if (!owners.length || owners.some((owner) => !owner || owner !== owners[0])) {
      r.byRun.set(runId, null); // Mixed/unknown batches fail closed; never inherit latest query.
      return false;
    }
    return r.bindRun(sessionKey, runId, owners[0].guestQueryId);
  };
  r.deliverPayloads = async (sessionKey, payloads, options = {}) => {
    const entry = r.resolveOwner(sessionKey, options);
    if (!entry || !loadHotfixGuestAckRules().enabled) return { delivered: false, reason: "guest query ownership unavailable" };
    const run = async () => {
      if (r.resolveOwner(sessionKey, options) !== entry) return { delivered: false, reason: "guest query expired" };
      options.assertCurrent?.();
      const fingerprint = JSON.stringify(payloads);
      const key = options.runId ? options.runId + ":" + (options.kind ?? "final") : void 0;
      entry.deliveryReceipts ??= new Map();
      const cached = key && entry.deliveryReceipts.get(key);
      if (cached) return cached.fingerprint === fingerprint ? cached.result : { delivered: false, reason: "guest delivery key reused with different payload" };
      if (entry.inflight) await entry.inflight.catch(() => void 0);
      if (entry.state === "armed") { hotfixGuestAckClearTimers(entry); await hotfixGuestAckSendPlaceholder(entry); }
      if (entry.state === "placeholder") {
        await hotfixGuestAckClaimFinal(entry);
        hotfixGuestAckMarkAnswered(entry, entry.inlineMessageId, "", "", void 0);
      }
      if (entry.state !== "answered" || !entry.inlineMessageId) return { delivered: false, reason: "guest inline unavailable" };
      const seenMedia = new Set();
      const evidencePayloads = payloads.flatMap((p) => [
        ...(p?.text?.trim() ? [{ text: p.text }] : []),
        ...[...new Set([...(p?.mediaUrl ? [p.mediaUrl] : []), ...(p?.mediaUrls ?? [])])].filter((url) => !seenMedia.has(url) && seenMedia.add(url)).map((mediaUrl) => ({ mediaUrl, ...(p.forceDocument ? { forceDocument: true } : {}) }))
      ]);
      const receipt = { guestQueryId: entry.guestQueryId, inlineMessageId: entry.inlineMessageId, text: false, media: [] };
      const payloadOutcomes = [];
      let attempted = false, resultCount = 0, ambiguous = false, stopped = false;
      for (const [index, payload] of evidencePayloads.entries()) {
        let item, itemAttempted = false;
        if (stopped) item = { delivered: false, reason: "not attempted after prior failure" };
        else try {
          options.assertCurrent?.();
          if (payload.text) {
            attempted = true; itemAttempted = true;
            item = await r.appendBySession(sessionKey, [payload.text], { ...options, guestQueryId: entry.guestQueryId });
            if (!item?.delivered) item = { ...item, attempted: true, ambiguous: true };
          } else item = await r.stageAndAttachMedia(sessionKey, { path: payload.mediaUrl, guestQueryId: entry.guestQueryId, runId: options.runId, assertCurrent: options.assertCurrent, forceDocument: payload.forceDocument });
        } catch (error) {
          item = { delivered: false, reason: String(error), attempted: itemAttempted, ambiguous: itemAttempted };
        }
        attempted ||= item?.attempted === true || item?.delivered === true;
        ambiguous ||= item?.ambiguous === true;
        if (payload.text) receipt.text ||= item?.delivered === true;
        else receipt.media.push(item);
        if (item?.delivered) {
          resultCount++;
          payloadOutcomes.push({ index, status: "sent", resultCount: 1 });
        } else {
          stopped = true;
          payloadOutcomes.push({ index, status: "failed", error: item?.reason ?? "guest delivery incomplete", sentBeforeError: item?.ambiguous === true, stage: item?.attempted ? "send" : "preparation" });
        }
      }
      const delivered = evidencePayloads.length > 0 && payloadOutcomes.every((p) => p.status === "sent");
      const reason = delivered ? "guest_inline_receipt" : payloadOutcomes.find((p) => p.status === "failed")?.error ?? "no guest payload";
      const result = { delivered, receipt, evidencePayloads, payloadOutcomes, attempted, ambiguous, resultCount, inlineMessageId: entry.inlineMessageId, reason, partial: !delivered && resultCount > 0 };
      // Partial/ambiguous delivery also holds custody: never blindly upload again.
      if (key) entry.deliveryReceipts.set(key, { fingerprint, result });
      if (delivered) { entry.settled = true; hotfixGuestAckClearTimers(entry); }
      return result;
    };
    const current = (entry.deliveryQueue ?? Promise.resolve()).catch(() => void 0).then(run);
    entry.deliveryQueue = current;
    try { return await current; } finally { if (entry.deliveryQueue === current) entry.deliveryQueue = void 0; }
  };
  r.deliveryStatus = (result, payloads = []) => ({
    requested: true, attempted: result?.attempted === true,
    status: result?.delivered ? "sent" : result?.partial ? "partial_failed" : "failed",
    succeeded: result?.delivered === true ? true : result?.partial ? "partial" : false,
    resultCount: result?.resultCount ?? 0,
    ...(result?.delivered ? { reason: "guest_inline_receipt" } : { error: true, errorMessage: result?.reason ?? "guest inline unavailable", reason: "guest_inline_failed" }),
    ...(result?.partial || result?.ambiguous ? { sentBeforeError: true } : {}),
    payloadOutcomes: result?.payloadOutcomes ?? payloads.map((_, index) => ({ index, status: "failed", error: result?.reason ?? "guest ownership unavailable", sentBeforeError: false, stage: "preparation" }))
  });

}
