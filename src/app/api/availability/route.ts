import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET() {
  let monitor = null;
  try {
    const client = await createClient();
    const result = await client.rpc("service_monitor_status");
    if (!result.error) monitor = result.data;
  } catch {}
  try {
    const r = await fetch(
      "https://api.github.com/repos/gmlduqzhd123-lab/Ys-Reading-/actions/workflows/availability.yml/runs?per_page=1",
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
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
        monitor,
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
      { available: false, monitor },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
