import { z } from "zod";

const lifetime = 15 * 60 * 1000;
export const exportSelectionLimit = 100;
const snapshot = z.object({
  kind: z.enum(["reading", "writing"]),
  title: z.string().max(100),
  ids: z.array(z.uuid()).max(exportSelectionLimit),
  savedAt: z.number().int(),
}).strict();

export function exportSelectionKey(owner: string, classroom: string, page: number) {
  return `bookforest:google-export:${owner}:${classroom}:${page}`;
}

export function readExportSelection(raw: string | null, now: number) {
  if (!raw) return null;
  try {
    const parsed = snapshot.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.savedAt > now || now - parsed.data.savedAt > lifetime) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
