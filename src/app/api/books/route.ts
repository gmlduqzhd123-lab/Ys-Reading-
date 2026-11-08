import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { accountReady } from "@/lib/account-access";
import { searchBooks } from "@/lib/book-search";
import {consumeApiBudget} from "@/lib/api-budget";
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (
    !accountReady(profile) ||
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
    const budget=await consumeApiBudget("books",profile.id);
    if(!budget.allowed)return NextResponse.json({error:budget.unavailable?"검색 연결을 잠시 확인하고 있어요. 책 정보는 직접 입력할 수 있습니다.":"검색을 여러 번 요청했어요. 1분 뒤 다시 검색해 주세요."},{status:budget.unavailable?503:429,headers:{"Cache-Control":"no-store","Retry-After":String(budget.retryAfter)}});
    return NextResponse.json(await searchBooks(q), {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch(error) {
    if(error instanceof Error&&error.message==="BOOK_ISBN_INVALID")return NextResponse.json({error:"ISBN의 숫자와 자릿수를 확인해 주세요. 책 제목으로도 검색할 수 있어요."},{status:400});
    return NextResponse.json(
      {
        error:
          "도서 검색 서비스가 응답하지 않아요. 책 정보를 직접 입력해 기록할 수 있습니다.",
      },
      { status: 503 },
    );
  }
}
