import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const state = vi.hoisted(() => ({
  values: new Map<string, string>(),
  options: new Map<string, any>(),
  fetch: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/google-export-jobs", () => ({
  exportJob: vi.fn(async (action: string) =>
    action === "reserve"
      ? { state: "reserved", lease: "fixture-lease" }
      : { ok: true },
  ),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      state.values.has(name) ? { value: state.values.get(name) } : undefined,
    set: (name: string, value: string, options: any) => {
      state.values.set(name, value);
      state.options.set(name, options);
    },
    delete: (name: string) => {
      state.values.delete(name);
    },
  }),
}));
vi.mock("@/lib/auth", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@/lib/export-documents", () => ({
  docxBytes: async () => Buffer.from("docx-test"),
}));
vi.mock("@/lib/export-spreadsheet", () => ({
  xlsxBytes: async () => Buffer.from("xlsx-test"),
}));
import {
  googleStart,
  googleCallback,
  googleCancel,
  googleExport,
  verifyGoogleConnection,
  googleRevoke,
} from "@/lib/google-drive";
import { unseal } from "@/lib/token-box";
import { exportJob } from "@/lib/google-export-jobs";
import { googleCallbackNotice, googleExportFailure } from "@/lib/google-errors";
const key = Buffer.alloc(32, 7);
const bundle = {
  title: "가상 기록",
  entries: [{ title: "가상 도서", body: "가상 본문", meta: "검증용" }],
};
const json = (data: unknown, status = 200) => Response.json(data, { status });
beforeEach(() => {
  vi.mocked(exportJob)
    .mockReset()
    .mockImplementation(async (action) =>
      action === "reserve" ? { state: "reserved", lease: "fixture-lease" } : {},
    );
  state.values.clear();
  state.options.clear();
  state.fetch.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T01:00:00Z"));
  vi.stubEnv(
    "GOOGLE_DRIVE_CLIENT_ID",
    "fixture-client.apps.googleusercontent.com",
  );
  vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", key.toString("base64"));
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://reading-blush-zeta.vercel.app");
  vi.stubGlobal("fetch", state.fetch);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function connected() {
  const url = new URL(await googleStart("teacher-a"));
  state.fetch.mockResolvedValueOnce(
    json({
      access_token: "fixture-access",
      refresh_token: "fixture-refresh",
      expires_in: 3600,
    }),
  );
  await googleCallback(
    "teacher-a",
    "fixture-code",
    url.searchParams.get("state")!,
  );
  state.fetch.mockClear();
}
describe("Google OAuth and Drive lifecycle", () => {
  it("reconciles uncertain work without creating another file", async () => {
    await connected();
    vi.mocked(exportJob).mockResolvedValueOnce({
      state: "uncertain",
      lease: "fixture-lease",
    });
    state.fetch.mockResolvedValueOnce(json({ files: [] }));
    await expect(
      googleExport("teacher-a", bundle, false, "request"),
    ).rejects.toThrow("GOOGLE_EXPORT_PENDING");
    expect(state.fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(exportJob).mock.calls.at(-1)?.[0]).toBe("uncertain");
  });
  it("marks an upload timeout uncertain instead of authorizing a second upload", async () => {
    await connected();
    state.fetch
      .mockResolvedValueOnce(json({ files: [] }))
      .mockResolvedValueOnce(json({ files: [{ id: "folder" }] }))
      .mockRejectedValueOnce(new TypeError("offline"));
    await expect(
      googleExport("teacher-a", bundle, true, "request"),
    ).rejects.toThrow("GOOGLE_DRIVE_BUSY");
    expect(vi.mocked(exportJob).mock.calls.map((x) => x[0])).toEqual([
      "reserve",
      "posting",
      "uncertain",
    ]);
  });
  it("keeps the connection when revocation fails, and clears it only after Google confirms", async () => {
    await connected();
    state.fetch.mockResolvedValueOnce(json({}, 503));
    await expect(googleRevoke("teacher-a")).rejects.toThrow(
      "GOOGLE_REVOKE_FAILED",
    );
    expect(state.values.has("bookforest_google")).toBe(true);
    state.fetch.mockResolvedValueOnce(json({}));
    await googleRevoke("teacher-a");
    expect(state.values.has("bookforest_google")).toBe(false);
    expect(state.fetch.mock.calls.at(-1)![0]).toBe(
      "https://oauth2.googleapis.com/revoke",
    );
  });
  it("checks the real Drive response and refreshes an expired access token", async () => {
    await connected();
    vi.setSystemTime(Date.now() + 3601000);
    state.fetch
      .mockResolvedValueOnce(
        json({ access_token: "refreshed", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(json({ files: [{ id: "private-file" }] }));
    const result = await verifyGoogleConnection("teacher-a");
    expect(result.connected).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private-file");
    expect(state.fetch).toHaveBeenCalledTimes(2);
    expect(state.fetch.mock.calls[1][0]).toContain("pageSize=1");
  });
  it.each([
    ["rateLimitExceeded", "GOOGLE_DRIVE_BUSY"],
    ["storageQuotaExceeded", "GOOGLE_DRIVE_QUOTA"],
    ["domainPolicy", "GOOGLE_DRIVE_FORBIDDEN"],
  ])("distinguishes a Drive 403 reason: %s", async (reason, code) => {
    await connected();
    const token = state.values.get("bookforest_google");
    state.fetch.mockResolvedValueOnce(
      json({ error: { errors: [{ reason }] } }, 403),
    );
    await expect(verifyGoogleConnection("teacher-a")).rejects.toThrow(code);
    expect(state.values.get("bookforest_google")).toBe(token);
  });
  it("uses the exact public callback, limited scope, offline access and PKCE", async () => {
    const url = new URL(await googleStart("teacher-a"));
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://reading-blush-zeta.vercel.app/api/google/callback",
    );
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/drive.file",
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    const saved = unseal<{ verifier: string; nonce: string }>(
      state.values.get("bookforest_google_state")!,
      key,
      "google-state",
    );
    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(saved.verifier).digest("base64url"),
    );
    expect(url.searchParams.get("state")).toBe(saved.nonce);
    expect(state.options.get("bookforest_google_state")).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      maxAge: 600,
    });
  });
  it.each(["wrong-state", "wrong-user", "expired"])(
    "rejects %s before token exchange",
    async (kind) => {
      const url = new URL(await googleStart("teacher-a"));
      if (kind === "expired") vi.setSystemTime(Date.now() + 601000);
      await expect(
        googleCallback(
          kind === "wrong-user" ? "teacher-b" : "teacher-a",
          "code",
          kind === "wrong-state" ? "wrong" : url.searchParams.get("state")!,
        ),
      ).rejects.toThrow("GOOGLE_STATE_INVALID");
      expect(state.fetch).not.toHaveBeenCalled();
      expect(state.values.has("bookforest_google_state")).toBe(false);
    },
  );
  it("consumes a callback only once and keeps tokens encrypted", async () => {
    const url = new URL(await googleStart("teacher-a"));
    state.fetch.mockResolvedValueOnce(
      json({
        access_token: "fixture-access",
        refresh_token: "fixture-refresh",
        expires_in: 3600,
      }),
    );
    await googleCallback("teacher-a", "code", url.searchParams.get("state")!);
    expect(state.values.get("bookforest_google")).not.toContain(
      "fixture-access",
    );
    await expect(
      googleCallback("teacher-a", "code", url.searchParams.get("state")!),
    ).rejects.toThrow("GOOGLE_STATE_INVALID");
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });
  it("cancellation consumes valid state without discarding an existing connection", async () => {
    await connected();
    const token = state.values.get("bookforest_google");
    const url = new URL(await googleStart("teacher-a"));
    await googleCancel("teacher-a", url.searchParams.get("state")!);
    expect(state.values.has("bookforest_google_state")).toBe(false);
    expect(state.values.get("bookforest_google")).toBe(token);
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it("does not export another account's encrypted connection", async () => {
    await connected();
    await expect(
      googleExport("teacher-b", bundle, false, "request"),
    ).rejects.toThrow("GOOGLE_CONNECT_REQUIRED");
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it.each([
    [401, "GOOGLE_CONNECT_REQUIRED"],
    [403, "GOOGLE_DRIVE_FORBIDDEN"],
    [429, "GOOGLE_DRIVE_BUSY"],
    [503, "GOOGLE_DRIVE_BUSY"],
  ])(
    "classifies Drive HTTP %s before folder or file writes",
    async (status, message) => {
      await connected();
      state.fetch.mockResolvedValueOnce(json({}, status as number));
      await expect(
        googleExport("teacher-a", bundle, false, "request"),
      ).rejects.toThrow(message as string);
      expect(state.fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("requires reconnect when Google revokes a refresh token", async () => {
    await connected();
    vi.setSystemTime(Date.now() + 3601000);
    state.fetch.mockResolvedValueOnce(json({ error: "invalid_grant" }, 400));
    await expect(
      googleExport("teacher-a", bundle, false, "request"),
    ).rejects.toThrow("GOOGLE_CONNECT_REQUIRED");
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([429, 503, "network"])(
    "preserves the connection during a temporary refresh failure: %s",
    async (status) => {
      await connected();
      vi.setSystemTime(Date.now() + 3601000);
      const token = state.values.get("bookforest_google");
      if (status === "network")
        state.fetch.mockRejectedValueOnce(new TypeError("offline"));
      else state.fetch.mockResolvedValueOnce(json({}, status as number));
      await expect(
        googleExport("teacher-a", bundle, false, "request"),
      ).rejects.toThrow("GOOGLE_DRIVE_BUSY");
      expect(state.values.get("bookforest_google")).toBe(token);
      expect(state.fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("returns the existing file on a matching replay", async () => {
    await connected();
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ bundle, spreadsheet: false }))
      .digest("hex");
    state.fetch.mockResolvedValueOnce(
      json({
        files: [
          {
            id: "existing",
            webViewLink: "https://docs.google.com/document/d/existing",
            appProperties: { fingerprint },
          },
        ],
      }),
    );
    expect((await googleExport("teacher-a", bundle, false, "request")).id).toBe(
      "existing",
    );
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });
  it("uploads a formatted workbook as a native Google Sheet", async () => {
    await connected();
    state.fetch
      .mockResolvedValueOnce(json({ files: [] }))
      .mockResolvedValueOnce(json({ files: [{ id: "folder" }] }))
      .mockResolvedValueOnce(
        json({
          id: "created",
          webViewLink: "https://docs.google.com/spreadsheets/d/created",
        }),
      );
    await googleExport("teacher-a", bundle, true, "request");
    const body = state.fetch.mock.calls[2][1].body.toString();
    expect(body).toContain(
      '"mimeType":"application/vnd.google-apps.spreadsheet"',
    );
    expect(body).toContain(
      "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(body).toContain("xlsx-test");
  });
});
describe("safe user-facing Google recovery", () => {
  it("does not claim a connection just because the URL says connected", () => {
    expect(googleCallbackNotice("connected", false)).toBeNull();
    expect(
      googleCallbackNotice("unknown-user-supplied-message", true),
    ).toBeNull();
    expect(googleCallbackNotice("connected", true)).toContain("연결을 완료");
  });
  it("distinguishes reconnect from a retryable Drive outage", () => {
    expect(
      googleExportFailure(new Error("GOOGLE_CONNECT_REQUIRED")),
    ).toMatchObject({ status: 401, body: { requiresReconnect: true } });
    expect(googleExportFailure(new Error("GOOGLE_DRIVE_BUSY"))).toMatchObject({
      status: 503,
      body: { requiresReconnect: false },
    });
    expect(
      googleExportFailure(new Error("private unknown provider detail")),
    ).toBeNull();
  });
});
