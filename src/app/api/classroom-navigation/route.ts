import { NextRequest, NextResponse } from "next/server";
import { accountReady } from "@/lib/account-access";
import { getCurrentProfile } from "@/lib/auth";
import { activeClassroom } from "@/lib/classroom-context-server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  try {
    const profile = await getCurrentProfile();
    if (!accountReady(profile)) return reply(null);
    const classroom = await activeClassroom(profile.id, request.nextUrl.searchParams.get("classroom") ?? undefined);
    const flags = { read: false, review: false, owner: false, students: false };
    if (profile.role === "teacher") {
      const client = await createClient();
      const { data, error } = await client.rpc("collaboration_state", { p_classroom: null });
      if (error || !Array.isArray(data?.classes)) return reply(null, 503);
      for (const scope of data.classes) {
        if (classroom && scope.id !== classroom) continue;
        flags.read ||= scope.read === true;
        flags.review ||= scope.review === true;
        flags.owner ||= scope.owner === true;
        flags.students ||= scope.students === true;
      }
    }
    return reply({ role: profile.role, classroom, ...flags });
  } catch {
    return reply(null, 503);
  }
}
