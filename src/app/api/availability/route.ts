import { NextResponse } from "next/server";
export async function GET() {
  try {
    const r = await fetch(
      "https://api.github.com/repos/gmlduqzhd123-lab/Ys-Reading-/actions/workflows/availability.yml/runs?per_page=1",
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 60 },
      },
    );
    if (!r.ok) throw Error();
    const run = (await r.json()).workflow_runs?.[0];
    if (!run) throw Error();
    const age = Date.now() - Date.parse(run.updated_at),
      stale = age > 3 * 3600000;
    return NextResponse.json(
      {
        available: true,
        status: run.status,
        conclusion: run.conclusion,
        updatedAt: run.updated_at,
        stale,
        url: "https://github.com/gmlduqzhd123-lab/Ys-Reading-/actions/workflows/availability.yml",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { available: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
