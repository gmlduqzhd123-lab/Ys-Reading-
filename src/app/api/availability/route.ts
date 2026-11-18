import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshMonitor } from "@/lib/monitoring";
export async function GET() {
  let monitor = null;
  try {
    const client = await createClient();
    const result = await client.rpc("service_monitor_status");
    if (!result.error) monitor = refreshMonitor(result.data);
  } catch {}
  try {
    const r = await fetch(
      "https://api.github.com/repos/gmlduqzhd123-lab/Ys-Reading-/actions/workflows/availability.yml/runs?per_page=5",
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(5000),
        cache: "force-cache",
        next: { revalidate: 300 },
      },
    );
    if (!r.ok) throw Error();
    const run = (await r.json()).workflow_runs?.find(
      (r: { head_branch: string; event: string }) =>
        r.head_branch === "main" &&
        ["schedule", "push", "workflow_dispatch"].includes(r.event),
    );
    if (!run) throw Error();
    const age = Date.now() - Date.parse(run.updated_at),
      stale = age > 60 * 60000;
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
