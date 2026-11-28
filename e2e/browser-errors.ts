import { expect, type Page } from "@playwright/test";

// Log routes and error categories only, never DOM text, credentials or writing.
export function watchBrowserErrors(page: Page) {
  const errors: string[] = [];
  const failedNavigation: string[] = [];
  let phase = "page";
  let leavingOrigin: string | null = null;
  const webkit = page.context().browser()?.browserType().name() === "webkit";
  page.on("request", request => {
    if (!request.isNavigationRequest()) return;
    try {
      if (request.frame() !== page.mainFrame()) return;
      const previous = new URL(page.url());
      const next = new URL(request.url());
      leavingOrigin = previous.origin === next.origin ? previous.origin : null;
    } catch {
      leavingOrigin = null;
    }
  });
  page.on("domcontentloaded", () => { leavingOrigin = null; });
  page.on("requestfailed", request => {
    const url = new URL(request.url());
    if (!url.searchParams.has("_rsc")) return;
    const reason = request.failure()?.errorText ?? "";
    const kind = /abort|cancel|\b999\b/i.test(reason) ? "CANCELLED" : "FAILED";
    failedNavigation.push(`${phase} ${url.pathname.replace(/\/[a-f0-9-]{36}$/i, "/:id")} ${kind}`);
  });
  const record = (message: string, error?: Error) => {
    const category = /hydration|hydrating|#418|didn't match/i.test(message)
      ? "HYDRATION_MISMATCH"
      : "UNHANDLED_BROWSER_ERROR";
    const name =
      error &&
      /^(?:Error|TypeError|ReferenceError|SyntaxError|RangeError|AbortError|InvalidStateError|SecurityError|NotFoundError)$/.test(
        error.name,
      )
        ? error.name
        : "Error";
    const reason =
      [
        "Load failed",
        "Failed to fetch",
        "The Internet connection appears to be offline",
        "NetworkError",
        "Connection closed.",
        "The network connection was lost",
        "The operation couldn’t be completed",
        "The operation could not be completed",
        "Request was cancelled",
        "WebKit",
        "NSURLErrorDomain",
        "due to access control checks",
        "AbortSignal",
        "ResizeObserver loop",
        "AbortError",
        "cancelled",
        "canceled",
        "null",
        "undefined",
        "not a function",
      ].find((value) => message.toLowerCase().includes(value.toLowerCase())) ?? "OTHER";
    const frames = (
      error?.stack?.match(
        /\/_next\/static\/chunks\/[a-zA-Z0-9_.-]+\.js:\d+:\d+/g,
      ) ?? []
    )
      .slice(0, 4)
      .join(",");
    errors.push(
      `${category} ${new URL(page.url()).pathname} phase=${phase} name=${name} reason=${reason} frames=${frames}`,
    );
  };
  page.on("pageerror", error => {
    // WebKit may report an abandoned fetch as an access-control error while
    // unloading the old document. Keep genuine app errors and failed requests
    // in the destination document visible.
    const abandoned = webkit && leavingOrigin
      ? /^Fetch API cannot load (\S+) due to access control checks\.?$/.exec(error.message)
      : null;
    if (abandoned) {
      try {
        const url = new URL(abandoned[1]);
        if (url.origin === leavingOrigin && (url.searchParams.has("_rsc") || url.pathname === "/api/monitor")) return;
      } catch {}
    }
    record(error.message, error);
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|hydrating|#418|didn't match/i.test(message.text())
    )
      record(message.text());
  });
  return Object.assign(
    () => expect(errors, "Browser runtime errors. Failed route requests: " + failedNavigation.slice(-8).join(", ")).toEqual([]),
    {
      errors,
      phase: (value: string) => {
        phase = value;
      },
    },
  );
}
