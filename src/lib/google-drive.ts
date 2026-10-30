import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { getCurrentProfile } from "./auth";
import { accountReady } from "./account-access";
import { seal, unseal } from "./token-box";
import { csvText, docxBytes, type ExportBundle } from "./export-documents";
const TOKEN = "bookforest_google",
  STATE = "bookforest_google_state";
interface GoogleToken {
  uid: string;
  access_token: string;
  refresh_token?: string;
  expires: number;
  folder?: string;
}
interface GoogleState {
  uid: string;
  nonce: string;
  verifier: string;
  expires: number;
}
function config() {
  const id = process.env.GOOGLE_DRIVE_CLIENT_ID,
    secret = process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    key = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
    origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!id || !secret || !key || !origin) return null;
  try {
    const url = new URL(origin);
    const bytes = Buffer.from(key, "base64");
    if (
      bytes.length !== 32 ||
      (url.protocol !== "https:" &&
        !["localhost", "127.0.0.1"].includes(url.hostname))
    )
      return null;
    return {
      id,
      secret,
      key: bytes,
      origin: url.origin,
      callback: `${url.origin}/api/google/callback`,
    };
  } catch {
    return null;
  }
}
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};
export async function googleConnectionState() {
  const ready = Boolean(config());
  if (!ready) return { configured: false, connected: false };
  const profile = await getCurrentProfile();
  if (!accountReady(profile) || profile.role !== "teacher")
    return { configured: true, connected: false };
  try {
    const raw = (await cookies()).get(TOKEN)?.value;
    if (!raw) return { configured: true, connected: false };
    const t = unseal<GoogleToken>(
      raw,
      config()!.key,
      `google-token:${profile.id}`,
    );
    return {
      configured: true,
      connected:
        t.uid === profile.id &&
        Boolean(t.refresh_token || t.expires > Date.now()),
    };
  } catch {
    return { configured: true, connected: false };
  }
}
export async function googleStart(uid: string) {
  const c = config();
  if (!c) throw new Error("GOOGLE_NOT_CONFIGURED");
  const nonce = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  (await cookies()).set(
    STATE,
    seal(
      { uid, nonce, verifier, expires: Date.now() + 10 * 60000 },
      c.key,
      "google-state",
    ),
    { ...cookieOptions, maxAge: 600 },
  );
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  Object.entries({
    client_id: c.id,
    redirect_uri: c.callback,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
    state: nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}
export async function googleCallback(uid: string, code: string, state: string) {
  const c = config();
  if (!c) throw new Error("GOOGLE_NOT_CONFIGURED");
  const jar = await cookies();
  const raw = jar.get(STATE)?.value;
  jar.delete(STATE);
  if (!raw) throw new Error("GOOGLE_STATE_INVALID");
  const saved = unseal<GoogleState>(raw, c.key, "google-state");
  if (saved.uid !== uid || saved.nonce !== state || saved.expires < Date.now())
    throw new Error("GOOGLE_STATE_INVALID");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.id,
      client_secret: c.secret,
      code,
      code_verifier: saved.verifier,
      redirect_uri: c.callback,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const token = await response.json();
  if (!response.ok || typeof token.access_token !== "string")
    throw new Error("GOOGLE_AUTH_FAILED");
  const data: GoogleToken = {
    uid,
    access_token: token.access_token,
    ...(token.refresh_token ? { refresh_token: token.refresh_token } : {}),
    expires: Date.now() + Number(token.expires_in ?? 3600) * 1000,
  };
  jar.set(TOKEN, seal(data, c.key, `google-token:${uid}`), {
    ...cookieOptions,
    maxAge: 30 * 86400,
  });
}
async function access(uid: string) {
  const c = config();
  if (!c) throw new Error("GOOGLE_NOT_CONFIGURED");
  const jar = await cookies();
  const raw = jar.get(TOKEN)?.value;
  if (!raw) throw new Error("GOOGLE_CONNECT_REQUIRED");
  let token = unseal<GoogleToken>(raw, c.key, `google-token:${uid}`);
  if (token.uid !== uid) throw new Error("GOOGLE_CONNECT_REQUIRED");
  if (token.expires < Date.now() + 60000) {
    if (!token.refresh_token) throw new Error("GOOGLE_CONNECT_REQUIRED");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.id,
        client_secret: c.secret,
        refresh_token: token.refresh_token,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || typeof result.access_token !== "string")
      throw new Error("GOOGLE_CONNECT_REQUIRED");
    token = {
      ...token,
      access_token: result.access_token,
      expires: Date.now() + Number(result.expires_in ?? 3600) * 1000,
    };
    jar.set(TOKEN, seal(token, c.key, `google-token:${uid}`), {
      ...cookieOptions,
      maxAge: 30 * 86400,
    });
  }
  return token;
}
async function drive(token: GoogleToken, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://www.googleapis.com/${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("GOOGLE_DRIVE_FAILED");
  return response.json();
}
export async function googleExport(
  uid: string,
  bundle: ExportBundle,
  spreadsheet: boolean,
  requestId: string,
) {
  const token = await access(uid);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ bundle, spreadsheet }))
    .digest("hex");
  const query = new URLSearchParams({
    q: `trashed=false and appProperties has { key='bookforest_request' and value='${requestId}' }`,
    fields: "files(id,webViewLink,appProperties)",
  });
  const existing = await drive(token, `drive/v3/files?${query}`);
  if (existing.files?.[0]) {
    if (existing.files[0].appProperties?.fingerprint !== fingerprint)
      throw new Error("BF_IDEMPOTENCY_CONFLICT");
    return existing.files[0];
  }
  const folderQuery = new URLSearchParams({
    q: "trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='bookforest_folder' and value='true' }",
    fields: "files(id)",
  });
  const folders = await drive(token, `drive/v3/files?${folderQuery}`);
  const folder =
    folders.files?.[0] ??
    (await drive(token, "drive/v3/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "책숲 기록",
        mimeType: "application/vnd.google-apps.folder",
        appProperties: { bookforest_folder: "true" },
      }),
    }));
  const boundary = `bookforest_${randomBytes(16).toString("hex")}`;
  const type = spreadsheet
    ? "text/csv"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const metadata = {
    name: bundle.title,
    mimeType: spreadsheet
      ? "application/vnd.google-apps.spreadsheet"
      : "application/vnd.google-apps.document",
    parents: [folder.id],
    appProperties: { bookforest_request: requestId, fingerprint },
  };
  const content = spreadsheet
    ? Buffer.from(csvText(bundle))
    : await docxBytes(bundle);
  if (content.length > 4 * 1024 * 1024) throw new Error("EXPORT_TOO_LARGE");
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const result = await drive(
    token,
    "upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (typeof result.id !== "string" || typeof result.webViewLink !== "string")
    throw new Error("GOOGLE_DRIVE_FAILED");
  return result;
}
export async function googleDisconnect() {
  (await cookies()).delete(TOKEN);
  (await cookies()).delete(STATE);
}
