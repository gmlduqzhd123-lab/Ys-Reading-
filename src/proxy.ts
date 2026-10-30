import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  const privateHeaders = {
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
    Expires: "0",
    Pragma: "no-cache",
  };
  Object.entries(privateHeaders).forEach(([key, value]) =>
    response.headers.set(key, value),
  );
  if (!config) return response;
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries({ ...cacheHeaders, ...privateHeaders }).forEach(
          ([key, value]) => response.headers.set(key, value),
        );
      },
    },
  });
  // Refresh only here; each server action additionally verifies the user and database role.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    "/app/:path*",
    "/hub/:path*",
    "/account/:path*",
    "/operations/:path*",
    "/login",
    "/auth/:path*",
    "/api/books",
    "/api/export",
    "/api/google/:path*",
  ],
};
