"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Feather,
  Sprout,
  Trophy,
  ArrowRight,
  Plus,
  LogOut,
  CheckCircle2,
  MessageCircle,
  GraduationCap,
  Award,
} from "lucide-react";
import type { DashboardData, Submission, Contest, Entry } from "@/lib/data";
import { missions, themes } from "@/lib/missions";
import { formatKoreanDate } from "@/lib/rules";
import {
  logout,
  createClassroom,
  assignMission,
  reviewWork,
  createContest,
  enterContest,
  submitReview,
  publishContest,
  type ActionResult,
} from "@/app/actions";

const statusLabels = {
  submitted: "선생님 확인 중",
  revision_requested: "고쳐 쓰기",
  completed: "완료",
};
const badgeDefinitions = [
  {
    code: "first_mission",
    title: "첫걸음 독서가",
    description: "첫 미션을 끝까지 완성했어요.",
    icon: BookOpen,
  },
  {
    code: "first_revision",
    title: "고쳐 쓰는 작가",
    description: "피드백을 듣고 글을 다듬었어요.",
    icon: Feather,
  },
  {
    code: "three_themes",
    title: "인문 탐험가",
    description: "세 가지 인문 주제를 탐험했어요.",
    icon: Sprout,
  },
];

function Form({
  action,
  children,
  submitLabel,
}: {
  action: (data: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  submitLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <form
      action={(data) => {
        setResult(null);
        startTransition(async () => {
          try {
            const r = await action(data);
            setResult(r);
            if (r.ok) router.refresh();
          } catch {
            setResult({
              ok: false,
              message:
                "요청을 완료하지 못했어요. 입력한 내용을 확인하고 다시 시도해 주세요.",
            });
          }
        });
      }}
    >
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0 }}>
        {children}
        <button
          type="submit"
          className="button button-primary"
          disabled={pending}
        >
          {pending ? "처리하고 있어요…" : submitLabel}
          <ArrowRight size={15} />
        </button>
      </fieldset>
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`form-status section-status ${result.ok ? "" : "error"}`}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}

function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Sprout size={33} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Workspace({
  data,
  initialView,
}: {
  data: DashboardData;
  initialView?: string;
}) {
  const router = useRouter();
  const teacher = data.profile.role === "teacher";
  const tabs = [
    { key: "missions", label: "독서미션", icon: BookOpen },
    {
      key: "feedback",
      label: teacher ? "제출물 확인" : "받은 피드백",
      icon: MessageCircle,
    },
    { key: "forest", label: "성장 기록", icon: Sprout },
    { key: "contests", label: "글쓰기 축제", icon: Trophy },
    ...(teacher
      ? [{ key: "classes", label: "학급 관리", icon: GraduationCap }]
      : []),
  ];
  const view = tabs.some((t) => t.key === initialView)
    ? initialView!
    : "missions";
  const [pending, startTransition] = useTransition();
  const latest = data.submissions.filter(
    (s) =>
      !data.submissions.some(
        (other) =>
          other.assignment_id === s.assignment_id &&
          other.student_id === s.student_id &&
          other.version > s.version,
      ),
  );
  const completed = data.submissions.filter(
    (s) =>
      s.status === "completed" &&
      !data.submissions.some(
        (other) =>
          other.status === "completed" &&
          other.assignment_id === s.assignment_id &&
          other.student_id === s.student_id &&
          other.version > s.version,
      ),
  );
  return (
    <>
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">
            {teacher ? "A CLASSROOM OF GROWING MINDS" : "YOUR LITTLE FOREST"}
          </span>
          <h1>
            {data.profile.display_name}
            {teacher ? " 선생님의 교실" : "의 책숲"}
          </h1>
          <p>
            {teacher
              ? "작은 생각을 발견하고, 다음 문장을 응원해 주세요."
              : "서두르지 않아도 괜찮아요. 오늘의 생각을 한 문장씩."}
          </p>
        </div>
        <button
          className="button button-small button-outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await logout();
            })
          }
        >
          <LogOut size={14} />
          로그아웃
        </button>
      </div>
      <p>
        <Link className="button button-outline" href="/hub">
          나의 책장 · 기록 내보내기 · 캐릭터 · 광장 · 경제 교실
        </Link>
      </p>
      {data.profile.role === "student" &&
        data.profile.consent_status !== "verified" && (
          <div className="notice">
            <strong>보호자 동의 확인을 기다리고 있어요.</strong>활동을 시작하기
            전에 담당 선생님에게 계정 상태를 확인해 주세요.
          </div>
        )}
      <div className="workspace-tabs" role="navigation" aria-label="교실 메뉴">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={view === key ? "selected" : ""}
            aria-current={view === key ? "page" : undefined}
            onClick={() => router.push(`/app?view=${key}`)}
          >
            <Icon
              size={14}
              style={{ verticalAlign: "middle", marginRight: 7 }}
            />
            {label}
          </button>
        ))}
      </div>
      {view === "missions" && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <span>{teacher ? "운영 중인 학급" : "함께하는 학급"}</span>
              <strong>
                {data.classes.length}
                <small>개</small>
              </strong>
            </div>
            <div className="stat-card">
              <span>배정된 미션</span>
              <strong>
                {data.assignments.length}
                <small>개</small>
              </strong>
            </div>
            <div className="stat-card">
              <span>{teacher ? "검토를 기다리는 글" : "제출한 글"}</span>
              <strong>
                {teacher
                  ? latest.filter((s) => s.status === "submitted").length
                  : latest.length}
                <small>편</small>
              </strong>
            </div>
            <div className="stat-card">
              <span>완성한 작품</span>
              <strong>
                {completed.length}
                <small>편</small>
              </strong>
            </div>
          </div>
          <div className="workspace-section-title">
            <h2>{teacher ? "우리 반의 탐험" : "오늘의 독서미션"}</h2>
            {teacher && (
              <button
                className="text-link"
                onClick={() => router.push("/app?view=classes")}
              >
                <Plus size={16} />
                미션 배정
              </button>
            )}
          </div>
          {data.assignments.length === 0 ? (
            <Empty
              title={
                teacher
                  ? "첫 번째 미션을 배정해 볼까요?"
                  : "아직 배정된 미션이 없어요."
              }
            >
              {teacher
                ? "학급을 만든 뒤, 미션 도서관에서 우리 반에 맞는 활동을 골라 주세요."
                : "선생님이 미션을 배정하면 이곳에서 시작할 수 있어요."}
            </Empty>
          ) : (
            <div className="workspace-grid">
              {data.assignments.map((a) => {
                const m = a.mission_snapshot;
                const sub = latest.find((s) => s.assignment_id === a.id);
                const draft = data.drafts.find((d) => d.assignment_id === a.id);
                return (
                  <article className="assignment-card" key={a.id}>
                    <div className="card-topline">
                      <span className={`topic-tag theme-${m.theme}`}>
                        {themes[m.theme]?.label || m.theme}
                      </span>
                      <span className={`status-pill ${sub?.status || ""}`}>
                        {teacher
                          ? `${data.submissions.filter((s) => s.assignment_id === a.id).length}개 제출 버전`
                          : sub
                            ? statusLabels[sub.status]
                            : draft
                              ? "작성 중"
                              : "시작 전"}
                      </span>
                    </div>
                    <h3>{m.title}</h3>
                    <p>{m.description}</p>
                    <div className="assignment-footer">
                      <span>
                        {
                          data.classes.find((c) => c.id === a.classroom_id)
                            ?.name
                        }{" "}
                        ·{" "}
                        {a.due_at
                          ? `${formatKoreanDate(a.due_at)}까지`
                          : "마감 없음"}
                      </span>
                      {teacher ? (
                        <button
                          className="text-link"
                          onClick={() => router.push("/app?view=feedback")}
                        >
                          제출물 확인 <ArrowRight size={14} />
                        </button>
                      ) : (
                        <Link
                          className="button button-small button-soft"
                          href={`/app/work/${a.id}`}
                        >
                          {sub?.status === "revision_requested"
                            ? "고쳐 쓰기"
                            : draft
                              ? "이어서 쓰기"
                              : "미션 시작"}
                          <ArrowRight size={14} />
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
      {view === "classes" && teacher && <ClassManagement data={data} />}
      {view === "feedback" &&
        (teacher ? (
          <TeacherReviews data={data} submissions={latest} />
        ) : (
          <StudentFeedback data={data} />
        ))}
      {view === "forest" && (
        <>
          <div className="section-heading">
            <div>
              <span className="eyebrow">SMALL STEPS, REAL GROWTH</span>
              <h2>{teacher ? "학급의 성장 기록" : "차곡차곡, 나만의 성취"}</h2>
            </div>
          </div>
          <div className="badge-grid">
            {badgeDefinitions.map(
              ({ code, title, description, icon: Icon }) => {
                const earned = data.badges.filter((b) => b.code === code);
                return (
                  <div
                    className={`badge-card ${earned.length ? "" : "locked"}`}
                    key={code}
                  >
                    <Icon size={36} />
                    <h3>{title}</h3>
                    <p>{description}</p>
                    <span className="status-pill">
                      {earned.length
                        ? teacher
                          ? `${earned.length}명 획득`
                          : `${formatKoreanDate(earned[0].created_at)} 획득`
                        : "다음 성장을 기다려요"}
                    </span>
                  </div>
                );
              },
            )}
          </div>
          <div className="workspace-section-title">
            <h2>완성한 작품</h2>
          </div>
          {completed.length === 0 ? (
            <Empty title="첫 작품을 기다리고 있어요.">
              미션을 완료하면 이곳에 작품이 쌓여요.
            </Empty>
          ) : (
            <div className="workspace-grid">
              {completed.map((s) => (
                <article key={s.id} className="assignment-card">
                  <div className="card-topline">
                    <BookOpen size={21} className="accent-icon" />
                    <span className="status-pill completed">
                      완료 · {s.version}번째 글
                    </span>
                  </div>
                  <h3>{s.title}</h3>
                  <p>
                    {s.body.slice(0, 150)}
                    {s.body.length > 150 ? "…" : ""}
                  </p>
                  {!teacher && (
                    <Link
                      className="text-link"
                      href={`/app/work/${s.assignment_id}`}
                    >
                      작품과 피드백 보기 <ArrowRight size={14} />
                    </Link>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {view === "contests" && <ContestSection data={data} />}
    </>
  );
}

function ClassManagement({ data }: { data: DashboardData }) {
  return (
    <>
      <div className="teacher-forms">
        <section className="panel">
          <h2>우리 반 만들기</h2>
          <p className="form-help">
            학생 연결과 계정 발급은 현재 운영자가 진행합니다.
          </p>
          <Form action={createClassroom} submitLabel="학급 만들기">
            <div className="field">
              <label htmlFor="class-name">학급 이름</label>
              <input
                id="class-name"
                name="name"
                placeholder="예: 4학년 햇살반"
                minLength={2}
                maxLength={80}
                required
              />
            </div>
          </Form>
        </section>
        <section className="panel">
          <h2>독서미션 배정</h2>
          {data.classes.length === 0 ? (
            <p>먼저 우리 반을 만들어 주세요.</p>
          ) : (
            <Form action={assignMission} submitLabel="미션 배정하기">
              <div className="field">
                <label htmlFor="assignment-class">학급</label>
                <select id="assignment-class" name="classroomId" required>
                  {data.classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="assignment-mission">독서미션</label>
                <select id="assignment-mission" name="missionId" required>
                  {missions.map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.grade_band}학년 · {m.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="assignment-due">
                  권장 마감 <span className="field-hint">선택 · 한국 시각</span>
                </label>
                <input id="assignment-due" name="dueAt" type="datetime-local" />
              </div>
            </Form>
          )}
        </section>
      </div>
      <section className="panel" style={{ marginTop: 22 }}>
        <h2>나의 학급</h2>
        {data.classes.length === 0 ? (
          <p>아직 학급이 없어요.</p>
        ) : (
          data.classes.map((c) => (
            <div className="class-row" key={c.id}>
              <strong>{c.name}</strong>
              <small className="class-code">운영자 연결 ID: {c.id}</small>
            </div>
          ))
        )}
      </section>
    </>
  );
}

function TeacherReviews({
  data,
  submissions,
}: {
  data: DashboardData;
  submissions: Submission[];
}) {
  const [filter, setFilter] = useState("submitted");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = submissions.filter(
    (s) => filter === "all" || s.status === filter,
  );
  const selected = filtered.find((s) => s.id === selectedId) || filtered[0];
  return (
    <>
      <div className="catalog-toolbar">
        <div className="filter-tabs" role="group" aria-label="제출 상태">
          {[
            { key: "submitted", label: "검토 대기" },
            { key: "revision_requested", label: "수정 요청" },
            { key: "completed", label: "완료" },
            { key: "all", label: "전체" },
          ].map((f) => (
            <button
              className={filter === f.key ? "selected" : ""}
              aria-pressed={filter === f.key}
              onClick={() => {
                setFilter(f.key);
                setSelectedId(null);
              }}
              key={f.key}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="source-note">각 학생의 최신 제출본을 표시해요.</span>
      </div>
      {filtered.length === 0 ? (
        <Empty title="이 상태의 제출물이 없어요.">
          학생이 미션을 제출하면 여기에서 확인할 수 있어요.
        </Empty>
      ) : (
        <div className="review-layout">
          <div className="review-list">
            {filtered.map((s) => (
              <button
                className={`review-list-item ${selected?.id === s.id ? "selected" : ""}`}
                onClick={() => setSelectedId(s.id)}
                key={s.id}
              >
                <span className={`status-pill ${s.status}`}>
                  {statusLabels[s.status]}
                </span>
                <strong>{s.title}</strong>
                <small>
                  {
                    data.assignments.find((a) => a.id === s.assignment_id)
                      ?.mission_snapshot.title
                  }{" "}
                  · 탐험가 {s.student_id.slice(0, 6)} · {s.version}번째 글
                </small>
              </button>
            ))}
          </div>
          {selected && (
            <section className="panel" key={selected.id}>
              <span className="eyebrow">
                STUDENT WRITING · VERSION {selected.version}
              </span>
              <h2>{selected.title}</h2>
              <p className="submission-body">{selected.body}</p>
              <div className="subtle-divider" />
              <h3>선생님의 한마디</h3>
              {selected.status === "submitted" ? (
                <Form
                  action={async (f) =>
                    reviewWork({
                      submissionId: selected.id,
                      body: String(f.get("body")),
                      decision: String(f.get("decision")) as
                        "revision_requested" | "completed",
                    })
                  }
                  submitLabel="피드백 전하기"
                >
                  <div className="field">
                    <label htmlFor="feedback-body">
                      좋았던 점과 다음에 다듬을 점
                    </label>
                    <textarea
                      id="feedback-body"
                      name="body"
                      required
                      maxLength={2000}
                      rows={5}
                      placeholder="네 생각이 잘 드러났어요. 그 이유를 책 속 장면으로 조금 더 설명해 볼까요?"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="feedback-decision">검토 결과</label>
                    <select id="feedback-decision" name="decision">
                      <option value="revision_requested">고쳐 쓰기 요청</option>
                      <option value="completed">미션 완료</option>
                    </select>
                  </div>
                </Form>
              ) : (
                <p className="form-help">
                  검토를 마친 제출본이에요. 학생이 새 버전을 제출하면 다시
                  피드백할 수 있어요.
                </p>
              )}
              {data.feedback
                .filter((f) =>
                  data.submissions.some(
                    (s) =>
                      s.id === f.submission_id &&
                      s.assignment_id === selected.assignment_id &&
                      s.student_id === selected.student_id,
                  ),
                )
                .map((f) => (
                  <div className="feedback-item" key={f.id}>
                    <small>
                      이전 피드백 · {formatKoreanDate(f.created_at)}
                    </small>
                    <p>{f.body}</p>
                  </div>
                ))}
            </section>
          )}
        </div>
      )}
    </>
  );
}

function StudentFeedback({ data }: { data: DashboardData }) {
  return data.feedback.length === 0 ? (
    <Empty title="선생님의 한마디가 도착할 곳이에요.">
      미션을 제출한 뒤 피드백을 확인해 보세요.
    </Empty>
  ) : (
    <div className="workspace-grid">
      {data.feedback.map((f) => {
        const s = data.submissions.find((s) => s.id === f.submission_id);
        return (
          <article className="panel" key={f.id}>
            <span className={`status-pill ${f.decision}`}>
              {f.decision === "completed" ? "미션 완료" : "함께 고쳐 써요"}
            </span>
            <h3 style={{ marginTop: 15 }}>{s?.title || "나의 글"}</h3>
            <p className="submission-body">{f.body}</p>
            <p className="source-note">
              {s?.version}번째 제출본 · {formatKoreanDate(f.created_at)}
            </p>
            {s && (
              <Link className="text-link" href={`/app/work/${s.assignment_id}`}>
                글 다시 만나기 <ArrowRight size={14} />
              </Link>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ContestSection({ data }: { data: DashboardData }) {
  const teacher = data.profile.role === "teacher";
  const [showCreate, setShowCreate] = useState(false);
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">CELEBRATE YOUR OWN VOICE</span>
          <h2>우리 반 글쓰기 축제</h2>
        </div>
        {teacher && (
          <button
            className="button button-small button-soft"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus size={15} />
            {showCreate ? "접기" : "축제 열기"}
          </button>
        )}
      </div>
      {showCreate && teacher && (
        <section className="panel" style={{ marginBottom: 22 }}>
          {data.classes.length === 0 ? (
            <p>먼저 학급을 만들어 주세요.</p>
          ) : (
            <Form action={createContest} submitLabel="글쓰기 축제 만들기">
              <div className="teacher-forms">
                <div>
                  <div className="field">
                    <label htmlFor="contest-title">축제 이름</label>
                    <input
                      id="contest-title"
                      name="title"
                      required
                      minLength={2}
                      maxLength={100}
                      placeholder="우리 반 작은 용기 글쓰기 축제"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="contest-class">참가 학급</label>
                    <select id="contest-class" name="classroomId">
                      {data.classes.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="contest-description">
                      주제와 참가 안내
                    </label>
                    <textarea
                      id="contest-description"
                      name="description"
                      required
                      maxLength={3000}
                      rows={4}
                      placeholder="주제, 허용되는 도움 도구, 담당 교사 심사 방식을 안내해 주세요."
                    />
                  </div>
                </div>
                <div>
                  <div className="field">
                    <label htmlFor="contest-opens">접수 시작 · 한국 시각</label>
                    <input
                      id="contest-opens"
                      name="opensAt"
                      type="datetime-local"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="contest-closes">
                      접수 마감 · 한국 시각
                    </label>
                    <input
                      id="contest-closes"
                      name="closesAt"
                      type="datetime-local"
                      required
                    />
                  </div>
                  <p className="form-help">
                    완료된 미션 작품으로 학생당 1회 출품합니다. 현재 버전은 담당
                    교사가 심사하며, 접수본 교체·철회는 다음 단계에서 제공할
                    예정입니다.
                  </p>
                  <p className="form-help">
                    평가 기준: 생각 30 · 근거 30 · 구성 25 · 표현 15점
                  </p>
                </div>
              </div>
            </Form>
          )}
        </section>
      )}
      {data.contests.length === 0 ? (
        <Empty title="아직 우리 반의 축제가 없어요.">
          {teacher
            ? "완성한 작품을 함께 축하할 작은 대회를 열어 보세요."
            : "선생님이 축제를 열면 나의 완성작으로 도전할 수 있어요."}
        </Empty>
      ) : (
        <div className="workspace-grid">
          {data.contests.map((c) => (
            <ContestCard key={c.id} contest={c} data={data} />
          ))}
        </div>
      )}
      {teacher && data.entries.length > 0 && <ContestJudging data={data} />}
    </>
  );
}

function ContestCard({
  contest: c,
  data,
}: {
  contest: Contest;
  data: DashboardData;
}) {
  const router = useRouter();
  const teacher = data.profile.role === "teacher";
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const request = useRef<{ submissionId: string; requestId: string } | null>(
    null,
  );
  const own = data.entries.find(
    (e) => e.contest_id === c.id && e.student_id === data.profile.id,
  );
  const review = own ? data.reviews.find((r) => r.entry_id === own.id) : null;
  const works = data.submissions.filter(
    (s) =>
      s.status === "completed" &&
      s.student_id === data.profile.id &&
      data.assignments.some(
        (a) =>
          a.id === s.assignment_id &&
          (c.group_id
            ? data.gradeMembers?.some(
                (m) =>
                  m.group_id === c.group_id &&
                  m.classroom_id === a.classroom_id &&
                  m.approved,
              )
            : a.classroom_id === c.classroom_id),
      ),
  );
  return (
    <article className="contest-card">
      <div className="card-topline">
        <Trophy size={25} className="accent-icon" />
        <span className="status-pill">
          {c.status === "published"
            ? "결과 안내"
            : c.status === "reviewing"
              ? "심사 중"
              : "접수 일정 확인"}
        </span>
      </div>
      <h3>{c.title}</h3>
      <p style={{ whiteSpace: "pre-wrap" }}>{c.description}</p>
      <div className="contest-meta">
        {c.group_id
          ? (data.gradeGroups?.find((g) => g.id === c.group_id)?.name ??
            "우리 학년 글쓰기")
          : data.classes.find((x) => x.id === c.classroom_id)?.name}
        <br />
        시작 {formatKoreanDate(c.opens_at)}
        <br />
        마감 {formatKoreanDate(c.closes_at)} · 한국 시각
      </div>
      {teacher ? (
        <>
          <p className="source-note">
            {data.entries.filter((e) => e.contest_id === c.id).length}편 접수
          </p>
          {c.status !== "published" && (
            <button
              className="button button-small button-soft"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    const r = await publishContest({ contestId: c.id });
                    setResult(r);
                    if (r.ok) router.refresh();
                  } catch {
                    setResult({
                      ok: false,
                      message:
                        "결과를 공개하지 못했어요. 잠시 후 다시 시도해 주세요.",
                    });
                  }
                })
              }
            >
              {pending ? "확인 중…" : "심사 결과 안내하기"}
            </button>
          )}
        </>
      ) : own ? (
        <>
          <div className="notice">
            <strong>
              <CheckCircle2 size={14} /> 접수했어요
            </strong>
            {own.title}
            <br />
            <span className="class-code">접수번호 {own.receipt}</span>
          </div>
          <details className="entry-copy">
            <summary>접수한 작품 본문 확인</summary>
            <p className="submission-body">{own.body}</p>
          </details>
          {review && c.status === "published" && (
            <div className="feedback-item">
              <h3>선생님의 심사 의견</h3>
              <p>{review.comment}</p>
              <span className="status-pill completed">
                {Object.values(review.scores).reduce((a, b) => a + b, 0)}점 /
                100점
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          <label className="sr-only" htmlFor={`entry-${c.id}`}>
            출품할 완료 작품
          </label>
          <select
            id={`entry-${c.id}`}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              request.current = null;
            }}
            disabled={pending || c.status !== "open"}
          >
            <option value="">완료한 작품을 선택해 주세요</option>
            {works.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {s.version}번째 글
              </option>
            ))}
          </select>
          <button
            className="button button-small button-primary"
            disabled={
              !selected ||
              pending ||
              c.status !== "open" ||
              data.profile.consent_status !== "verified"
            }
            onClick={() =>
              startTransition(async () => {
                if (
                  !request.current ||
                  request.current.submissionId !== selected
                )
                  request.current = {
                    submissionId: selected,
                    requestId: crypto.randomUUID(),
                  };
                try {
                  const r = await enterContest({
                    contestId: c.id,
                    submissionId: selected,
                    requestId: request.current.requestId,
                  });
                  setResult(r);
                  if (r.ok) router.refresh();
                } catch {
                  setResult({
                    ok: false,
                    message:
                      "접수 결과를 확인하지 못했어요. 같은 작품으로 다시 확인해 주세요.",
                  });
                }
              })
            }
          >
            {pending ? "접수 확인 중…" : "이 작품으로 참가하기"}
            <ArrowRight size={14} />
          </button>
          <p className="form-help">
            참가는 선택이에요. 완료된 미션과 배지는 그대로 남아요.
          </p>
        </>
      )}
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`form-status section-status ${result.ok ? "" : "error"}`}
        >
          {result.message}
        </p>
      )}
    </article>
  );
}

function ContestJudging({ data }: { data: DashboardData }) {
  const [selected, setSelected] = useState("");
  const entry = data.entries.find((e) => e.id === selected);
  const contest = entry
    ? data.contests.find((c) => c.id === entry.contest_id)
    : undefined;
  return (
    <section className="panel" style={{ marginTop: 24 }}>
      <h2>접수 작품 심사</h2>
      <p className="form-help">
        접수 마감 이후에 심사할 수 있어요. 첫 버전에서는 담당 교사가 심사합니다.
      </p>
      <div className="field">
        <label htmlFor="judge-entry">작품 선택</label>
        <select
          id="judge-entry"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">심사할 작품을 선택해 주세요</option>
          {data.entries.map((e) => (
            <option key={e.id} value={e.id}>
              {e.receipt} · {e.title}
              {data.reviews.some((r) => r.entry_id === e.id) ? " (심사됨)" : ""}
            </option>
          ))}
        </select>
      </div>
      {entry && (
        <EntryReview
          key={entry.id}
          entry={entry}
          contest={contest}
          data={data}
        />
      )}
    </section>
  );
}

function EntryReview({
  entry,
  contest,
  data,
}: {
  entry: Entry;
  contest: Contest | undefined;
  data: DashboardData;
}) {
  const review = data.reviews.find((r) => r.entry_id === entry.id);
  return (
    <div className="review-layout">
      <div>
        <h3>{entry.title}</h3>
        <p className="submission-body">{entry.body}</p>
      </div>
      <div>
        {review ? (
          <div className="notice">
            <strong>심사를 저장했어요.</strong>
            <p className="submission-body">{review.comment}</p>
            <span>
              총 {Object.values(review.scores).reduce((a, b) => a + b, 0)}점 /
              100점
            </span>
            <p className="form-help">
              현재 버전에서는 저장한 심사를 수정할 수 없습니다.
            </p>
          </div>
        ) : contest?.status === "published" ? (
          <div className="notice">
            결과가 공개된 축제의 심사는 변경할 수 없어요.
          </div>
        ) : (
          <Form
            action={async (f) =>
              submitReview({
                entryId: entry.id,
                scores: {
                  thought: Number(f.get("thought")),
                  evidence: Number(f.get("evidence")),
                  structure: Number(f.get("structure")),
                  expression: Number(f.get("expression")),
                },
                comment: String(f.get("comment")),
              })
            }
            submitLabel="심사 저장"
          >
            <div className="score-grid">
              {[
                { key: "thought", label: "생각", max: 30 },
                { key: "evidence", label: "근거", max: 30 },
                { key: "structure", label: "구성", max: 25 },
                { key: "expression", label: "표현", max: 15 },
              ].map((r) => (
                <div className="field" key={r.key}>
                  <label htmlFor={`score-${r.key}`}>
                    {r.label} / {r.max}점
                  </label>
                  <input
                    id={`score-${r.key}`}
                    name={r.key}
                    type="number"
                    min={0}
                    max={r.max}
                    step={1}
                    required
                  />
                </div>
              ))}
            </div>
            <div className="field">
              <label htmlFor="judge-comment">학생에게 전할 심사 의견</label>
              <textarea
                id="judge-comment"
                name="comment"
                required
                maxLength={2000}
                rows={4}
              />
            </div>
          </Form>
        )}
      </div>
    </div>
  );
}
