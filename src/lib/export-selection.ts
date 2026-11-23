import { z } from "zod";

const lifetime = 15 * 60 * 1000;
const snapshot = z.object({
  kind: z.enum(["reading", "writing"]),
  title: z.string().max(100),
  ids: z.array(z.uuid()).max(100),
  savedAt: z.number().int(),
}).strict();
export type ExportSelection = z.infer<typeof snapshot>;

export function exportSelectionKey(owner: string, classroom: string, page: number) {
  return `bookforest:google-export:${owner}:${classroom}:${page}`;
}

export function readExportSelection(raw: string | null, now: number, allowed: Record<ExportSelection["kind"], Set<string>>) {
  if (!raw) return null;
  try {
    const parsed = snapshot.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.savedAt > now || now - parsed.data.savedAt > lifetime) return null;
    const ids = [...new Set(parsed.data.ids)].filter(id => allowed[parsed.data.kind].has(id));
    return { ...parsed.data, ids, omitted: ids.length !== parsed.data.ids.length };
  } catch {
    return null;
  }
}
