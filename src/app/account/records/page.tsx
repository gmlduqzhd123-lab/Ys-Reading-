import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrivacyOperations } from "@/components/privacy-operations";
export const metadata = { title: "사본·보관 정책 관리" };
export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const p = await requireProfile(),
    params = await searchParams,
    page = Math.max(1, Math.min(100000, Math.trunc(Number(params.page)) || 1)),
    c = await createClient();
  const [receipts, policies] = await Promise.all([
    c
      .from("export_receipts")
      .select("*", { count: "exact" })
      .eq("actor_id", p.id)
      .order("created_at", { ascending: false })
      .order("id")
      .range((page - 1) * 25, page * 25 - 1),
    p.role === "teacher"
      ? c.rpc("privacy_policy_state")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (receipts.error || policies.error)
    throw Error("사본과 보관 정책을 읽지 못했어요. 다시 시도해 주세요.");
  return (
    <div className="operations-page">
      <h1>사본·보관 정책 관리</h1>
      <p>
        학급 원본의 철회·삭제와 외부 사본 관리를 함께 확인하세요. 이 화면은
        Google Drive나 PC 파일을 자동으로 삭제하지 않습니다.
      </p>
      <PrivacyOperations
        receipts={receipts.data ?? []}
        policies={policies.data ?? []}
      />
      <nav className="hub-row" aria-label="사본 이력 페이지">
        <span>
          {receipts.count ?? 0}건 · {page}페이지
        </span>
        {page > 1 && <Link href={"?page=" + (page - 1)}>이전 사본</Link>}
        {page * 25 < (receipts.count ?? 0) && (
          <Link href={"?page=" + (page + 1)}>다음 사본</Link>
        )}
      </nav>
      <Link className="text-link" href="/privacy">
        개인정보·Google 권한 안내 →
      </Link>
    </div>
  );
}
