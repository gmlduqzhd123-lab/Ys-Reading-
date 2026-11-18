// Configuration and roster metadata only. Learning bodies always use a bounded
// server page. Stable unique ordering is supplied by the caller.
export async function metadataPages<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size = 500,
): Promise<{ data: T[]; error: { code?: string } | null }> {
  const result: T[] = [];
  for (let from = 0; ; from += size) {
    const r = await read(from, from + size - 1);
    if (r.error)
      return {
        data: [],
        error:
          typeof r.error === "object"
            ? (r.error as { code?: string })
            : { code: "METADATA_QUERY_FAILED" },
      };
    const rows = r.data ?? [];
    result.push(...rows);
    if (rows.length < size) return { data: result, error: null };
  }
}
