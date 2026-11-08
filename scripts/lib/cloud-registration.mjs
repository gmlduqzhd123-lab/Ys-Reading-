import { createHash } from "node:crypto";
export const publicFingerprint = key => createHash("sha256").update(key).digest("hex");
export function registrationDecision(existing, next, rotation) {
  if (!existing || existing === next) return "register";
  if (rotation?.previous !== existing || rotation?.confirmed !== publicFingerprint(existing) || rotation?.restored !== true || rotation?.retained !== true)
    throw Error("RECOVERY_KEY_ROTATION_REQUIRED");
  return "rotate";
}
