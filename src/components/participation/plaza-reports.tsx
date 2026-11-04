"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { plazaReportCommand } from "@/app/hub/plaza-report-actions";
export type PlazaReportState = {
  page: number;
  total: number;
  rows: {
    id: string;
    post_id: string;
    title: string;
    reason: string;
    note: string;
    status: string;
    revision: number;
    can_review: boolean;
  }[];
};
export function ReportPost({ post }: { post: string }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const request = useRef(crypto.randomUUID());
  return (
    <details className="panel">
      <summary>이 작품을 선생님께 알리기</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const data = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const r = await plazaReportCommand({
              action: "report",
              post,
              reason: String(data.get("reason")),
              note: String(data.get("note")),
              request: request.current,
            });
            setMessage(r.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          확인이 필요한 이유
          <select
            name="reason"
            onChange={() => {
              request.current = crypto.randomUUID();
            }}
          >
            <option value="privacy">개인정보가 보여요</option>
            <option value="hurtful">
              마음이 불편하거나 상처를 주는 내용이에요
            </option>
            <option value="other">다른 도움이 필요해요</option>
          </select>
        </label>
        <label className="field">
          선생님께 전할 말 · 선택
          <textarea
            name="note"
            maxLength={500}
            onChange={() => {
              request.current = crypto.randomUUID();
            }}
          />
        </label>
        <p>
          비밀번호·연락처는 적지 마세요. 본인과 담당 선생님만 요청 내용을
          확인합니다.
        </p>
        <button className="button button-outline" disabled={busy}>
          선생님께 확인 요청
        </button>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}
export function PlazaReports({ state }: { state: PlazaReportState }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h2>광장 확인 요청·처리 이력</h2>
      <p>내가 보낸 요청과 담임으로 맡은 학급의 요청을 확인합니다.</p>
      {state.rows.map((r) => (
        <article className="hub-record" key={r.id}>
          <h3>{r.title}</h3>
          <p>
            {
              (
                {
                  privacy: "개인정보",
                  hurtful: "상처를 주는 내용",
                  other: "도움 요청",
                } as Record<string, string>
              )[r.reason]
            }{" "}
            ·{" "}
            {
              (
                {
                  open: "확인 대기",
                  kept: "검토 완료·게시 유지",
                  hidden: "검토 완료·게시 중단",
                } as Record<string, string>
              )[r.status]
            }
          </p>
          {r.note && <p className="submission-body">{r.note}</p>}
          {r.can_review && r.status === "open" && (
            <div className="hub-inline">
              {(["keep", "hide"] as const).map((action) => (
                <button
                  className="button button-outline"
                  disabled={busy}
                  key={action}
                  onClick={async () => {
                    if (
                      action === "hide" &&
                      !window.confirm(
                        "이 작품의 게시를 중단하고 검토를 완료할까요?",
                      )
                    )
                      return;
                    setBusy(true);
                    try {
                      const v = await plazaReportCommand({
                        action,
                        id: r.id,
                        revision: r.revision,
                        request: crypto.randomUUID(),
                      });
                      setMessage(v.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {action === "keep"
                    ? "게시 유지·검토 완료"
                    : "게시 중단·검토 완료"}
                </button>
              ))}
            </div>
          )}
        </article>
      ))}
      {!state.rows.length && <p>확인 요청이 없습니다.</p>}
      <p role="status">{message}</p>
      <nav aria-label="광장 확인 요청 페이지" className="hub-inline">
        {state.page > 1 && (
          <Link href={"/hub?tab=plaza&reportPage=" + (state.page - 1)}>
            이전 요청
          </Link>
        )}
        <span>
          {state.total}건 · {state.page}페이지
        </span>
        {state.page * 20 < state.total && (
          <Link href={"/hub?tab=plaza&reportPage=" + (state.page + 1)}>
            다음 요청
          </Link>
        )}
      </nav>
    </section>
  );
}
