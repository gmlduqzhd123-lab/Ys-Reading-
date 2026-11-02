import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { projectRef } from "./operator-vault.mjs";
const aad = Buffer.from("bookforest-recovery-key-v1:" + projectRef);
const derive = (p, s) =>
  scryptSync(p, s, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
export function wrapRecoveryKey(key, passphrase) {
  if (
    key.length !== 32 ||
    typeof passphrase !== "string" ||
    passphrase.length < 20 ||
    passphrase.length > 1024
  )
    throw Error("RECOVERY_PASSPHRASE_REQUIRED");
  const salt = randomBytes(16),
    iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", derive(passphrase, salt), iv);
  c.setAAD(aad);
  const data = Buffer.concat([c.update(key), c.final()]);
  return JSON.stringify({
    format: "bookforest-recovery-key",
    version: 1,
    projectRef,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}
export function unwrapRecoveryKey(text, passphrase) {
  try {
    if (text.length > 6000) throw Error();
    const v = JSON.parse(text);
    if (
      v.format !== "bookforest-recovery-key" ||
      v.version !== 1 ||
      v.projectRef !== projectRef
    )
      throw Error();
    const salt = Buffer.from(v.salt, "base64"),
      iv = Buffer.from(v.iv, "base64"),
      tag = Buffer.from(v.tag, "base64"),
      data = Buffer.from(v.data, "base64");
    if (
      salt.length !== 16 ||
      iv.length !== 12 ||
      tag.length !== 16 ||
      data.length !== 32 ||
      typeof passphrase !== "string" ||
      passphrase.length > 1024
    )
      throw Error();
    const d = createDecipheriv("aes-256-gcm", derive(passphrase, salt), iv);
    d.setAAD(aad);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]);
  } catch {
    throw Error("RECOVERY_KEY_INTEGRITY_FAILED");
  }
}
