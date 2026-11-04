"use client";
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";
import { createPoolRetryFetch } from "./pool-retry";

export function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("BF_NOT_CONFIGURED");
  return createBrowserClient(config.url, config.key, {
    global: { fetch: createPoolRetryFetch() },
  });
}
