import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Profile } from "@/lib/auth";
const state = vi.hoisted(() => ({
  profile: null as Profile | null,
  start: vi.fn(),
  callback: vi.fn(),
  cancel: vi.fn(),
  disconnect: vi.fn(),
  search: vi.fn(),
  load: vi.fn(),
  rpc: vi.fn(),
  classroom: vi.fn(),
  budget: vi.fn(),
}));
const classId = "b88aab36-83e7-4083-8aee-b27f84704c43";
vi.mock("@/lib/auth", () => ({ getCurrentProfile: async () => state.profile }));
vi.mock("@/lib/google-drive", () => ({
  googleStart: state.start,
  googleCallback: state.callback,
  googleCancel: state.cancel,
  googleDisconnect: state.disconnect,
  googleExport: vi.fn(),
}));
vi.mock("@/lib/book-search", () => ({ searchBooks: state.search, domesticBookSearchConfigured: () => false }));
vi.mock("@/lib/classroom-context-server", () => ({ activeClassroom: state.classroom }));
vi.mock("@/lib/api-budget", () => ({ consumeApiBudget: state.budget }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: state.rpc }) }));
vi.mock("@/lib/export-receipts", () => ({ recordExport: vi.fn() }));
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
import { GET as menus } from "@/app/api/classroom-navigation/route";
const connectRequest = (page = 1) => new NextRequest("http://127.0.0.1:3086/api/google/connect?classroom=" + classId + "&page=" + page);
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
  state.callback.mockReset();
  state.cancel.mockReset();
  state.classroom.mockResolvedValue(classId);
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
        connect(connectRequest()),
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
    expect((await connect(connectRequest(2))).status).toBe(307);
    expect(state.start).toHaveBeenCalledWith("teacher", classId, 2);
  });
  it("returns a canceled OAuth flow to exports without exposing its state", async () => {
    state.cancel.mockResolvedValue({ classroom: classId, page: 2 });
    const r = await callback(
      new NextRequest(
        "http://127.0.0.1:3086/api/google/callback?error=access_denied&state=opaque-state",
      ),
    );
    expect(state.cancel).toHaveBeenCalledWith("teacher", "opaque-state");
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe(
      "http://127.0.0.1:3086/hub?tab=exports&google=cancelled&page=2&classroom=" + classId,
    );
  });
  it("returns an expired callback to a safe reconnect page", async () => {
    state.callback.mockRejectedValue(new Error("GOOGLE_STATE_INVALID"));
    const r = await callback(
      new NextRequest(
        "http://127.0.0.1:3086/api/google/callback?code=private-code&state=opaque-state",
      ),
    );
    expect(r.headers.get("location")).toBe(
      "http://127.0.0.1:3086/hub?tab=exports&google=expired",
    );
    expect(r.headers.get("location")).not.toContain("private-code");
  });
  it("returns a ready teacher to the authorized class saved in Google state", async () => {
    state.callback.mockResolvedValue({ classroom: classId, page: 2 });
    const r = await callback(new NextRequest(
      "http://127.0.0.1:3086/api/google/callback?code=private-code&state=opaque-state",
    ));
    expect(r.headers.get("location")).toBe("http://127.0.0.1:3086/hub?tab=exports&google=connected&page=2&classroom=" + classId);
  });
  it("publishes menu flags for the selected classroom only", async () => {
    state.rpc.mockResolvedValue({ data: { classes: [
      { id: classId, read: true, review: false, students: false, owner: false },
      { id: "other", read: true, review: true, students: true, owner: true },
    ] } });
    const r = await menus(new NextRequest("http://127.0.0.1:3086/api/classroom-navigation?classroom=" + classId));
    expect(await r.json()).toEqual({ role: "teacher", classroom: classId, read: true, review: false, students: false, owner: false });
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
  it("still returns authorized classroom books when external search is unavailable", async () => {
    state.rpc.mockResolvedValue({ data: { items: [{ isbn: "9788936434120", title: "우리 반 책", author: "가람", location: "2번" }], total: 1 } });
    state.budget.mockResolvedValue({ allowed: false, unavailable: true });
    const r = await books(new NextRequest("http://127.0.0.1:3086/api/books?q=book&classroom=" + classId));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ books: [], library: [{ title: "우리 반 책" }], libraryTotal: 1, externalMessage: expect.any(String) });
    expect(state.search).not.toHaveBeenCalled();
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
  it("does not return books from a classroom without access", async () => {
    state.rpc.mockResolvedValue({ error: { message: "BF_FORBIDDEN" } });
    const r = await books(new NextRequest("http://127.0.0.1:3086/api/books?q=book&classroom=" + classId));
    expect(r.status).toBe(403);
    expect(state.search).not.toHaveBeenCalled();
  });
  it("pages classroom-only results without calling the external service or its budget", async () => {
    state.rpc.mockResolvedValue({ data: { items: [{ isbn: "9788936434120", title: "두 번째 묶음", author: "", location: "" }], total: 61 } });
    const r = await books(new NextRequest("http://127.0.0.1:3086/api/books?q=book&source=library&page=2&classroom=" + classId));
    expect(await r.json()).toMatchObject({ library: [{ title: "두 번째 묶음" }], libraryTotal: 61, page: 2, hasNext: true });
    expect(state.rpc).toHaveBeenCalledWith("classroom_workshop_query", { p_classroom: classId, p_kind: "library", p_page: 2, p_filters: { q: "book" } });
    expect(state.budget).not.toHaveBeenCalled();
    expect(state.search).not.toHaveBeenCalled();
  });
  it("handles external search independently of classroom metadata", async () => {
    state.budget.mockResolvedValue({ allowed: true });
    state.search.mockResolvedValue({ books: [{ title: "외부 도서" }] });
    const r = await books(new NextRequest("http://127.0.0.1:3086/api/books?q=book&source=external&classroom=" + classId));
    expect(await r.json()).toMatchObject({ books: [{ title: "외부 도서" }] });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
vi.mock("server-only",()=>({}));
