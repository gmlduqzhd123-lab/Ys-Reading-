import { z } from "zod";
const record = z.object({
  kind: z.enum(["reading", "writing", "draft"]),
  id: z.uuid(),
  classroom_id: z.uuid(),
  student_id: z.uuid(),
  student_name: z.string().max(100),
  title: z.string().max(300),
  body: z.string().max(10000),
  question: z.string().max(2000),
  recorded_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.string().max(30),
  version: z.number().int().min(0),
  activity: z.string().max(1000),
  assignment_id: z.uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  verified: z.boolean(),
});
const schema = z
  .object({
    format: z.literal("bookforest-learning-archive"),
    version: z.literal(1),
    createdAt: z.iso.datetime({ offset: true }),
    classroom: z.object({ id: z.uuid(), name: z.string().min(1).max(150) }),
    records: z.array(record).max(20000),
  })
  .strict()
  .refine(
    (v) => v.records.every((r) => r.classroom_id === v.classroom.id),
    "학급이 다른 기록이 포함돼 있어요.",
  )
  .refine(
    (v) =>
      new Set(v.records.map((r) => r.kind + ":" + r.id)).size ===
      v.records.length,
    "중복 기록이 있어요.",
  );
export type LearningArchive = z.infer<typeof schema>;
export function parseArchive(raw: unknown) {
  return schema.parse(raw);
}
function base64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function bytes(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
const aad = new TextEncoder().encode("bookforest-encrypted-archive-v1");
async function derive(password: string, salt: Uint8Array, usage: KeyUsage[]) {
  if (password.length < 12 || password.length > 200)
    throw Error("보관 암호는 12~200자로 입력해 주세요.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 210000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usage,
  );
}
export async function sealArchive(value: unknown, password: string) {
  const archive = parseArchive(value),
    raw = new TextEncoder().encode(JSON.stringify(archive));
  if (raw.length > 8000000) throw Error("기록 파일이 너무 커요.");
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    key = await derive(password, salt, ["encrypt"]),
    cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      key,
      raw,
    );
  return JSON.stringify({
    format: "bookforest-encrypted-archive",
    version: 1,
    salt: base64(salt),
    iv: base64(iv),
    data: base64(new Uint8Array(cipher)),
  });
}
export async function openArchive(text: string, password: string) {
  if (text.length > 11000000) throw Error("파일 크기를 확인해 주세요.");
  try {
    const e = z
      .object({
        format: z.literal("bookforest-encrypted-archive"),
        version: z.literal(1),
        salt: z.string().length(24),
        iv: z.string().length(16),
        data: z.string().max(11000000),
      })
      .strict()
      .parse(JSON.parse(text));
    const salt = bytes(e.salt),
      iv = bytes(e.iv);
    if (salt.length !== 16 || iv.length !== 12) throw Error();
    const key = await derive(password, salt, ["decrypt"]),
      raw = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad },
        key,
        bytes(e.data) as BufferSource,
      );
    return parseArchive(JSON.parse(new TextDecoder().decode(raw)));
  } catch {
    throw Error(
      "파일 또는 보관 암호가 맞지 않아요. 원본 파일과 암호를 확인해 주세요.",
    );
  }
}
