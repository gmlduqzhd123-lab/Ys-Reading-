import type { Instrumentation } from "next";
export const onRequestError: Instrumentation.onRequestError = async (
  _error,
  _request,
  context,
) => {
  // Never serialize an exception, request URL, headers, action arguments or student text.
  const allowed = ["render", "route", "action", "proxy"];
  console.error(
    JSON.stringify({
      event: "bookforest_server_error",
      type: allowed.includes(context.routeType) ? context.routeType : "unknown",
      at: new Date().toISOString(),
    }),
  );
};
