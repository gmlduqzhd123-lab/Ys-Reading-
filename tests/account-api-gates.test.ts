import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Profile } from "@/lib/auth";
const state = vi.hoisted(() => ({
  profile: null as Profile | null,
  start: vi.fn(),
  callback: vi.fn(),
  disconnect: vi.fn(),
  search: vi.fn(),
  load: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentProfile: async () => state.profile }));
vi.mock("@/lib/google-drive", () => ({
  googleStart: state.start,
  googleCallback: state.callback,
  googleDisconnect: state.disconnect,
  googleExport: vi.fn(),
}));
vi.mock("@/lib/book-search", () => ({ searchBooks: state.search }));
vi.mock("@/lib/export-documents", () => ({
  exportSchema: { parse: vi.fn() },
  loadExportBundle: state.load,
  docxBytes: vi.fn(),
  csvText: vi.fn(),
  printHtml: vi.fn(),
}));
import { GET as connect } from "@/app/api/google/connect/route";
import { GET as callback } from "@/app/api/google/callback/route";
import { POST as disconnect } from "@/app/api/google/disconnect/route";
import { GET as books } from "@/app/api/books/route";
import { POST as exports } from "@/app/api/export/route";
beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3086";
  state.profile = {
    id: "teacher",
    role: "teacher",
    consent_status: "pending",
    display_name: "테스트 교사",
    account_active: true,
    must_change_password: false,
    session_fresh: true,
  };
  state.start.mockResolvedValue("https://accounts.google.com/o/oauth2/v2/auth");
});
describe("external API gates after account/session changes", () => {
  it.each([
    { account_active: false },
    { must_change_password: true },
    { session_fresh: false },
  ])(
    "blocks Google, books and export before any external side effect (%j)",
    async (flags) => {
      Object.assign(state.profile!, flags);
      const responses = await Promise.all([
        connect(),
        callback(
          new NextRequest(
            "http://127.0.0.1:3086/api/google/callback?code=x&state=y",
          ),
        ),
        disconnect(
          new NextRequest("http://127.0.0.1:3086/api/google/disconnect", {
            method: "POST",
            headers: { Origin: "http://127.0.0.1:3086" },
          }),
        ),
        books(new NextRequest("http://127.0.0.1:3086/api/books?q=book")),
        exports(
          new NextRequest("http://127.0.0.1:3086/api/export", {
            method: "POST",
            headers: { Origin: "http://127.0.0.1:3086" },
          }),
        ),
      ]);
      expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 401, 401]);
      for (const fn of [
        state.start,
        state.callback,
        state.disconnect,
        state.search,
        state.load,
      ])
        expect(fn).not.toHaveBeenCalled();
    },
  );
  it("allows a ready teacher to start their own OAuth flow", async () => {
    expect((await connect()).status).toBe(307);
    expect(state.start).toHaveBeenCalledWith("teacher");
  });
});
