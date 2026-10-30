import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { searchBooks } from "@/lib/book-search";
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (
    !profile ||
    (profile.role === "student" && profile.consent_status !== "verified")
  )
    return NextResponse.json(
      { error: "참여 가능한 계정으로 로그인해 주세요." },
      { status: 401 },
    );
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100)
    return NextResponse.json(
      { error: "검색어를 2~100자로 입력해 주세요." },
      { status: 400 },
    );
  try {
    return NextResponse.json(await searchBooks(q), {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "도서 검색 서비스가 응답하지 않아요. 책 정보를 직접 입력해 기록할 수 있습니다.",
      },
      { status: 503 },
    );
  }
}
