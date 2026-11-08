import { projectRef } from "./operator-vault.mjs";
export const recoveryEnvNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "GOOGLE_DRIVE_CLIENT_ID",
  "GOOGLE_DRIVE_CLIENT_SECRET",
  "GOOGLE_TOKEN_ENCRYPTION_KEY",
  "GOOGLE_AUTH_ENABLED",
  "GOOGLE_BOOKS_API_KEY",
  "ALADIN_TTB_KEY",
  "KAKAO_BOOK_REST_KEY",
  "BOOKFOREST_LIMITER_SECRET",
];
export function recoverySettings(env) {
  const values = Object.fromEntries(
    recoveryEnvNames
      .filter((k) => typeof env[k] === "string" && env[k])
      .map((k) => [k, env[k]]),
  );
  return {
    format: "bookforest-recovery-settings",
    version: 1,
    projectRef,
    source: "operator-local-config",
    exportedAt: new Date().toISOString(),
    values,
  };
}
export function targetRecoverySettings(bundle, target) {
  if (
    bundle?.format !== "bookforest-recovery-settings" ||
    bundle.version !== 1 ||
    bundle.projectRef !== projectRef
  )
    throw Error("SETTINGS_FORMAT_INVALID");
  if (
    !/^[a-z0-9]{20}$/.test(target?.projectRef ?? "") ||
    target.projectRef === projectRef
  )
    throw Error("INDEPENDENT_TARGET_REQUIRED");
  let url;
  try {
    url = new URL(target.appUrl);
  } catch {
    throw Error("TARGET_HTTPS_REQUIRED");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    url.hostname === "reading-blush-zeta.vercel.app"
  )
    throw Error("TARGET_HTTPS_REQUIRED");
  let role;
  try {
    role = JSON.parse(
      Buffer.from(target.publishableKey.split(".")[1], "base64url").toString(),
    ).role;
  } catch {}
  if (
    !(target.publishableKey?.startsWith("sb_publishable_") || role === "anon")
  )
    throw Error("TARGET_PUBLIC_KEY_REQUIRED");
  const values = Object.fromEntries(
    recoveryEnvNames
      .filter((k) => typeof bundle.values?.[k] === "string")
      .map((k) => [k, bundle.values[k]]),
  );
  values.NEXT_PUBLIC_SUPABASE_URL = `https://${target.projectRef}.supabase.co`;
  values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = target.publishableKey;
  values.NEXT_PUBLIC_APP_URL = url.origin;
  return values;
}
