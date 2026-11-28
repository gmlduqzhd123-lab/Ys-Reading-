import { expect, type Page } from "@playwright/test";

type ObservedDocument = { origin: string; hiddenAt: number | null };

// Log routes and error categories only, never DOM text, credentials or writing.
export function watchBrowserErrors(page: Page) {
  const errors: string[] = [];
  const failedNavigation: string[] = [];
  const navigationFailures: { document: ObservedDocument; at: number; diagnostic: string }[] = [];
  let phase = "page";
  let currentDocument: ObservedDocument | null = null;
  const webkit = page.context().browser()?.browserType().name() === "webkit";
  const ready = webkit ? page.addInitScript(() => {
    if (window !== window.top) return;
    console.debug("bookforest:test-document-open", location.origin);
    window.addEventListener("pagehide", () => console.debug("bookforest:test-document-hide"));
  }) : Promise.resolve();
  page.on("requestfailed", request => {
    const url = new URL(request.url());
    if (!url.searchParams.has("_rsc")) return;
    const reason = request.failure()?.errorText ?? "";
    const kind = /abort|cancel|\b999\b/i.test(reason) ? "CANCELLED" : "FAILED";
    failedNavigation.push(`${phase} ${url.pathname.replace(/\/[a-f0-9-]{36}$/i, "/:id")} ${kind}`);
  });
  const describe = (message: string, error?: Error) => {
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
    return `${category} ${new URL(page.url()).pathname} phase=${phase} name=${name} reason=${reason} frames=${frames}`;
  };
  page.on("pageerror", error => {
    const diagnostic = describe(error.message, error);
    if (currentDocument && mayBeAbandonedRequest(error, currentDocument.origin)) {
      navigationFailures.push({ document: currentDocument, at: Date.now(), diagnostic });
      return;
    }
    errors.push(diagnostic);
  });
  page.on("console", message => {
    const value = message.text();
    if (webkit && value.startsWith("bookforest:test-document-open ")) {
      currentDocument = { origin: value.slice("bookforest:test-document-open ".length), hiddenAt: null };
      return;
    }
    if (webkit && value === "bookforest:test-document-hide") {
      if (currentDocument) currentDocument.hiddenAt = Date.now();
      return;
    }
    if (
      message.type() === "error" &&
      /hydration|hydrating|#418|didn't match/i.test(value)
    )
      errors.push(describe(value));
  });
  function unresolved() {
    return errors.concat(navigationFailures
      // WebKit reports old-document fetch cancellation around pagehide.
      // A failed request on an active document remains an error.
      .filter(({ document, at }) => document.hiddenAt === null || Math.abs(document.hiddenAt - at) > 750)
      .map(({ diagnostic }) => diagnostic));
  }
  return Object.assign(
    () => expect(unresolved(), "Browser runtime errors. Failed route requests: " + failedNavigation.slice(-8).join(", ")).toEqual([]),
    {
      ready,
      getErrors: unresolved,
      phase: (value: string) => {
        phase = value;
      },
    },
  );
}

function mayBeAbandonedRequest(error: Error, origin: string) {
  if (error.name === "TypeError" && error.message === "Load failed" && error.stack?.includes("/_next/static/chunks/")) return true;
  // Playwright splits native WebKit messages on the first colon, which can
  // be the colon in "http:". The stack preserves the original first line.
  const format = /^Fetch API cannot load (.+?) due to access control checks\.?$/;
  const match = format.exec(error.message) ?? format.exec(error.stack?.split("\n", 1)[0] ?? "");
  if (!match) return false;
  try {
    const url = new URL(match[1].replace(/^['"]|['"]$/g, ""));
    return url.origin === origin && (url.searchParams.has("_rsc") || url.pathname === "/api/monitor");
  } catch {
    return false;
  }
}
