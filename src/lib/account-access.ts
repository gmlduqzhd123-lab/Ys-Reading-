import { z } from "zod";
export function accountReady<
  T extends {
    account_active?: boolean;
    must_change_password?: boolean;
    session_fresh?: boolean;
  },
>(profile: T | null | undefined): profile is T {
  return Boolean(
    profile &&
      profile.account_active !== false &&
      !profile.must_change_password &&
      profile.session_fresh !== false,
  );
}
export const teacherEmail = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase())
  .refine(
    (v) => !v.endsWith("@students.bookforest.invalid"),
    "TEACHER_EMAIL_REQUIRED",
  );
export function teacherCallbackUrl(origin: string | undefined) {
  if (!origin) throw new Error("APP_URL_REQUIRED");
  const url = new URL(origin);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (!(
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.protocol === "http:"
    ) &&
      url.protocol !== "https:")
  )
    throw new Error("APP_URL_INVALID");
  return new URL("/auth/callback", url.origin).toString();
}
