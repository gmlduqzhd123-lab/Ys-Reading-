/** Operator-only original-content seed. Never runs during normal app startup. */
import { createClient } from "@supabase/supabase-js";
import { missions } from "../src/lib/missions";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("MISSING_SERVER_CONFIGURATION");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rows = missions.map((mission) => ({
    id: mission.id,
    slug: mission.slug,
    title: mission.title,
    theme: mission.theme,
    grade_band: mission.grade_band,
    prompt: mission.prompt,
    description: mission.description,
    minutes: mission.minutes,
    requires_revision: mission.requires_revision,
    steps: mission.steps,
    kind: mission.kind,
  }));
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error("DUPLICATE_SEED_ID");
  const { error } = await supabase.from("missions").upsert(rows, { onConflict: "id" });
  if (error) throw new Error("MISSION_SEED_FAILED_CHECK_PROJECT_AND_MIGRATION");
  process.stdout.write(JSON.stringify({ ok: true, seededMissions: rows.length }) + "\n");
}

main().catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "MISSION_SEED_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
