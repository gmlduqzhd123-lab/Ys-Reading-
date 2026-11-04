import { projectRef } from "./operator-vault.mjs";
export function privacyCheckpoint(value, now = Date.now()) {
  if (
    value?.projectRef !== projectRef ||
    value?.checkpoint?.format !== "bookforest-privacy-checkpoint" ||
    value.checkpoint.version !== 1
  )
    throw Error("PRIVACY_CHECKPOINT_INVALID");
  const at = Date.parse(value.checkpoint.capturedAt);
  if (!Number.isFinite(at) || now - at > 24 * 3600000 || at > now + 60000)
    throw Error("FRESH_PRIVACY_CHECKPOINT_REQUIRED");
  for (const name of [
    "profiles",
    "enrollments",
    "deleted",
    "removedEnrollments",
    "deletions",
  ])
    if (
      !Array.isArray(value.checkpoint[name]) ||
      value.checkpoint[name].length > 100000
    )
      throw Error("PRIVACY_CHECKPOINT_INVALID");
  return value.checkpoint;
}
export async function applyPrivacyCheckpoint(db, value, backupAt) {
  const checkpoint = privacyCheckpoint(value);
  await db.exec("update private.recovery_state set held=true");
  return (
    await db.query("select private.recovery_apply_checkpoint($1::jsonb) v", [
      JSON.stringify({ ...checkpoint, backupAt }),
    ])
  ).rows[0].v;
}
