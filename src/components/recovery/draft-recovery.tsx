"use client";
import { useEffect, useState } from "react";
import {
  readRecovery,
  recoveryKey,
  type RecoveryDraft,
} from "@/lib/draft-recovery";
export function DraftRecovery({
  userId,
  assignmentId,
  revision,
  title,
  body,
  dirty,
  onRestore,
  onReload,
}: {
  userId: string;
  assignmentId: string;
  revision: number;
  title: string;
  body: string;
  dirty: boolean;
  onRestore: (title: string, body: string) => void;
  onReload: () => void;
}) {
  const [enabled, setEnabled] = useState(false),
    [candidate, setCandidate] = useState<RecoveryDraft | null>(null),
    [message, setMessage] = useState("");
  const key = recoveryKey(userId, assignmentId);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key),
        p = readRecovery(raw, userId, assignmentId);
      if (p) {
        if (p.title === title && p.body === body) {
          sessionStorage.removeItem(key);
        } else setCandidate(p);
      } else if (raw) sessionStorage.removeItem(key);
    } catch {
      setMessage(
        "이 브라우저는 탭 임시보관을 사용할 수 없어요. 파일 저장을 이용해 주세요.",
      );
    }
    // Compare against the initial server state only; later typing is not a recovered candidate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, userId, assignmentId]);
  useEffect(() => {
    if (!enabled) return;
    try {
      if (!dirty) sessionStorage.removeItem(key);
      else
        sessionStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            userId,
            assignmentId,
            revision,
            title,
            body,
            savedAt: Date.now(),
          }),
        );
    } catch {
      setMessage("임시보관에 실패했어요. 현재 글을 파일로 저장해 주세요.");
    }
  }, [enabled, dirty, key, userId, assignmentId, revision, title, body]);
  function download(t = title, b = body) {
    const url = URL.createObjectURL(
        new Blob([t + "\n\n" + b], { type: "text/plain;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "책숲-임시글.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setMessage(
      "글을 파일로 저장했어요. 공용 기기의 다운로드 파일은 사용 후 정리해 주세요.",
    );
  }
  return (
    <aside className="draft-recovery">
      <label className="hub-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            if (!e.target.checked) {
              try {
                sessionStorage.removeItem(key);
              } catch {}
            }
          }}
        />
        이 탭에 미저장 글 임시보관
      </label>
      <p className="form-help">
        선택하면 이 탭의 메모리에 연결된 저장소에 최대 24시간 보관해요. 서버
        저장 확인·로그아웃 때 지웁니다. 공용 기기에서는 활동 후 로그아웃하고
        탭을 닫아 주세요.
      </p>
      <button
        type="button"
        className="button button-outline"
        onClick={() => download()}
      >
        지금 쓴 글 파일로 보관
      </button>
      {enabled && dirty && (
        <button
          type="button"
          className="button button-outline"
          onClick={() => {
            try {
              sessionStorage.setItem(
                key,
                JSON.stringify({
                  version: 1,
                  userId,
                  assignmentId,
                  revision,
                  title,
                  body,
                  savedAt: Date.now(),
                }),
              );
              onReload();
            } catch {
              setMessage(
                "임시 글을 보관하지 못해 이 화면에 머물렀어요. 먼저 파일로 저장해 주세요.",
              );
            }
          }}
        >
          임시보관 후 서버 글 다시 확인
        </button>
      )}
      {candidate && (
        <div className="notice" role="status">
          <strong>
            복구할 임시 글이 있어요: {candidate.title || "제목 없는 글"}
          </strong>
          <p>
            {candidate.revision === revision
              ? "서버에 아직 반영되지 않은 글인지 확인한 뒤 불러오세요."
              : "서버의 저장 버전이 달라졌어요. 임시 글을 파일로 저장해 최신 글과 비교해 주세요."}
          </p>
          <div className="button-row">
            {candidate.revision === revision && (
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  onRestore(candidate.title, candidate.body);
                  setEnabled(true);
                  setCandidate(null);
                  setMessage(
                    "임시 글을 편집기에 불러왔어요. 서버의 저장 완료 표시를 확인해 주세요.",
                  );
                }}
              >
                임시 글 불러오기
              </button>
            )}
            <button
              type="button"
              className="button button-outline"
              onClick={() => download(candidate.title, candidate.body)}
            >
              임시 글 파일로 저장
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                try {
                  sessionStorage.removeItem(key);
                } catch {}
                setCandidate(null);
              }}
            >
              임시 글 지우기
            </button>
          </div>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </aside>
  );
}
