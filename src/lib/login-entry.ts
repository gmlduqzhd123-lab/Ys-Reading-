const destinations = new Set([
  "/hub", "/app", "/classroom", "/start", "/reports", "/operations", "/collaboration",
]);
const detailPage = /^\/(?:app\/work|classroom\/activity)\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function loginDestination(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 1024 || /[\\\s\u0000-\u001f\u007f]/u.test(value)) return;
  const [path] = value.split(/[?#]/, 1);
  if (destinations.has(path) || detailPage.test(path)) return value;
}

export function pageDestination(path: string, params: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(name, value);
  }
  return query.size ? path + "?" + query : path;
}

export function loginEntry({ next, teacher, notice }: {
  next?: unknown;
  teacher?: boolean;
  notice?: string;
} = {}) {
  const params = new URLSearchParams();
  if (teacher) params.set("mode", "teacher");
  if (notice) params.set("notice", notice);
  const destination = loginDestination(next);
  if (destination) params.set("next", destination);
  return params.size ? "/login?" + params : "/login";
}
