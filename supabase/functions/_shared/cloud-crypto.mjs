const context = new TextEncoder().encode(
  "bookforest-cloud-backup-v1:rbtqtkjnqtcnljvabisa",
);
const b64 = (bytes) => {
  let s = "";
  for (const x of new Uint8Array(bytes)) s += String.fromCharCode(x);
  return btoa(s);
};
const bytes = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
async function aes(secret, salt) {
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: context },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptCloud(value, publicKey) {
  const recipient = await crypto.subtle.importKey(
    "raw",
    bytes(publicKey),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const salt = crypto.getRandomValues(new Uint8Array(32)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const secret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipient },
    ephemeral.privateKey,
    256,
  );
  const key = await aes(secret, salt),
    plain = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: context },
    key,
    plain,
  );
  // Reopening the exact uploaded bytes is performed by the worker before receipt.
  return {
    format: "bookforest-cloud-vault",
    version: 1,
    projectRef: "rbtqtkjnqtcnljvabisa",
    ephemeral: b64(await crypto.subtle.exportKey("raw", ephemeral.publicKey)),
    salt: b64(salt),
    iv: b64(iv),
    data: b64(encrypted),
  };
}
export async function decryptCloud(raw, privateJwk) {
  try {
    if (typeof raw !== "string" || raw.length > 64000000) throw Error();
    const v = JSON.parse(raw);
    if (
      v.format !== "bookforest-cloud-vault" ||
      v.version !== 1 ||
      v.projectRef !== "rbtqtkjnqtcnljvabisa" ||
      bytes(v.iv).length !== 12 ||
      bytes(v.salt).length !== 32
    )
      throw Error();
    const own = await crypto.subtle.importKey(
        "jwk",
        privateJwk,
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveBits"],
      ),
      pub = await crypto.subtle.importKey(
        "raw",
        bytes(v.ephemeral),
        { name: "ECDH", namedCurve: "P-256" },
        false,
        [],
      );
    const secret = await crypto.subtle.deriveBits(
        { name: "ECDH", public: pub },
        own,
        256,
      ),
      key = await aes(secret, bytes(v.salt));
    return JSON.parse(
      new TextDecoder().decode(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: bytes(v.iv), additionalData: context },
          key,
          bytes(v.data),
        ),
      ),
    );
  } catch {
    throw Error("CLOUD_BACKUP_INTEGRITY_FAILED");
  }
}
