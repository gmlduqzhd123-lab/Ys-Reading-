import { z } from "zod";
const prefix = "bookforest.recovery.v1:";
const schema = z
  .object({
    version: z.literal(1),
    userId: z.uuid(),
    assignmentId: z.uuid(),
    revision: z.number().int().min(0),
    savedAt: z.number().finite(),
    title: z.string().max(100),
    body: z.string().max(10000),
  })
  .strict();
export type RecoveryDraft = z.infer<typeof schema>;
export const recoveryKey = (user: string, assignment: string) =>
  prefix + user + ":" + assignment;
export function readRecovery(
  raw: string | null,
  userId: string,
  assignmentId: string,
  now = Date.now(),
): RecoveryDraft | null {
  try {
    if (!raw || raw.length > 80000) return null;
    const p = schema.safeParse(JSON.parse(raw));
    return p.success &&
      p.data.userId === userId &&
      p.data.assignmentId === assignmentId &&
      p.data.savedAt <= now &&
      now - p.data.savedAt < 86400000
      ? p.data
      : null;
  } catch {
    return null;
  }
}
export function clearDraftRecovery() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(prefix)) sessionStorage.removeItem(k);
    }
  } catch {
    /* Storage may be blocked. */
  }
}
export function notifyDraftLogout() {
  clearDraftRecovery();
  try {
    const channel = new BroadcastChannel("bookforest-draft-privacy");
    channel.postMessage("logout");
    channel.close();
  } catch {
    /* Other tabs also clear on their next login screen. */
  }
}
