import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { accountReady } from "@/lib/account-access";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
export async function GET(request: Request) {
  const p = await getCurrentProfile(),
    headers = { "Cache-Control": "private, no-store" };
  if (!accountReady(p) || request.headers.get("x-bookforest-actor") !== p.id)
    return NextResponse.json(
      { error: "계정을 확인해 주세요." },
      { status: 401, headers },
    );
  const id = new URL(request.url).searchParams.get("classroom") || "";
  if (!z.union([z.uuid(), z.literal("")]).safeParse(id).success)
    return NextResponse.json(
      { error: "학급을 확인해 주세요." },
      { status: 400, headers },
    );
  const c = await createClient(),
    r = await c.rpc("learning_change_token", { p_classroom: id || null });
  return NextResponse.json(
    r.error ? { error: "갱신 확인을 기다리고 있어요." } : { token: r.data },
    { status: r.error ? 503 : 200, headers },
  );
}
