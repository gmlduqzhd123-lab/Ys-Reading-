import { describe, it, expect, vi, afterEach } from "vitest";
import { sameOrigin } from "@/lib/request-origin";
afterEach(() => vi.unstubAllEnvs());
const request = (origin: string, host = "127.0.0.1:3086") => ({
  url: "http://localhost:3086/api/export",
  headers: new Headers({ origin, host }),
});
describe("Export origin boundary", () => {
  it("accepts the configured public origin even when Next normalizes the internal host", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3086");
    expect(sameOrigin(request("http://127.0.0.1:3086"))).toBe(true);
  });
  it("rejects a different site, scheme, port and opaque origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://school.example");
    for (const o of [
      "https://untrusted.example",
      "http://school.example",
      "https://school.example:444",
      "null",
    ])
      expect(sameOrigin(request(o))).toBe(false);
  });
  it("uses the actual Host header for local development when no canonical URL is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(sameOrigin(request("http://127.0.0.1:3086"))).toBe(true);
    expect(sameOrigin(request("https://untrusted.example"))).toBe(false);
  });
});
