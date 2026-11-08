import {test as base} from "@playwright/test";
import {watchBrowserErrors} from "./browser-errors";
export const test=base.extend<{runtimeCheck:void}>({runtimeCheck:[async({page},use)=>{const check=watchBrowserErrors(page);await use();check();},{auto:true}]});
export {expect} from "@playwright/test";
