// Shared text of the guest branch of the sub-agent completion instruction (modules guest-announce-final-text-instruction
// and guest-announce-final-text-settle-wake). Not a patch module (no patch/target) — not part of the plan.
// HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION replaces the upstream SUBAGENT_PRIVATE_COMPLETION_INSTRUCTION ("Process this
// result privately … Your final reply stays internal … send it through a messaging tool … Reply ONLY: NO_REPLY") for a
// guest requester with completionTarget "parent" (private completion): a guest turn has no message tool in completion
// turns (guest-deny-delivery-tools), and the final of a private completion turn is appended to the guest's inline message
// (guest-announce-final-inline), so "stays internal"/NO_REPLY would contradict the fix.
// The constant line is JS source with ${SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION}: the identifier exists in both target chunks (upstream import).
export const HOTFIX_GUEST_ANNOUNCE_INSTRUCTION = "[Telegram Guest Mode] The requester is a Telegram guest session: reply with the final user-facing text itself — it is delivered automatically into the guest's inline message (edited in place or appended; one message, 4096 characters max, so keep it concise and complete, without a path-only first line). Do NOT use the message tool or any other messaging/delivery tool for this result (it is unavailable here; a message sent anywhere else would land in the wrong chat), and do not answer with the silent token while the result has not been shown to the guest yet.";
export const HOTFIX_GUEST_ANNOUNCE_CONST_LINE = `const HOTFIX_GUEST_ANNOUNCE_INSTRUCTION = ${JSON.stringify(HOTFIX_GUEST_ANNOUNCE_INSTRUCTION)};\n`;
export const HOTFIX_GUEST_PRIVATE_COMPLETION_PREFIX = "Process this result for the Telegram guest who requested it.";
export const HOTFIX_GUEST_PRIVATE_COMPLETION_SUFFIX = "Your final reply IS the guest-facing update: it is delivered automatically into the guest's inline message (private completion, no channel delivery), so write the complete result there and do not answer with the silent token unless the guest has already received this exact result.";
export const HOTFIX_GUEST_PRIVATE_COMPLETION_CONST_LINE = `const HOTFIX_GUEST_PRIVATE_COMPLETION_INSTRUCTION = \`${HOTFIX_GUEST_PRIVATE_COMPLETION_PREFIX} \${SUBAGENT_COMPLETION_OUTCOME_INSTRUCTION} ${HOTFIX_GUEST_PRIVATE_COMPLETION_SUFFIX}\`;\n`;
