// Module subagent-inherit-owner-scope.callsite (createOpenClawTools bundle). Paired with
// subagent-inherit-owner-scope (sessions_spawn tool bundle).
// createOpenClawTools already receives options.senderIsOwner and forwards it to the message, nodes and
// sessions tools, but not to createSessionsSpawnTool. This module forwards it, so the sessions_spawn tool
// can launch a child run with operator.admin scopes when the parent run belongs to the owner (see the
// paired module). Without the pair, every sub-agent spawned from a guest turn of the owner (and from any
// other owner session) runs as a non-owner and is denied the owner-only core tools (nodes, computer,
// mobile_ui, sessions, terminal, portal, conversations_*, openclaw, screen).
import { replaceOnce, contains, countExactly, countAtLeast } from "../lib/patch-helpers.mjs";
export const label = "subagent-inherit-owner-scope.callsite";
export const target = {
  key: "openclawTools",
  label: "createOpenClawTools bundle (createSessionsSpawnTool call site)",
  // Needles describe code the module keeps intact (the call-site anchor itself is rewritten).
  needles: [
    "[createSessionsSpawnTool({",
    "\t\t\tswarmCollector: options?.swarmCollector,\n\t\t\tworkspaceDir: spawnWorkspaceDir,\n",
  ],
};
const MARK = "hotfix: subagent-inherit-owner-scope.callsite";
const BEFORE = "\t\t\trequesterRunId: options?.runId,\n\t\t\tswarmCollector: options?.swarmCollector,\n";
const LINE = `\t\t\tsenderIsOwner: options?.senderIsOwner, // ${MARK}\n`;
const AFTER = `\t\t\trequesterRunId: options?.runId,\n${LINE}\t\t\tswarmCollector: options?.swarmCollector,\n`;
export function patch(source) {
  if (source.includes(MARK)) return source;
  return replaceOnce(source, BEFORE, AFTER, "sessions_spawn call site (anchor 'requesterRunId: options?.runId, swarmCollector: options?.swarmCollector,' not found in createOpenClawTools)");
}
export const check = { assertions: [
  contains(MARK, "sessions_spawn call-site marker"),
  contains(AFTER, "senderIsOwner passed into createSessionsSpawnTool"),
  countExactly(LINE, 1, "sessions_spawn call-site line"),
  // drift: options.senderIsOwner must still be a real option of createOpenClawTools (other tools read it too)
  countAtLeast("senderIsOwner: options?.senderIsOwner", 2, "options.senderIsOwner consumers besides the hotfix line (did createOpenClawTools stop receiving senderIsOwner?)"),
] };
