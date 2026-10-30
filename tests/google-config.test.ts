import { describe, it, expect } from "vitest";
import {
  prepareGoogleConfig,
  updateEnvText,
} from "../scripts/configure-google.mjs";
const callback = "http://127.0.0.1:3086/api/google/callback";
const raw = {
  web: {
    project_id: "test-bookforest",
    client_id: "123-test.apps.googleusercontent.com",
    client_secret: "FAKE_SECRET_FOR_UNIT_TEST_ONLY",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    redirect_uris: [callback],
  },
};
const key = Buffer.alloc(32, 9).toString("base64");
describe("Google credential import boundaries", () => {
  it("imports only the intended project's matching web callback", () => {
    expect(
      prepareGoogleConfig(raw, "test-bookforest", callback, key),
    ).toMatchObject({
      GOOGLE_DRIVE_CLIENT_ID: raw.web.client_id,
      GOOGLE_TOKEN_ENCRYPTION_KEY: key,
    });
  });
  it("rejects another project's client and mismatched callbacks", () => {
    expect(() =>
      prepareGoogleConfig(raw, "other-project", callback, key),
    ).toThrow("PROJECT_MISMATCH");
    expect(() =>
      prepareGoogleConfig(
        raw,
        "test-bookforest",
        "https://other.invalid/api/google/callback",
        key,
      ),
    ).toThrow("CALLBACK_MISMATCH");
  });
  it("rejects provider endpoint substitution", () => {
    expect(() =>
      prepareGoogleConfig(
        { web: { ...raw.web, token_uri: "https://untrusted.invalid" } },
        "test-bookforest",
        callback,
        key,
      ),
    ).toThrow("ENDPOINT_INVALID");
  });
  it("preserves an existing encryption key and other environment settings", () => {
    const values = prepareGoogleConfig(
      raw,
      "test-bookforest",
      callback,
      key,
      () => {
        throw new Error("must not rotate");
      },
    );
    const env = updateEnvText(
      "NEXT_PUBLIC_APP_URL=http://127.0.0.1:3086\nGOOGLE_DRIVE_CLIENT_ID=old\n",
      values,
    );
    expect(env).toContain("NEXT_PUBLIC_APP_URL=http://127.0.0.1:3086");
    expect(env.match(/^GOOGLE_DRIVE_CLIENT_ID=/gm)).toHaveLength(1);
    expect(env).toContain(key);
  });
  it("rejects a damaged existing encryption key instead of silently rotating it", () => {
    expect(() =>
      prepareGoogleConfig(raw, "test-bookforest", callback, "bad"),
    ).toThrow("ENCRYPTION_KEY_INVALID");
  });
});
