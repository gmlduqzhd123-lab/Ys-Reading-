import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { accountReady } from "@/lib/account-access";
import { domesticBookSearchConfigured, searchBooks } from "@/lib/book-search";
import { consumeApiBudget } from "@/lib/api-budget";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
export async function GET(request: NextRequest) {
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const profile = await getCurrentProfile();
  if (
    !accountReady(profile) ||
    (profile.role === "student" && profile.consent_status !== "verified")
  )
    return reply({ error: "참여 가능한 계정으로 로그인해 주세요." }, 401);
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100)
    return reply({ error: "검색어를 2~100자로 입력해 주세요." }, 400);
  const classroom = request.nextUrl.searchParams.get("classroom");
  if (classroom && !z.uuid().safeParse(classroom).success)
    return reply({ error: "보유 도서를 찾을 학급을 확인해 주세요." }, 400);
  const source = request.nextUrl.searchParams.get("source");
  if (source !== null && source !== "library" && source !== "external")
    return reply({ error: "도서 검색 종류를 확인해 주세요." }, 400);
  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  if (source === "library" && (!classroom || !Number.isInteger(page) || page < 1 || page > 10000))
    return reply({ error: "보유 도서를 찾을 학급과 페이지를 확인해 주세요." }, 400);
  let library: { isbn: string; title: string; author: string; location: string }[] = [];
  let libraryTotal = 0;
  if (classroom && source !== "external") {
    const client = await createClient();
    const { data, error } = await client.rpc("classroom_workshop_query", {
      p_classroom: classroom, p_kind: "library", p_page: source === "library" ? page : 1, p_filters: { q },
    });
    if (error || !data) return reply({ error: "교실 보유 도서에 접근할 수 있는 학급과 계정인지 확인해 주세요." },
      error?.message === "BF_FORBIDDEN" ? 403 : 503);
    library = data.items.map(({ isbn, title, author, location }: { isbn: string; title: string; author: string; location: string }) =>
      ({ isbn, title, author, location }));
    libraryTotal = data.total;
    if (source === "library") return reply({ library, libraryTotal, page, hasNext: page * 30 < libraryTotal });
  }
  const partial = (message: string, status: number, retryAfter?: number) =>
    classroom && source === null ? reply({ library, libraryTotal, books: [], domesticConfigured: domesticBookSearchConfigured(), externalMessage: message })
      : NextResponse.json({ error: message }, { status, headers: {
        "Cache-Control": "private, no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      } });
  try {
    const budget = await consumeApiBudget("books", profile.id);
    if (!budget.allowed) return partial(budget.unavailable
      ? "외부 검색 연결을 확인하고 있어요. 보유 도서를 선택하거나 직접 입력해 주세요."
      : "외부 검색을 여러 번 요청했어요. 1분 뒤에 다시 시도해 주세요.", budget.unavailable ? 503 : 429, budget.retryAfter);
    const result = await searchBooks(q);
    const held = new Set(library.map(book => book.isbn.replaceAll("-", "")));
    return reply({ ...result, library, libraryTotal,
      books: result.books.filter(book => !book.isbn || !held.has(book.isbn.replaceAll("-", ""))) });
  } catch (error) {
    if (error instanceof Error && error.message === "BOOK_ISBN_INVALID")
      return partial("ISBN의 숫자와 자릿수를 확인해 주세요. 책 제목으로도 검색할 수 있어요.", 400);
    return partial("외부 도서 검색이 응답하지 않아요. 보유 도서를 선택하거나 책 정보를 직접 입력해 주세요.", 503);
  }
}
