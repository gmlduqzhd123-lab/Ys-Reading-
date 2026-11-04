import type { Instrumentation } from "next";
import { safeErrorDigest } from "@/lib/diagnostics";
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  _request,
  context,
) => {
  // Never serialize an exception, request URL, headers, action arguments or student text.
  const allowed = ["render", "route", "action", "proxy"];
  console.error(
    JSON.stringify({
      event: "bookforest_server_error",
      errorId: safeErrorDigest(error),
      type: allowed.includes(context.routeType) ? context.routeType : "unknown",
      at: new Date().toISOString(),
    }),
  );
};
