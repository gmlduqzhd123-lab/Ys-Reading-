"use client";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  readBackupFile,
  summarizeBackup,
  type BackupPreview,
} from "@/lib/studio-backup";
import { formatKoreanDate } from "@/lib/rules";
import type { StudioState } from "@/lib/studio";

type PendingBackup = BackupPreview & {
  filename: string;
  expectedState: StudioState;
  expectedRaw: string | null;
};
type Props = {
  state: StudioState | null;
  getStoredRaw: () => string | null;
  onRestore: (
    candidate: StudioState,
    expectedState: StudioState,
    expectedRaw: string | null,
  ) => boolean;
};
export function BackupRestore({ state, getStoredRaw, onRestore }: Props) {
  const [pending, setPending] = useState<PendingBackup | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const ticketRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ticketRef.current++;
    };
  }, []);
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !state) return;
    const ticket = ++ticketRef.current;
    setPending(null);
    setError("");
    setConfirmed(false);
    setReading(true);
    try {
      const expectedRaw = getStoredRaw();
      const preview = await readBackupFile(file);
      if (mountedRef.current && ticket === ticketRef.current)
        setPending({
          ...preview,
          filename: file.name,
          expectedState: state,
          expectedRaw,
        });
    } catch (cause) {
      if (mountedRef.current && ticket === ticketRef.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "백업 파일을 확인하지 못했어요.",
        );
    } finally {
      if (mountedRef.current && ticket === ticketRef.current) setReading(false);
    }
  }
  const summary = pending ? summarizeBackup(pending.state) : null;
  return (
    <details className="studio-restore">
      <summary>백업 불러오기</summary>
      <div>
        <p>
          체험 글·작품·미션·꾸미기를 백업 파일에서 불러와요. 현재 기록을 먼저
          백업한 뒤 복원해 주세요. 파일은 외부로 전송되지 않아요.
        </p>
        <label className="studio-field">
          <span>책숲 백업 JSON 파일 선택 · 최대 8MB</span>
          <input
            type="file"
            accept=".json,application/json"
            disabled={!state}
            onChange={chooseFile}
          />
        </label>
        {reading && <p role="status">백업 내용을 확인하고 있어요…</p>}
        {error && (
          <p role="alert" className="form-status error">
            {error}
          </p>
        )}
        {pending && summary && (
          <section
            className="restore-preview"
            aria-label="복원할 백업 미리보기"
          >
            <h2>복원할 기록 확인</h2>
            <p>{pending.filename}</p>
            <p>
              {pending.createdAt
                ? `백업한 때: ${formatKoreanDate(pending.createdAt)}`
                : "이전 형식의 백업 · 날짜 정보 없음"}
            </p>
            <dl>
              <div>
                <dt>제출한 글</dt>
                <dd>
                  {summary.versions}개 · 완료 {summary.completed}개
                </dd>
              </div>
              <div>
                <dt>보관한 작품</dt>
                <dd>{summary.works}편</dd>
              </div>
              <div>
                <dt>직접 만든 미션</dt>
                <dd>{summary.missions}개</dd>
              </div>
              <div>
                <dt>작품집 선택</dt>
                <dd>{summary.selected}편</dd>
              </div>
              <div>
                <dt>작성 중인 초안</dt>
                <dd>{summary.hasDraft ? "있어요" : "없어요"}</dd>
              </div>
            </dl>
            <label className="studio-checkbox">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              현재 체험 기록을 이 백업으로 바꿀게요. 지금 기록과 합쳐지지는
              않아요.
            </label>
            <div className="button-row">
              <button
                className="button button-primary"
                disabled={!confirmed}
                onClick={() => {
                  if (
                    confirmed &&
                    onRestore(
                      pending.state,
                      pending.expectedState,
                      pending.expectedRaw,
                    )
                  ) {
                    setPending(null);
                    setConfirmed(false);
                  }
                }}
              >
                이 백업으로 체험 기록 복원
              </button>
              <button
                className="button button-outline"
                onClick={() => {
                  ticketRef.current++;
                  setPending(null);
                  setConfirmed(false);
                  setError("");
                }}
              >
                불러오기 취소
              </button>
            </div>
          </section>
        )}
      </div>
    </details>
  );
}
