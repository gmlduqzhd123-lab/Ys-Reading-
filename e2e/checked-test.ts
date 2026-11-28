import {test as base} from "@playwright/test";
import {watchBrowserErrors} from "./browser-errors";
export const test = base.extend<{ runtimeCheck: ReturnType<typeof watchBrowserErrors> }>({
  runtimeCheck: [async ({ page }, use) => {
    const check = watchBrowserErrors(page);
    await check.ready;
    await use(check);
    check();
  }, { auto: true }],
});
export {expect} from "@playwright/test";
