// Minimal foreign-kit layouts, applied to the real pristine bundles. No cross-repo CI dependency.
import assert from "node:assert/strict";
import vm from "node:vm";
import { Corpus, walkJs } from "../lib/kit.mjs";
import * as delivery from "../modules/telegram-guest-mode-delivery.mjs";
import * as fileIds from "../modules/telegram-sent-media-file-ids.mjs";

const dist = process.argv[2];
if (!dist) throw new Error("Pass the dist directory of a disposable pristine package");
const corpus = new Corpus(walkJs(dist));
const deliverySource = corpus.read(corpus.locate(delivery.target));
const branch = "\t\t\tif (mediaList.length === 0 && resolvedReplyText)";
assert.equal(deliverySource.split(branch).length, 2);
// Rich-media wraps the original text/media branch in `} else if (...)`.
const withRichBranch = deliverySource.replace(branch, "\t\t\tif (false) {\n\t\t\t} else " + branch.trimStart());
const patchedDelivery = delivery.patch(withRichBranch);
assert.ok(patchedDelivery.includes("} else if (mediaList.length === 0 && resolvedReplyText || params.guestQueryId)"));
assert.equal(delivery.patch(patchedDelivery), patchedDelivery);
for (const check of delivery.check.assertions) assert.equal(check(patchedDelivery), null);

// The 11.1 rich sender returns acceptedParams inline after finally; 10.9 used a const.
const richSender = `
async function fixtureRichSend(sent) {
      const attached = { ids: ["synthetic"] };
      const config = { chatId: 10 };
      const markup = {};
      try {
      } finally {
       releaseTelegramRichLocalMedia(attached.ids);
      }
      return { ...sent, acceptedParams: { ...sent.acceptedParams, ...markup } };
}
`.replace(/^ +/gm, spaces => "\t".repeat(spaces.length));
const sendSource = corpus.read(corpus.locate(fileIds.target));
const richFirst = fileIds.patch(sendSource + richSender);
const guestFirst = fileIds.patch(fileIds.patch(sendSource) + richSender);
assert.equal(guestFirst, richFirst, "reapplying guest after rich must add the same recording hook");
assert.equal(fileIds.patch(richFirst), richFirst);
for (const check of fileIds.check.assertions) assert.equal(check(richFirst), null);

const helperStart = richFirst.indexOf("//#region hotfix: telegram-sent-media-file-ids");
const helperEnd = richFirst.indexOf("//#endregion", helperStart);
const box = vm.createContext({ releaseTelegramRichLocalMedia() {}, logVerbose() {}, formatErrorMessage: String });
vm.runInContext(richFirst.slice(helperStart, helperEnd) + richFirst.slice(richFirst.indexOf("async function fixtureRichSend(")), box);
const sent = { result: { chat: { id: 10 }, message_id: 20, rich_message: { blocks: [{ type: "photo", photo: [{ file_id: "synthetic-file-id" }] }] } }, acceptedParams: {} };
await box.fixtureRichSend(sent);
assert.equal(box.__openclawHotfixTelegramSentMedia.get("10:20").fileId, "synthetic-file-id");
console.log(JSON.stringify({ ok: true, richElseIf: true, richInlineReturn: true, guestReapplyRepairsHook: true, recordedFileId: true, networkCalls: 0 }));
