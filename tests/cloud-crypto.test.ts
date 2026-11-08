import {it,expect} from "vitest";
import {randomBytes} from "node:crypto";
import {cloudKey} from "../scripts/lib/cloud-key.mjs";
import {encryptCloud,decryptCloud} from "../supabase/functions/_shared/cloud-crypto.mjs";
it("reopens cloud ciphertext using the existing recovery key, detects tamper and wrong key",async()=>{
 const key=randomBytes(32),recipient=cloudKey(key),value={snapshot:{private:"한글 복구 자료"}};
 const raw=JSON.stringify(await encryptCloud(value,recipient.publicKey));
 expect(raw).not.toContain("한글");expect(await decryptCloud(raw,cloudKey(key).privateJwk)).toEqual(value);
 await expect(decryptCloud(raw,cloudKey(randomBytes(32)).privateJwk)).rejects.toThrow("INTEGRITY");
 const altered=JSON.parse(raw);altered.projectRef="x".repeat(20);await expect(decryptCloud(JSON.stringify(altered),recipient.privateJwk)).rejects.toThrow("INTEGRITY");
 const second=JSON.stringify(await encryptCloud(value,recipient.publicKey));expect(second).not.toEqual(raw);
});
