export function appOrigin(requestUrl: string, host?: string | null) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return new URL(configured).origin;
  const url = new URL(requestUrl);
  return host ? new URL(`${url.protocol}//${host}`).origin : url.origin;
}
export function sameOrigin(request: { url: string; headers: Headers }) {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    return (
      new URL(origin).origin ===
      appOrigin(request.url, request.headers.get("host"))
    );
  } catch {
    return false;
  }
}
