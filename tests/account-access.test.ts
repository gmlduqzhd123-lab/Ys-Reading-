import { describe, it, expect, beforeEach, vi } from "vitest";
import { teacherCallbackUrl, teacherEmail } from "../src/lib/account-access";
const state = vi.hoisted(() => ({
  configured: true,
  otp: vi.fn(),
  exchange: vi.fn(),
  user: vi.fn(),
  rpc: vi.fn(),
  oauth: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => state.configured,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithOtp: state.otp,
      exchangeCodeForSession: state.exchange,
      getUser: state.user,
      signInWithOAuth: state.oauth,
    },
    rpc: state.rpc,
  }),
}));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));
import {
  sendTeacherLoginLink,
  startTeacherGoogleLogin,
} from "../src/app/auth/actions";
import { GET } from "../src/app/auth/callback/route";
import { NextRequest } from "next/server";
beforeEach(() => {
  vi.clearAllMocks();
  state.configured = true;
  process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3086";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.GOOGLE_AUTH_ENABLED = "true";
  state.oauth.mockResolvedValue({
    data: {
      url: "https://project.supabase.co/auth/v1/authorize?provider=google",
    },
    error: null,
  });
  state.redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT_TEST");
  });
  state.otp.mockResolvedValue({ error: null });
  state.exchange.mockResolvedValue({ error: null });
  state.user.mockResolvedValue({
    data: { user: { id: "verified" } },
    error: null,
  });
  state.rpc.mockResolvedValue({ error: null, data: { claimed: true } });
});
describe("teacher email entry and callback", () => {
  it("starts Google sign-in through the configured Supabase project and fixed callback", async () => {
    await expect(startTeacherGoogleLogin()).rejects.toThrow(
      "NEXT_REDIRECT_TEST",
    );
    expect(state.oauth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://127.0.0.1:3086/auth/callback",
        queryParams: { prompt: "select_account" },
        skipBrowserRedirect: true,
      },
    });
    expect(state.redirect).toHaveBeenCalledWith(
      "https://project.supabase.co/auth/v1/authorize?provider=google",
    );
  });
  it("does not advertise a provider before setup is enabled", async () => {
    process.env.GOOGLE_AUTH_ENABLED = "false";
    expect((await startTeacherGoogleLogin())?.ok).toBe(false);
    expect(state.oauth).not.toHaveBeenCalled();
  });
  it("rejects a substituted Google sign-in host", async () => {
    state.oauth.mockResolvedValue({
      data: { url: "https://untrusted.invalid/auth/v1/authorize" },
      error: null,
    });
    expect((await startTeacherGoogleLogin())?.ok).toBe(false);
    expect(state.redirect).not.toHaveBeenCalled();
  });
  it("reports provider errors without redirecting or claiming a login", async () => {
    state.oauth.mockResolvedValue({
      data: { url: null },
      error: { message: "private" },
    });
    expect((await startTeacherGoogleLogin())?.ok).toBe(false);
    expect(state.redirect).not.toHaveBeenCalled();
  });
  it("accepts real adult email and rejects internal student IDs", () => {
    expect(teacherEmail.parse("TEACHER@example.com")).toBe(
      "teacher@example.com",
    );
    expect(() =>
      teacherEmail.parse("student@students.bookforest.invalid"),
    ).toThrow();
  });
  it.each([
    undefined,
    "http://school.example.com",
    "https://user:secret@example.com",
    "javascript:alert(1)",
    "https://example.com?next=other",
  ])("rejects unsafe configured callback origin %s", (origin) => {
    expect(() => teacherCallbackUrl(origin)).toThrow();
  });
  it("fixes callback path and allows loopback development", () => {
    expect(teacherCallbackUrl("http://127.0.0.1:3086")).toBe(
      "http://127.0.0.1:3086/auth/callback",
    );
    expect(teacherCallbackUrl("https://school.example.com")).toBe(
      "https://school.example.com/auth/callback",
    );
  });
  it("does not send mail for unconfigured service or student aliases", async () => {
    let form = new FormData();
    form.set("email", "student@students.bookforest.invalid");
    expect((await sendTeacherLoginLink(form)).ok).toBe(false);
    state.configured = false;
    form.set("email", "teacher@example.com");
    expect((await sendTeacherLoginLink(form)).ok).toBe(false);
    expect(state.otp).not.toHaveBeenCalled();
  });
  it("requests a real PKCE email link without trusting a redirect in the form", async () => {
    const form = new FormData();
    form.set("email", "TEACHER@example.com");
    form.set("redirect", "https://untrusted.invalid");
    expect((await sendTeacherLoginLink(form)).ok).toBe(true);
    expect(state.otp).toHaveBeenCalledWith({
      email: "teacher@example.com",
      options: {
        shouldCreateUser: true,
        emailRedirectTo: "http://127.0.0.1:3086/auth/callback",
      },
    });
  });
  it("does not report email delivery when provider rejects it", async () => {
    state.otp.mockResolvedValue({
      error: { status: 403, message: "private provider detail" },
    });
    const form = new FormData();
    form.set("email", "teacher@example.com");
    const r = await sendTeacherLoginLink(form);
    expect(r.ok).toBe(false);
    expect(r.message).not.toContain("private provider");
  });
  it("does not claim a role before the code and user are verified", async () => {
    state.exchange.mockResolvedValue({ error: { message: "invalid" } });
    const r = await GET(
      new NextRequest("http://127.0.0.1:3086/auth/callback?code=bad"),
    );
    expect(r.headers.get("location")).toContain("notice=email-link");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("completes only server-owned operator setup and ignores an external next URL", async () => {
    const r = await GET(
      new NextRequest(
        "http://127.0.0.1:3086/auth/callback?code=valid&next=https://untrusted.invalid&role=teacher",
      ),
    );
    expect(state.rpc).toHaveBeenCalledWith("complete_operator_email_setup");
    expect(r.headers.get("location")).toBe("http://127.0.0.1:3086/account");
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
});
