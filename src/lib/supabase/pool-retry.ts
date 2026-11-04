// PGRST003 means PostgREST never acquired a connection: no SQL was executed.
// Do not retry other failures, whose commit outcome might be unknown.
export function createPoolRetryFetch(
  baseFetch: typeof fetch = (input, init) => globalThis.fetch(input, init),
  onRetry?: (attempt: number) => void,
): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : null);
    for (let attempt = 0; ; attempt++) {
      const response = await baseFetch(
        input instanceof Request ? input.clone() : input,
        init,
      );
      if (
        response.status !== 504 ||
        !/^\/rest\/v1(?:\/|$)/.test(url.pathname) ||
        attempt >= 3 ||
        signal?.aborted
      )
        return response;
      const error = await response
        .clone()
        .json()
        .catch(() => null);
      if (error?.code !== "PGRST003") return response;
      onRetry?.(attempt + 1);
      await response.body?.cancel();
      await new Promise((resolve) =>
        setTimeout(resolve, 250 * 2 ** attempt + Math.random() * 250),
      );
      if (signal?.aborted)
        throw new DOMException("The operation was aborted.", "AbortError");
    }
  };
}
