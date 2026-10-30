import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export function seal(value: unknown, key: Buffer, purpose: string) {
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function unseal<T>(text: string, key: Buffer, purpose: string): T {
  const bytes = Buffer.from(text, "base64url");
  if (key.length !== 32 || bytes.length < 29)
    throw new Error("Invalid encrypted state");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  ) as T;
}
