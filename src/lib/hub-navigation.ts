export function hubHref(
  tab: string,
  classroom = "",
  extra: Record<string, string | number> = {},
) {
  const params = new URLSearchParams({ tab, classroom });
  for (const [k, v] of Object.entries(extra))
    if (String(v)) params.set(k, String(v));
  return "/hub?" + params.toString();
}
