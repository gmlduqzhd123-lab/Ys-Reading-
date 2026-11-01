import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  const expected = process.env.NEXT_PUBLIC_APP_URL;
  if (!expected || request.headers.get("origin") !== new URL(expected).origin)
    return NextResponse.json(
      { error: "이 페이지에서 다시 요청해 주세요." },
      { status: 403, headers },
    );
  const p = await getCurrentProfile();
  if (
    !p ||
    p.role !== "teacher" ||
    p.account_active === false ||
    p.must_change_password ||
    p.session_fresh === false
  )
    return NextResponse.json(
      { error: "담당 선생님으로 다시 로그인해 주세요." },
      { status: 403, headers },
    );
  let input;
  try {
    input = z
      .object({ classroom: z.uuid() })
      .strict()
      .safeParse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "학급을 확인해 주세요." },
      { status: 400, headers },
    );
  }
  if (!input.success)
    return NextResponse.json(
      { error: "학급을 확인해 주세요." },
      { status: 400, headers },
    );
  const c = await createClient(),
    r = await c.rpc("class_learning_archive", {
      p_classroom: input.data.classroom,
    });
  if (r.error)
    return NextResponse.json(
      {
        error: r.error.message.includes("BF_ARCHIVE_TOO_LARGE")
          ? "기록이 많아 한 파일로 보관할 수 없어요. 운영자에게 전체 백업을 요청해 주세요."
          : "기록을 읽지 못했어요. 담당 학급과 연결을 확인해 주세요.",
      },
      { status: 400, headers },
    );
  return NextResponse.json(r.data, { headers });
}
