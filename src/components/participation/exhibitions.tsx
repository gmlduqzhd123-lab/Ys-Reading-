"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import type { HubData } from "@/lib/hub-data";
import type { ParticipationData } from "@/lib/participation";
import { koreanDay } from "@/lib/hub";
import { ClassField, Field, Panel } from "@/components/hub/shared";
import { ParticipationForm, TextArea, iso, value } from "./form";
function CollectionExport({
  ids,
  title,
  google,
}: {
  ids: string[];
  title: string;
  google: { configured: boolean; connected: boolean };
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [url, setUrl] = useState(""),
    [names, setNames] = useState(false);
  const requests = useRef<Record<string, string>>({});
  async function exportFile(format: string) {
    if (busy || !ids.length) return;
    setBusy(true);
    setMessage("");
    setUrl("");
    try {
      requests.current[format] ??= crypto.randomUUID();
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "exhibition",
          ids,
          title,
          format,
          requestId: requests.current[format],
          includeNames: names,
        }),
      });
      const result =
        format.startsWith("google-") || !response.ok
          ? await response.json()
          : null;
      if (!response.ok)
        throw new Error(result.error ?? "작품집을 만들지 못했어요.");
      if (result) {
        setUrl(result.url);
        setMessage("공동 작품집을 저장했어요.");
      } else {
        const href = URL.createObjectURL(await response.blob());
        const a = document.createElement("a");
        a.href = href;
        a.download = "책숲-공동작품집.docx";
        a.click();
        setTimeout(() => URL.revokeObjectURL(href), 10000);
        setMessage("Word 작품집을 저장했어요.");
      }
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "연결을 확인하고 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="collection-export">
      <h4>이 전시의 승인된 작품으로 공동 작품집 만들기</h4>
      <p>
        학생의 게시 동의와 선생님의 전시 승인을 거친 작품만 포함합니다. 지금
        시점의 사본이므로 이후 게시 취소가 사본에 자동 반영되지는 않아요.
      </p>
      <label className="hub-check">
        <input
          type="checkbox"
          checked={names}
          disabled={busy}
          onChange={(e) => {
            setNames(e.target.checked);
            requests.current = {};
          }}
        />
        작품에 공개한 필명 포함
      </label>
      <div className="button-row">
        <button
          className="button button-outline"
          disabled={busy || !ids.length || ids.length > 100}
          onClick={() => void exportFile("docx")}
        >
          공동 작품집 Word 저장
        </button>
        {google.connected && (
          <>
            <button
              className="button button-primary"
              disabled={busy || !ids.length || ids.length > 100}
              onClick={() => void exportFile("google-docs")}
            >
              공동 작품집 Google 문서
            </button>
            <button
              className="button button-outline"
              disabled={busy || !ids.length || ids.length > 100}
              onClick={() => void exportFile("google-sheets")}
            >
              공동 작품집 Google 시트
            </button>
          </>
        )}
      </div>
      <Link href="/hub?tab=exports" className="paper-text-link">
        Google 연결 상태 확인·다시 연결
      </Link>
      {ids.length > 100 && (
        <p>
          공동 작품집은 한 번에 100편까지 만들 수 있어요. 전시를 나눠 주세요.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {url && (
        <a
          className="button button-outline"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          공동 작품집 열기
        </a>
      )}
    </div>
  );
}
export function Exhibitions({
  hub,
  extra,
  google,
}: {
  hub: HubData;
  extra: ParticipationData;
  google: { configured: boolean; connected: boolean };
}) {
  const teacher = hub.profile.role === "teacher";
  return (
    <>
      <Panel title="학급·학년의 작은 작품 전시회">
        <p>
          우리 반과 연결된 학년 안에서 생각을 나눠요. 전시 참여는 학생이 고르고
          선생님이 확인합니다. 작품 게시와 전시 참여는 각각 취소할 수 있어요.
        </p>
        {!extra.exhibitions.length && (
          <div className="hub-empty">
            아직 열린 전시회가 없어요. 학급 광장에서 먼저 완성한 작품을 나눠
            보세요. <Link href="/hub?tab=plaza">학급 광장</Link>
          </div>
        )}
        {extra.exhibitions.map((ex) => {
          const entries = extra.exhibits.filter(
              (e) => e.exhibition_id === ex.id,
            ),
            ownHost = hub.classes.some(
              (c) =>
                c.id === ex.classroom_id && c.teacher_id === hub.profile.id,
            );
          const posts = hub.posts.filter(
            (p) =>
              p.student_id === hub.profile.id &&
              p.status === "published" &&
              (ex.group_id
                ? p.group_id === ex.group_id
                : !p.group_id && p.classroom_id === ex.classroom_id) &&
              !entries.some(
                (e) => e.post_id === p.id && e.status !== "withdrawn",
              ),
          );
          const ended = Date.parse(ex.ends_at) < Date.now();
          return (
            <article className="exhibition-card" key={ex.id}>
              <small>
                {ex.group_id ? "연결된 학년" : "우리 반"} ·{" "}
                {new Date(ex.ends_at).toLocaleDateString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
                {ended ? " · 참여 마감" : ""}
              </small>
              <h3>{ex.title}</h3>
              <p className="submission-body">{ex.description}</p>
              {entries.map((e) => (
                <section className="exhibition-work" key={e.id}>
                  <span className="status-pill">
                    {e.status === "approved"
                      ? "전시 중"
                      : e.status === "pending"
                        ? "선생님 확인 중"
                        : "전시 취소"}
                  </span>
                  <h4>{e.title}</h4>
                  <p className="muted">{e.pen_name}</p>
                  <p className="submission-body">{e.body}</p>
                  {ownHost && e.status === "pending" && (
                    <div className="button-row">
                      <ParticipationForm
                        command="exhibit_decide"
                        label="작품 확인·전시 승인"
                        payload={() => ({ id: e.id, approve: true })}
                      />
                      <ParticipationForm
                        command="exhibit_decide"
                        label="전시하지 않기"
                        payload={() => ({ id: e.id, approve: false })}
                      />
                    </div>
                  )}
                  {e.status !== "withdrawn" &&
                    (e.student_id === hub.profile.id || ownHost) && (
                      <ParticipationForm
                        command="exhibit_withdraw"
                        label="전시 참여 취소"
                        payload={() => ({ id: e.id })}
                      />
                    )}
                </section>
              ))}
              {!teacher && !ended && posts.length > 0 && (
                <ParticipationForm
                  key={posts.map((p) => p.id).join(",")}
                  command="exhibit_submit"
                  label="선택한 작품으로 전시 참여 신청"
                  payload={(fd) => ({
                    id: value(fd, "postId"),
                    exhibitionId: ex.id,
                    consent: fd.get("consent") === "on",
                  })}
                >
                  <label className="field">
                    내가 광장에 게시한 작품
                    <select
                      name="postId"
                      required
                      onChange={(e) => {
                        // Each different work needs a fresh check in this uncontrolled form.
                        const checkbox =
                          e.currentTarget.form?.elements.namedItem("consent");
                        if (checkbox instanceof HTMLInputElement)
                          checkbox.checked = false;
                      }}
                    >
                      {posts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {String(p.title)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="hub-check">
                    <input type="checkbox" name="consent" required />이 전시의
                    학급·학년 친구들과 이 버전의 작품·필명을 나누겠습니다.
                  </label>
                </ParticipationForm>
              )}
              {teacher && entries.some((e) => e.status === "approved") && (
                <CollectionExport
                  key={entries
                    .filter((e) => e.status === "approved")
                    .map((e) => e.id)
                    .join(",")}
                  ids={entries
                    .filter((e) => e.status === "approved")
                    .map((e) => e.id)}
                  title={ex.title + " · 공동 작품집"}
                  google={google}
                />
              )}
            </article>
          );
        })}
        <p className="form-help">
          최근 전시 최대 100개, 접근 가능한 전시 작품 최대 500편을 표시합니다.
          참여할 내 작품은 광장 기록 페이지에서 찾을 수 있습니다.
        </p>
      </Panel>
      {teacher && hub.classes.length > 0 && (
        <details className="panel">
          <summary>작은 작품 전시회 열기</summary>
          <ParticipationForm
            command="exhibition_create"
            label="작품 전시회 열기"
            payload={(fd) => ({
              classroomId: value(fd, "classroomId"),
              groupId: value(fd, "groupId") || null,
              title: value(fd, "title"),
              description: value(fd, "description"),
              endsAt: iso(fd, "endsAt"),
            })}
          >
            <ClassField classes={hub.classes} />
            <Field label="전시회 이름" name="title" maxLength={80} />
            <TextArea label="함께 나눌 주제·참여 안내" name="description" />
            <label className="field">
              전시 범위
              <select name="groupId">
                <option value="">우리 반</option>
                {hub.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · 승인된 연결 학급만
                  </option>
                ))}
              </select>
            </label>
            <Field
              name="endsAt"
              label="참여 마감일"
              type="date"
              min={koreanDay()}
              defaultValue={koreanDay(new Date(Date.now() + 14 * 86400000))}
            />
          </ParticipationForm>
        </details>
      )}
    </>
  );
}
