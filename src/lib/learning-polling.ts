export function learningPoller({
  read,
  available,
  changed,
  initial = "",
}: {
  read: (signal: AbortSignal) => Promise<string | null>;
  available: () => boolean;
  changed: () => void;
  initial?: string;
}) {
  let stopped = false,
    inFlight = false,
    pending = false,
    baseline = initial,
    failures = 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    request: AbortController | null = null;
  async function check() {
    if (stopped) return;
    if (inFlight) {
      pending = true;
      return;
    }
    clearTimeout(timer);
    if (!available()) {
      timer = setTimeout(check, 60000);
      return;
    }
    pending = false;
    inFlight = true;
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const token = await read(controller.signal);
      if (stopped) return;
      if (token === null) {
        stopped = true;
        return;
      }
      if (baseline && baseline !== token) changed();
      baseline = token;
      failures = 0;
    } catch {
      failures = Math.min(4, failures + 1);
    } finally {
      clearTimeout(timeout);
      inFlight = false;
      if (!stopped)
        timer = setTimeout(
          check,
          pending ? 0 : Math.min(300000, 60000 * 2 ** failures),
        );
    }
  }
  return {
    start: () => void check(),
    refresh: () => {
      pending = true;
      void check();
    },
    stop: () => {
      stopped = true;
      pending = false;
      clearTimeout(timer);
      request?.abort();
    },
  };
}
