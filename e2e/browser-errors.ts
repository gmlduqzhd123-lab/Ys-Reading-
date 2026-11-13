import { expect, type Page } from "@playwright/test";

// Log routes and error categories only, never DOM text, credentials or writing.
export function watchBrowserErrors(page: Page) {
  const errors: string[] = [];
  let phase = "page";
  const record = (message: string, error?: Error) => {
    const category = /hydration|hydrating|#418|didn't match/i.test(message)
      ? "HYDRATION_MISMATCH" : "UNHANDLED_BROWSER_ERROR";
    const name = error && /^(?:Error|TypeError|ReferenceError|SyntaxError|RangeError|AbortError|InvalidStateError|SecurityError|NotFoundError)$/.test(error.name) ? error.name : "Error";
    const reason = ["Load failed", "Failed to fetch", "ResizeObserver loop", "AbortError", "cancelled", "canceled", "null", "undefined", "not a function"].find(value => message.includes(value)) ?? "OTHER";
    const frames = (error?.stack?.match(/\/_next\/static\/chunks\/[a-zA-Z0-9_.-]+\.js:\d+:\d+/g) ?? []).slice(0, 4).join(",");
    errors.push(`${category} ${new URL(page.url()).pathname} phase=${phase} name=${name} reason=${reason} frames=${frames}`);
  };
  page.on("pageerror", error => record(error.message, error));
  page.on("console", message => {
    if (message.type() === "error" && /hydration|hydrating|#418|didn't match/i.test(message.text())) record(message.text());
  });
  return Object.assign(() => expect(errors, "Browser runtime errors").toEqual([]),{errors, phase: (value: string) => { phase = value; }});
}
