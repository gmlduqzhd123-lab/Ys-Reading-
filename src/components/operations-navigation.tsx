import Link from "next/link";
import type { OperationsState } from "@/lib/operations";
export function OperationsNavigation({ state }: { state: OperationsState }) {
  if (!state.pages || !state.totals) return null;
  const entries = [
    ["studentPage", "학생 명단", "students"],
    ["consentPage", "동의 요청", "consents"],
    ["deletionPage", "삭제 요청", "deletions"],
    ["auditPage", "운영 이력", "audit"],
  ] as const;
  function url(key: string, value: number) {
    const p = new URLSearchParams({
      classroom: state.selected ?? "",
      ...Object.fromEntries(
        Object.entries(state.pages!).map(([k, v]) => [k, String(v)]),
      ),
      [key]: String(value),
    });
    return "/operations?" + p;
  }
  return (
    <section className="panel">
      <h2>명단 검색·페이지 이동</h2>
      <form action="/operations" className="hub-inline">
        <input type="hidden" name="classroom" value={state.selected ?? ""} />
        <label className="field">
          학생 별칭·아이디 검색
          <input name="q" defaultValue={state.pages.q} maxLength={80} />
        </label>
        <button className="button button-outline">학생 찾기</button>
      </form>
      <p>
        학생은 선택한 학급에서 검색합니다. 운영자의 동의·삭제 요청은 전체 담당
        범위를 50건씩 확인합니다.
      </p>
      {entries.map(([key, label, total]) => (
        <nav key={key} className="hub-row" aria-label={label + " 페이지"}>
          <span>
            {label} · {state.totals![total]}건 · {state.pages![key]}페이지
          </span>
          {state.pages![key] > 1 && (
            <Link
              className="button button-outline"
              href={url(key, state.pages![key] - 1)}
            >
              이전 {label}
            </Link>
          )}
          {state.pages![key] * 50 < state.totals![total] && (
            <Link
              className="button button-outline"
              href={url(key, state.pages![key] + 1)}
            >
              다음 {label}
            </Link>
          )}
        </nav>
      ))}
    </section>
  );
}
