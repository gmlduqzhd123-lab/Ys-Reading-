import { expect, type Page } from "@playwright/test";

// Log routes and error categories only, never DOM text, credentials or writing.
export function watchBrowserErrors(page: Page) {
  const errors: string[] = [];
  const record = (message: string) => {
    const category = /hydration|hydrating|#418|didn't match/i.test(message)
      ? "HYDRATION_MISMATCH" : "UNHANDLED_BROWSER_ERROR";
    errors.push(`${category} ${new URL(page.url()).pathname}`);
  };
  page.on("pageerror", error => record(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /hydration|hydrating|#418|didn't match/i.test(message.text())) record(message.text());
  });
  return () => expect(errors, "Browser runtime errors").toEqual([]);
}
