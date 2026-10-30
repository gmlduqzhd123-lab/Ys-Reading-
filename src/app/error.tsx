"use client";
import Link from "next/link";
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="empty-state standalone">
      <h1>화면을 불러오지 못했어요.</h1>
      <p>
        잠시 뒤 다시 시도해 주세요. 제출 결과가 불확실하면 같은 요청을 다시
        확인할 수 있어요.
      </p>
      <div className="button-row">
        <button className="button button-primary" onClick={reset}>
          다시 시도
        </button>
        <Link className="button button-outline" href="/">
          책숲으로
        </Link>
      </div>
    </div>
  );
}
