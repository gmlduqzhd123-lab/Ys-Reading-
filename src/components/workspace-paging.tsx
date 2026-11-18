"use client";
import Link from "next/link";
import type { DashboardData } from "@/lib/data";
export function WorkspacePaging({
  data,
  view,
}: {
  data: DashboardData;
  view: string;
}) {
  const p = data.pagination;
  if (!p) return null;
  const href = (page: number, entryPage = data.entryPage ?? 1) =>
    "/app?" +
    new URLSearchParams({
      view,
      page: String(page),
      entryPage: String(entryPage),
      ...(p.classroom ? { classroom: p.classroom } : {}),
      status: p.status,
    });
  return (
    <section className="panel">
      <form action="/app" className="hub-inline">
        <input type="hidden" name="view" value={view} />
        <label className="field">
          조회할 학급
          <select name="classroom" defaultValue={p.classroom ?? ""}>
            <option value="">접근 가능한 모든 학급</option>
            {data.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-outline">학급별 조회</button>
      </form>
      <p>
        전체 {p.total}건 · {p.page}쪽 · 한 번에 30건을 불러옵니다.
      </p>
      <div className="button-row">
        {p.page > 1 && (
          <Link className="button button-outline" href={href(p.page - 1)}>
            이전 목록
          </Link>
        )}
        {p.hasNext && (
          <Link className="button button-outline" href={href(p.page + 1)}>
            다음 목록
          </Link>
        )}
      </div>
      {view === "contests" && (
        <>
          <p>
            접수 작품 {data.entryTotal ?? 0}건 · 완료한 내 글{" "}
            {data.eligibleTotal ?? 0}건 · 작품 목록 {data.entryPage ?? 1}쪽
          </p>
          <div className="button-row">
            {(data.entryPage ?? 1) > 1 && (
              <Link
                className="button button-outline"
                href={href(p.page, (data.entryPage ?? 1) - 1)}
              >
                이전 작품 목록
              </Link>
            )}
            {Math.max(data.entryTotal ?? 0, data.eligibleTotal ?? 0) >
              (data.entryPage ?? 1) * 30 && (
              <Link
                className="button button-outline"
                href={href(p.page, (data.entryPage ?? 1) + 1)}
              >
                다음 작품 목록
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
