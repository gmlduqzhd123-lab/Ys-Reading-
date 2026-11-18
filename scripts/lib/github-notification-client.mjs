import { createHash } from "node:crypto";
export function notificationClient({
  token,
  fetcher = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const base = "https://api.github.com/repos/gmlduqzhd123-lab/Ys-Reading-";
  async function request(route, method = "GET", body) {
    // Never retry a potentially committed POST blindly. A stable marker lets a
    // lost response be reconciled before another write is attempted.
    const { deliveryKey, ...clean } = body ?? {};
    const identity = body
      ? createHash("sha256")
          .update(JSON.stringify({ route, value: deliveryKey ?? clean }))
          .digest("hex")
          .slice(0, 32)
      : "";
    const marker = "<!-- bookforest-delivery:" + identity + " -->";
    const value =
      method === "POST" && typeof clean?.body === "string"
        ? { ...clean, body: clean.body + "\n" + marker }
        : body;
    async function reconcile() {
      if (!value?.body) return null;
      const p =
        route === "/issues"
          ? "/issues?state=open&per_page=100"
          : route.endsWith("/comments")
            ? route + "?per_page=100"
            : null;
      if (!p) return null;
      // The marker is in a server-controlled body; no private diagnostic data is
      // included. Bound scans and fail closed instead of posting duplicates.
      for (let page = 1; page <= 10; page++) {
        const rows = await request(p + "&page=" + page);
        if (!Array.isArray(rows)) throw Error("GITHUB_NOTIFICATION_FAILED");
        const found = rows.find(
          (r) => r.user?.type === "Bot" && r.body?.includes(marker),
        );
        if (found) return found;
        if (rows.length < 100) return null;
      }
      throw Error("GITHUB_NOTIFICATION_SCAN_LIMIT");
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      let r;
      try {
        r = await fetcher(base + route, {
          method,
          headers: {
            Authorization: "Bearer " + token,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
          },
          body: value ? JSON.stringify(value) : undefined,
          signal: AbortSignal.timeout(12000),
          redirect: "error",
        });
        if (r.ok) return r.status === 204 ? null : await r.json();
        if (
          ![408, 429, 500, 502, 503, 504].includes(r.status) &&
          !(
            r.status === 403 &&
            (r.headers.get("retry-after") ||
              r.headers.get("x-ratelimit-remaining") === "0")
          )
        )
          throw Error("GITHUB_NOTIFICATION_REJECTED");
      } catch (error) {
        if (error?.message === "GITHUB_NOTIFICATION_REJECTED")
          throw Error("GITHUB_NOTIFICATION_FAILED");
      }
      if (method === "POST") {
        const committed = await reconcile();
        if (committed) return committed;
      }
      if (attempt === 2) throw Error("GITHUB_NOTIFICATION_FAILED");
      const seconds = Number(r?.headers?.get("retry-after"));
      await sleep(
        Number.isFinite(seconds) && seconds > 0
          ? Math.min(5000, seconds * 1000)
          : 500 * 2 ** attempt,
      );
    }
  }
  return request;
}
