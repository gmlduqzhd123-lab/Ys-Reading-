import { createECDH, hkdfSync } from "node:crypto";
// A separate ECDH key is derived from the already wrapped recovery key. Existing
// recovery kits can decrypt cloud archives without exporting a new private key.
export function cloudKey(key) {
  if (key.length !== 32) throw Error("BACKUP_KEY_INVALID");
  const ec = createECDH("prime256v1");
  ec.setPrivateKey(
    Buffer.from(
      hkdfSync(
        "sha256",
        key,
        Buffer.from("bookforest-cloud-recovery-v1"),
        Buffer.from("P-256"),
        32,
      ),
    ),
  );
  const pub = ec.getPublicKey();
  return {
    publicKey: pub.toString("base64"),
    privateJwk: {
      kty: "EC",
      crv: "P-256",
      x: pub.subarray(1, 33).toString("base64url"),
      y: pub.subarray(33).toString("base64url"),
      d: ec.getPrivateKey().toString("base64url"),
      ext: true,
    },
  };
}
