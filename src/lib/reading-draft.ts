import { z } from "zod";
export const thoughtMemoSchema = z
  .object({
    mode: z.enum(["line", "guided", "free"]),
    scene: z.string().max(2000),
    feeling: z.string().max(1000),
    idea: z.string().max(2000),
  })
  .strict();
export const readingDraftPayload = z
  .object({
    title: z.string().max(200),
    author: z.string().max(200),
    publisher: z.string().max(200),
    isbn: z.string().max(40),
    thumbnail: z.string().max(1000),
    readOn: z.iso.date(),
    status: z.enum(["reading", "completed"]),
    thought: z.string().max(10000),
    question: z.string().max(2000),
    guidance: z
      .string()
      .max(16000)
      .refine((v) => {
        try {
          return thoughtMemoSchema.safeParse(JSON.parse(v)).success;
        } catch {
          return false;
        }
      }),
  })
  .strict();
export type ReadingDraftPayload = z.infer<typeof readingDraftPayload>;
export const readingDraftCommand = z
  .object({
    owner:z.uuid(),
    action: z.enum(["load", "save", "discard"]),
    classroom: z.uuid(),
    record: z.uuid().nullable(),
    payload: readingDraftPayload.optional(),
    revision: z.number().int().min(0).default(0),
    request: z.uuid().optional(),
  })
  .strict();
export function readLocalReadingDraft(
  raw: string | null,
  user: string,
  context: string,
  now = Date.now(),
) {
  try {
    const p = JSON.parse(raw ?? "null");
    if (
      p?.user !== user ||
      p.context !== context ||
      !Number.isFinite(p.at) ||
      p.at > now ||
      now - p.at >= 86400000
    )
      return null;
    return readingDraftPayload.parse(p.value);
  } catch {
    return null;
  }
}
