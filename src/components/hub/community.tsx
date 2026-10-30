"use client";
import { useState } from "react";
import Link from "next/link";
import { koreanDay } from "@/lib/hub";
import type { HubData } from "@/lib/hub-data";
import { ClassField, Empty, Field, HubForm, Panel, string } from "./shared";
export function Plaza({ data }: { data: HubData }) {
  const [query, setQuery] = useState("");
  const teacher = data.profile.role === "teacher";
  return (
    <>
      <Panel title="학급 광장 · 서로 다른 생각 만나기">
        <p>
          학생이 고른 완료 작품을 담당 선생님이 확인한 뒤 나눕니다. 학년 광장은
          교사들이 연결한 학급에만 열려요. 공개한 버전은 원본을 고쳐도
          유지됩니다.
        </p>
        <label className="field">
          제목·본문·필명으로 찾기
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {data.posts
          .filter((p) => `${p.title} ${p.body} ${p.pen_name}`.includes(query))
          .map((p) => (
            <article key={p.id} className="hub-record">
              <div className="hub-row">
                <h3>{String(p.title)}</h3>
                <span className="status-pill">
                  {p.status === "published"
                    ? "함께 읽는 중"
                    : p.status === "withdrawn"
                      ? "게시 취소"
                      : "선생님 확인 중"}
                </span>
              </div>
              <small>
                {String(p.pen_name)} ·{" "}
                {p.group_id
                  ? (data.groups.find((g) => g.id === p.group_id)?.name ??
                    "연결된 학년")
                  : "우리 반"}{" "}
                ·{" "}
                {new Date(p.created_at).toLocaleDateString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </small>
              <p className="submission-body">{String(p.body)}</p>
              {teacher &&
                data.classes.some(
                  (c) =>
                    c.id === p.classroom_id && c.teacher_id === data.profile.id,
                ) &&
                p.status === "pending" && (
                  <HubForm
                    command="plaza_moderate"
                    payload={() => ({ id: p.id, status: "published" })}
                    label="작품 확인·게시 승인"
                  />
                )}
              {(p.student_id === data.profile.id ||
                (teacher &&
                  data.classes.some(
                    (c) =>
                      c.id === p.classroom_id &&
                      c.teacher_id === data.profile.id,
                  ))) &&
                p.status !== "withdrawn" && (
                  <HubForm
                    command="plaza_moderate"
                    payload={() => ({ id: p.id, status: "withdrawn" })}
                    label="게시 취소"
                  />
                )}
              {!teacher && p.status === "published" && (
                <HubForm
                  command="plaza_react"
                  payload={(f) => ({ id: p.id, kind: string(f, "kind") })}
                  label="감상 전하기"
                >
                  <label className="field">
                    짧은 감상
                    <select name="kind">
                      <option value="empathy">이 생각에 공감해요</option>
                      <option value="discovery">
                        새로운 생각을 발견했어요
                      </option>
                    </select>
                  </label>
                  <p className="form-help">
                    감상은 작품마다 하나만 기록되며, 바꾸면 이전 감상을
                    대체합니다.
                  </p>
                </HubForm>
              )}
            </article>
          ))}
        {!data.posts.length && (
          <Empty>아직 나눈 작품이 없어요. 첫 번째 생각을 나눠 보세요.</Empty>
        )}
      </Panel>
      {!teacher && (
        <Panel title="내 작품 나누기">
          <HubForm
            command="plaza_share"
            payload={(f) => ({
              id: string(f, "submissionId"),
              ...(string(f, "groupId")
                ? { groupId: string(f, "groupId") }
                : {}),
              consent: f.get("consent") === "on",
            })}
            label="선생님께 게시 확인 요청"
            disabled={!data.submissions.length}
          >
            <label className="field">
              완료된 작품
              <select name="submissionId" required>
                {data.submissions
                  .filter(
                    (s) =>
                      s.student_id === data.profile.id &&
                      s.status === "completed",
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} · {s.version}번째 글
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              함께 읽을 범위
              <select name="groupId">
                <option value="">우리 반</option>
                {data.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="hub-check">
              <input type="checkbox" name="consent" required />
              선택한 범위의 친구들에게 이 작품을 보여 주고 싶어요.
            </label>
            <p>
              필명은 ‘캐릭터·배지’에서 정할 수 있어요. 글 속에 실명·연락처가
              있다면 게시 요청 전에 살펴보세요.
            </p>
          </HubForm>
        </Panel>
      )}
    </>
  );
}
export function Management({ data }: { data: HubData }) {
  const [code, setCode] = useState("");
  const teacher = data.profile.role === "teacher";
  if (!teacher)
    return (
      <Panel title="우리 학급 연결 신청">
        <p>
          발급받은 계정으로 로그인한 뒤 선생님의 초대 코드를 입력하세요. 동의
          확인과 교사의 승인을 마치면 학급 활동을 사용할 수 있어요.
        </p>
        <HubForm
          command="join_class"
          payload={(f) => ({ code: string(f, "code") })}
          label="학급 연결 신청"
        >
          <Field name="code" label="학급 초대 코드" maxLength={36} />
        </HubForm>
        {data.requests.map((r) => (
          <p key={r.id}>
            연결 신청:{" "}
            {r.status === "approved"
              ? "승인됨"
              : r.status === "rejected"
                ? "반려됨"
                : "교사 확인 중"}
          </p>
        ))}
      </Panel>
    );
  return (
    <>
      <Panel title="학급 초대·참여 관리">
        <Link href="/app?view=classes" className="button button-outline">
          학급 만들기·미션 배정
        </Link>
        <p>
          학생 계정 발급과 동의 증빙 확인은 운영자 절차를 따릅니다. 아래 승인은
          동의 확인을 대신하지 않습니다.
        </p>
        <HubForm
          command="invite_create"
          payload={(f) => ({ classroomId: string(f, "classroomId") })}
          label="초대 코드 발급·재발급"
        >
          <ClassField classes={data.classes} />
          <p>재발급하면 이전 초대 코드는 사용할 수 없습니다.</p>
        </HubForm>
        {data.invites.map((i) => (
          <p key={i.classroom_id}>
            <strong>
              {data.classes.find((c) => c.id === i.classroom_id)?.name}
            </strong>{" "}
            <code className="hub-code">{String(i.code)}</code>
          </p>
        ))}
        <h3>연결 신청</h3>
        {data.requests
          .filter((r) => r.status === "pending")
          .map((r) => (
            <div className="hub-record" key={r.id}>
              <strong>{String(r.display_name)}</strong>
              <p>{data.classes.find((c) => c.id === r.classroom_id)?.name}</p>
              <div className="hub-inline">
                <HubForm
                  command="enrollment_decide"
                  payload={() => ({ id: r.id, decision: "approved" })}
                  label="동의 확인된 학생 승인"
                />
                <HubForm
                  command="enrollment_decide"
                  payload={() => ({ id: r.id, decision: "rejected" })}
                  label="신청 반려"
                />
              </div>
            </div>
          ))}
        <h3>우리 반 학생</h3>
        {data.enrollments
          .filter((e) => e.active)
          .map((e) => (
            <div
              className="hub-row hub-record"
              key={`${e.classroom_id}:${e.student_id}`}
            >
              <span>
                {data.students.find((p) => p.id === e.student_id)
                  ?.display_name ?? "학생"}{" "}
                · {data.classes.find((c) => c.id === e.classroom_id)?.name}
              </span>
              <HubForm
                command="enrollment_pause"
                payload={() => ({
                  classroomId: e.classroom_id,
                  id: e.student_id,
                })}
                label="학급 활동 중지"
              />
            </div>
          ))}
      </Panel>
      <Panel title="학년 모임 만들기·학급 연결">
        <p>
          모임 대표 교사가 학급 연결 요청을 승인합니다. 연결된 학급끼리 글쓰기
          활동과 광장을 함께 사용할 수 있어요.
        </p>
        <HubForm
          command="group_create"
          payload={(f) => ({
            classroomId: string(f, "classroomId"),
            name: string(f, "name"),
          })}
          onSuccess={(r) => setCode(String(r.join_code ?? ""))}
          label="학년 모임 만들기"
        >
          <ClassField classes={data.classes} />
          <Field
            name="name"
            label="모임 이름 · 예: 4학년 생각나눔"
            maxLength={80}
          />
        </HubForm>
        <HubForm
          command="group_join"
          payload={(f) => ({
            classroomId: string(f, "classroomId"),
            code: string(f, "code"),
          })}
          label="다른 학급과 연결 요청"
        >
          <ClassField classes={data.classes} />
          <Field name="code" label="학년 모임 초대 코드" maxLength={36} />
        </HubForm>
        {code && (
          <p role="status">
            학년 초대 코드: <code className="hub-code">{code}</code>
          </p>
        )}
        {data.groups.map((g) => (
          <article key={g.id} className="hub-record">
            <h3>{g.name}</h3>
            <HubForm
              command="group_code"
              payload={() => ({ groupId: g.id })}
              label="초대 코드 확인"
              onSuccess={(r) => setCode(String(r.code ?? ""))}
            />
            {data.members
              .filter((m) => m.group_id === g.id)
              .map((m) => (
                <div className="hub-record" key={m.classroom_id}>
                  {data.classes.find((c) => c.id === m.classroom_id)?.name ??
                    String(m.classroom_name ?? "연결 요청 학급")}{" "}
                  · {m.approved ? "연결됨" : "대표 교사 확인 중"}
                  {!m.approved && g.owner_id === data.profile.id && (
                    <HubForm
                      command="group_approve"
                      payload={() => ({
                        groupId: g.id,
                        classroomId: m.classroom_id,
                      })}
                      label="학급 연결 승인"
                    />
                  )}
                </div>
              ))}
          </article>
        ))}
      </Panel>
      <Panel title="학급·학년 글쓰기 활동 열기">
        <p>
          우리 반이나 연결된 학년 안에서 완성한 글을 나눕니다. 접수·피드백·결과
          확인은 기존 교실 화면에서 이어집니다.
        </p>
        <HubForm
          command="festival_create"
          payload={(f) => ({
            classroomId: string(f, "classroomId"),
            ...(string(f, "groupId") ? { groupId: string(f, "groupId") } : {}),
            title: string(f, "title"),
            description: string(f, "description"),
            opensAt: `${string(f, "opensAt")}+09:00`,
            closesAt: `${string(f, "closesAt")}+09:00`,
          })}
          label="글쓰기 활동 만들기"
        >
          <ClassField classes={data.classes} />
          <label className="field">
            참여 범위
            <select name="groupId">
              <option value="">우리 반</option>
              {data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <Field name="title" label="활동 이름" maxLength={100} />
          <label className="field">
            함께 쓸 주제·안내
            <textarea name="description" required maxLength={3000} />
          </label>
          <div className="hub-form-grid">
            <Field
              name="opensAt"
              label="접수 시작 · 한국 시각"
              type="datetime-local"
            />
            <Field
              name="closesAt"
              label="접수 마감 · 한국 시각"
              type="datetime-local"
            />
          </div>
        </HubForm>
        <Link className="button button-outline" href="/app?view=contests">
          접수·심사·결과 확인
        </Link>
      </Panel>
      <Panel title="이달의 배지 발표">
        <p>
          현재까지 확인된 활동을 기준으로 월간 독서왕·독서미션왕·책숲 출석왕을
          선정합니다. 같은 횟수의 학생은 함께 받으며, 발표한 배지는 보존됩니다.
        </p>
        <HubForm
          command="monthly_awards"
          payload={(f) => ({
            classroomId: string(f, "classroomId"),
            period: string(f, "period"),
          })}
          label="월간 배지 확정·지급"
        >
          <ClassField classes={data.classes} />
          <Field
            name="period"
            label="활동 월"
            type="month"
            defaultValue={koreanDay().slice(0, 7)}
            max={koreanDay().slice(0, 7)}
          />
        </HubForm>
      </Panel>
    </>
  );
}
