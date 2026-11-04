import { z } from "zod";
const progress = z
  .object({
    version: z.literal(1),
    user: z.uuid(),
    classroom: z.uuid(),
    step: z.number().int().min(1).max(4),
    savedAt: z.number().finite(),
  })
  .strict();
export function readStartProgress(
  raw: string | null,
  user: string,
  classes: string[],
  now = Date.now(),
) {
  try {
    const p = progress.parse(JSON.parse(raw ?? ""));
    if (
      p.user !== user ||
      !classes.includes(p.classroom) ||
      p.savedAt > now + 60000 ||
      now - p.savedAt > 86400000
    )
      return null;
    return { ...p, step: Math.min(p.step, 2) };
  } catch {
    return null;
  }
}
