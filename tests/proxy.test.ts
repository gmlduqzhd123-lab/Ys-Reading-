import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from "next/experimental/testing/server";
const state = vi.hoisted(() => ({ configured: false, refreshes: 0 }));
vi.mock("@/lib/supabase/config", () => ({
  getSupabaseConfig: () =>
    state.configured
      ? { url: "https://example.supabase.co", key: "test-publishable" }
      : null,
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: any) => ({
    auth: {
      getClaims: async () => {
        state.refreshes++;
        options.cookies.setAll(
          [
            {
              name: "session",
              value: "refreshed",
              options: { httpOnly: true },
            },
          ],
          { "cache-control": "public, max-age=3600" },
        );
        return { data: { claims: { sub: "fixture" } } };
      },
    },
  }),
}));
import { proxy, config } from "@/proxy";
beforeEach(() => {
  state.configured = false;
  state.refreshes = 0;
});
describe("Private reading and export responses", () => {
  it.each([
    "/hub",
    "/hub?tab=exports",
    "/api/books?q=book",
    "/api/export",
    "/api/google/callback",
  ])("runs session protection on %s", (url) => {
    expect(unstable_doesProxyMatch({ config, nextConfig: {}, url })).toBe(true);
  });
  it("leaves public mission content outside the authenticated proxy", () => {
    expect(
      unstable_doesProxyMatch({ config, nextConfig: {}, url: "/missions" }),
    ).toBe(false);
  });
  it("marks even an unconfigured protected page as private and not cacheable", async () => {
    const response = await proxy(new NextRequest("http://localhost/hub"));
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("refreshes request and response cookies without losing private cache headers", async () => {
    state.configured = true;
    const request = new NextRequest("http://localhost/hub");
    const response = await proxy(request);
    expect(state.refreshes).toBe(1);
    expect(request.cookies.get("session")?.value).toBe("refreshed");
    expect(response.cookies.get("session")?.value).toBe("refreshed");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cache-control")).not.toContain("public");
  });
});
