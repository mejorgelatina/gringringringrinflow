import type { AgentRun } from "../agent/types.ts";
import type { RegistryStore } from "../registry/store.ts";
import type { Notice } from "../registry/types.ts";
import { deliverNotices, planApprovalNotices, type Outbound } from "./notify.ts";

/**
 * After an operator approves a run: tell the donor (if the run came from a chat) and the destination (if it is a
 * registered organization that opted in), keep each notice in the outbox, and mark the inbox row approved.
 */
export async function notifyApproval(run: AgentRun, store: RegistryStore, out: Outbound, baseUrl: string | null, now = new Date()): Promise<Notice[]> {
  if (run.status !== "approved" || !run.proposal) return [];
  const link = await store.getRunLink(run.code);
  const receiver = await store.getRegistration(run.proposal.recipientId);
  const drafts = planApprovalNotices(run, link, receiver, baseUrl, now);
  const notices = await deliverNotices(drafts, out, { store, optIn: (d) => d.audience !== "receiver" || Boolean(receiver?.whatsappOptIn) });
  if (link) {
    const row = await store.getInbox(link.inboxId);
    if (row) await store.addInbox({ ...row, runCode: run.code, runStatus: run.status });
  }
  return notices;
}
