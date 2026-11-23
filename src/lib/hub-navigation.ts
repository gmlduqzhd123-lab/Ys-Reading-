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

export function withClassroom(href: string, classroom?: string) {
  if (classroom === undefined || !/^\/(hub|app(?:\/work\/[^?]+)?|classroom|operations|reports)(?=[?#]|$)/.test(href))
    return href;
  const url = new URL(href, "https://bookforest.invalid");
  url.searchParams.set("classroom", classroom);
  return url.pathname + url.search + url.hash;
}
