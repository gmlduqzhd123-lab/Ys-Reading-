import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";
import { createPoolRetryFetch } from "./pool-retry";

export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("BF_NOT_CONFIGURED");
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    global: { fetch: createPoolRetryFetch() },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. Proxy refreshes them before rendering.
        }
      },
    },
  });
}
