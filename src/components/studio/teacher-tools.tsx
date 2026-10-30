"use client";
import { useState } from "react";
import { missions, themes } from "@/lib/missions";
import {
  enterDemo,
  escapeHtml,
  judgeDemo,
  portfolioHtml,
  printableHtml,
  publishDemo,
  rubric,
  templateSchema,
  type LocalTemplate,
} from "@/lib/studio";
import { downloadHtml, Field, Panel, type ToolProps } from "./shared";

export function MissionMaker({ state, update }: ToolProps) {
  const [source, setSource] = useState(missions[0].id);
  const d = state.templateDraft;
  const edit = <K extends keyof LocalTemplate>(
    key: K,
    value: LocalTemplate[K],
  ) =>
    update((s) => ({
      ...s,
      templateDraft: { ...s.templateDraft, [key]: value },
    }));
  function save() {
    update((s) => {
      const parsed = templateSchema.safeParse({
        ...s.templateDraft,
        id:
          s.templateDraft.id === "draft"
            ? crypto.randomUUID()
            : s.templateDraft.id,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      if (
        s.templates.length >= 30 &&
        !s.templates.some((t) => t.id === parsed.data.id)
      )
        throw new Error(
          "미션 보관함이 가득 찼어요. 활동지를 내려받아 보관해 주세요.",
        );
      return {
        ...s,
        templateDraft: parsed.data,
        templates: [
          ...s.templates.filter((t) => t.id !== parsed.data.id),
          parsed.data,
        ],
      };
    }, "미션을 이 브라우저의 미션 보관함에 저장했어요.");
  }
  return (
    <div className="studio-two-col">
      <Panel
        title="선생님 미션 제작실"
        intro="기존 미션을 복제하거나 새 질문을 만들어 보세요. 실제 학급 배정은 계정 연결 후 제공됩니다."
      >
        <label className="studio-field">
          <span>복제할 기본 미션</span>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button button-outline"
          onClick={() =>
            update((s) => {
              const m = missions.find((m) => m.id === source)!;
              return {
                ...s,
                templateDraft: {
                  id: "draft",
                  title: `${m.title} (복제)`.slice(0, 100),
                  theme: m.theme,
                  grade: m.grade_band,
                  kind: m.kind,
                  prompt: m.prompt,
                  steps: m.steps.join("\n"),
                  criteria:
                    "내 생각을 표현했는가?\n책 속 장면이나 까닭을 연결했는가?\n고친 과정을 설명할 수 있는가?",
                },
              };
            }, "기본 미션을 복제했어요. 아래 내용을 고쳐 보세요.")
          }
        >
          편집기에 복제하기
        </button>
        <Field
          label="새 미션 제목"
          value={d.title}
          onChange={(v) => edit("title", v)}
        />
        <div className="studio-two-col">
          <label className="studio-field">
            <span>새 미션 주제</span>
            <select
              value={d.theme}
              onChange={(e) =>
                edit("theme", e.target.value as LocalTemplate["theme"])
              }
            >
              {Object.entries(themes).map(([id, t]) => (
                <option key={id} value={id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="studio-field">
            <span>새 미션 학년</span>
            <select
              value={d.grade}
              onChange={(e) =>
                edit("grade", e.target.value as LocalTemplate["grade"])
              }
            >
              <option value="3-4">3–4학년</option>
              <option value="5-6">5–6학년</option>
            </select>
          </label>
        </div>
        <label className="studio-field">
          <span>새 미션 활동 유형</span>
          <select
            value={d.kind}
            onChange={(e) =>
              edit("kind", e.target.value as LocalTemplate["kind"])
            }
          >
            <option value="question">질문 만들기</option>
            <option value="writing">생각 쓰기</option>
            <option value="revision">고쳐 쓰기</option>
          </select>
        </label>
        <Field
          label="새 미션 생각 질문"
          value={d.prompt}
          area
          max={1500}
          onChange={(v) => edit("prompt", v)}
        />
        <Field
          label="새 미션 활동 순서"
          value={d.steps}
          area
          max={2000}
          onChange={(v) => edit("steps", v)}
          hint="한 줄에 한 단계씩 적어 주세요."
        />
        <Field
          label="새 미션 살펴볼 기준"
          value={d.criteria}
          area
          max={1500}
          onChange={(v) => edit("criteria", v)}
        />
        <button className="button button-primary" onClick={save}>
          나의 미션 저장하기
        </button>
        <h3 className="studio-subtitle">
          나의 미션 보관함 · {state.templates.length}개
        </h3>
        {state.templates.map((t) => (
          <button
            key={t.id}
            className="template-item"
            onClick={() =>
              update(
                (s) => ({ ...s, templateDraft: t }),
                "저장한 미션을 편집기에 불러왔어요.",
              )
            }
          >
            {t.title}
            <span>{t.grade}학년 · 다시 편집</span>
          </button>
        ))}
      </Panel>
      <Panel title="학생 화면 미리보기">
        <article className="studio-paper">
          <span className="eyebrow">
            {themes[d.theme].label} · {d.grade}학년
          </span>
          <h3>{d.title || "미션 제목"}</h3>
          <p>{d.prompt || "미션의 생각 질문이 여기에 보여요."}</p>
          <h4>활동 순서</h4>
          <ol>
            {d.steps
              .split("\n")
              .filter(Boolean)
              .map((step, n) => (
                <li key={n}>{step}</li>
              ))}
          </ol>
          <h4>함께 살펴볼 기준</h4>
          <p className="studio-writing">{d.criteria}</p>
        </article>
        <button
          className="button button-outline"
          disabled={!templateSchema.safeParse(d).success}
          onClick={() =>
            downloadHtml(
              "책숲-독서미션-활동지.html",
              printableHtml(
                d.title,
                `<h1>${escapeHtml(d.title)}</h1><p>${escapeHtml(themes[d.theme].label)} · ${escapeHtml(d.grade)}학년</p><h2>생각 질문</h2><p>${escapeHtml(d.prompt)}</p><h2>활동 순서</h2><p>${escapeHtml(d.steps)}</p><h2>생각을 펼쳐 보세요</h2><p>________________________________________________________________<br><br>________________________________________________________________<br><br>________________________________________________________________</p><h2>함께 살펴볼 기준</h2><p>${escapeHtml(d.criteria)}</p>`,
              ),
            )
          }
        >
          인쇄용 활동지 내려받기
        </button>
        <p className="form-help">
          내려받은 HTML 파일을 열고 브라우저에서 인쇄하거나 PDF로 저장할 수
          있어요.
        </p>
      </Panel>
    </div>
  );
}

export function FestivalWorkshop({ state, update, go }: ToolProps) {
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [sourceId, setSourceId] = useState("");
  const [checks, setChecks] = useState([false, false, false, false]);
  const [optIn, setOptIn] = useState(false);
  const [scores, setScores] = useState({
    thought: 0,
    evidence: 0,
    structure: 0,
    expression: 0,
  });
  const [comment, setComment] = useState("");
  const completed = state.demo.versions.filter((v) => v.status === "completed");
  const selected = completed.find((v) => v.id === sourceId) ?? completed.at(-1);
  const entry = state.demo.entry;
  return (
    <>
      <div className="studio-role">
        <button
          className={`button ${role === "student" ? "button-primary" : "button-outline"}`}
          aria-pressed={role === "student"}
          onClick={() => setRole("student")}
        >
          출품하는 학생
        </button>
        <button
          className={`button ${role === "teacher" ? "button-primary" : "button-outline"}`}
          aria-pressed={role === "teacher"}
          onClick={() => setRole("teacher")}
        >
          심사하는 선생님
        </button>
        <span>우리 반 글쓰기 축제 · 체험 대회</span>
      </div>
      {role === "student" ? (
        <div className="studio-two-col">
          <Panel
            title="출품 전 나의 글 살피기"
            intro="완료된 글을 골라 네 가지 기준으로 읽어 보세요. 점검은 자동 채점이 아니에요."
          >
            {!completed.length ? (
              <div className="empty-state">
                <p>체험 교실에서 미션을 완료하면 작품을 고를 수 있어요.</p>
                <button
                  className="button button-primary"
                  onClick={() => go("classroom")}
                >
                  체험 미션 이어가기
                </button>
              </div>
            ) : (
              <>
                <label className="studio-field">
                  <span>출품할 완료 작품</span>
                  <select
                    value={selected?.id ?? ""}
                    disabled={Boolean(entry)}
                    onChange={(e) => {
                      setSourceId(e.target.value);
                      setChecks([false, false, false, false]);
                      setOptIn(false);
                    }}
                  >
                    {completed.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.version}번째 글 · {v.title}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="rubric-checks" disabled={Boolean(entry)}>
                  <legend>내가 직접 읽고 점검해요</legend>
                  {rubric.map((r, index) => (
                    <label key={r.key}>
                      <input
                        type="checkbox"
                        checked={checks[index]}
                        onChange={(e) =>
                          setChecks((c) =>
                            c.map((v, n) =>
                              n === index ? e.target.checked : v,
                            ),
                          )
                        }
                      />
                      <span>
                        <strong>{r.label}</strong>
                        <small>
                          {r.help} · 심사 기준 {r.max}점
                        </small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <label className="studio-checkbox">
                  <input
                    type="checkbox"
                    disabled={Boolean(entry)}
                    checked={optIn}
                    onChange={(e) => setOptIn(e.target.checked)}
                  />
                  선택한 글을 체험 대회에 출품할게요. 접수본은 이 브라우저에
                  고정돼요.
                </label>
                <button
                  className="button button-primary"
                  disabled={Boolean(entry) || !checks.every(Boolean) || !optIn}
                  onClick={() =>
                    update(
                      (s) =>
                        enterDemo(
                          s,
                          selected!.id,
                          checks,
                          optIn,
                          new Date().toISOString(),
                        ),
                      "체험 출품본을 고정했어요. 실제 대회나 외부에 전송되지 않았어요.",
                    )
                  }
                >
                  {entry ? "체험 접수 완료" : "최종 확인 후 체험 출품"}
                </button>
              </>
            )}
          </Panel>
          <Panel title={entry ? "확정된 체험 출품본" : "출품본 미리보기"}>
            {entry || selected ? (
              <article className="studio-paper">
                <h3>{(entry ?? selected)!.title}</h3>
                <p className="studio-writing">{(entry ?? selected)!.body}</p>
              </article>
            ) : (
              <p>완료한 작품을 선택해 주세요.</p>
            )}
            <p className="form-help">
              체험 접수본은 교체·철회 없이 한 번 보관해요. 이후 학습 초안을
              고쳐도 접수본은 바뀌지 않아요.
            </p>
            {entry?.published && (
              <div className="notice">
                <h3>체험 결과가 도착했어요</h3>
                <p>
                  기준표 점수:{" "}
                  {Object.values(entry.scores!).reduce((a, b) => a + b, 0)} /
                  100점
                </p>
                <p>{entry.comment}</p>
                <small>선생님 역할에서 직접 입력한 체험 결과입니다.</small>
              </div>
            )}
          </Panel>
        </div>
      ) : (
        <Panel
          title="기준표로 읽는 체험 심사"
          intro="순위를 매기기 전에 학생의 생각과 고친 과정을 읽어 주세요. 실제 대회 결과로 사용되지 않아요."
        >
          {!entry ? (
            <p className="empty-state">
              학생 역할에서 체험 출품을 먼저 해 주세요.
            </p>
          ) : (
            <>
              <h3>{entry.title}</h3>
              <p className="studio-writing">{entry.body}</p>
              {entry.scores ? (
                <div className="notice">
                  <p>
                    심사 확정 ·{" "}
                    {Object.values(entry.scores).reduce((a, b) => a + b, 0)} /
                    100점
                  </p>
                  <p>{entry.comment}</p>
                  <button
                    className="button button-primary"
                    disabled={entry.published}
                    onClick={() =>
                      update(
                        publishDemo,
                        "체험 결과를 발표했어요. 학생 역할에서 확인할 수 있어요.",
                      )
                    }
                  >
                    {entry.published
                      ? "체험 결과 발표됨"
                      : "체험 결과 발표하기"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="score-grid">
                    {rubric.map((r) => (
                      <label className="studio-field" key={r.key}>
                        <span>
                          {r.label} · {r.max}점 만점
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={r.max}
                          step={1}
                          value={scores[r.key]}
                          onChange={(e) =>
                            setScores((s) => ({
                              ...s,
                              [r.key]:
                                e.target.value === ""
                                  ? 0
                                  : Number(e.target.value),
                            }))
                          }
                        />
                        <small>{r.help}</small>
                      </label>
                    ))}
                  </div>
                  <Field
                    label="체험 심사 의견"
                    value={comment}
                    area
                    max={1500}
                    onChange={setComment}
                  />
                  <button
                    className="button button-primary"
                    onClick={() =>
                      update(
                        (s) => judgeDemo(s, scores, comment),
                        "체험 심사를 확정했어요. 결과를 발표해 주세요.",
                      )
                    }
                  >
                    체험 심사 확정
                  </button>
                </>
              )}
            </>
          )}
        </Panel>
      )}
    </>
  );
}

export function FirstPortfolio({ state, update }: ToolProps) {
  const p = state.portfolio;
  const selected = p.selected
    .map((id) => state.works.find((w) => w.id === id))
    .filter((w) => Boolean(w));
  const edit = (key: "title" | "author" | "note", value: string) =>
    update((s) => ({ ...s, portfolio: { ...s.portfolio, [key]: value } }));
  const move = (index: number, step: number) =>
    update((s) => {
      const ids = [...s.portfolio.selected];
      [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
      return { ...s, portfolio: { ...s.portfolio, selected: ids } };
    });
  return (
    <div className="studio-two-col">
      <Panel
        title="나의 첫 작가 작품집"
        intro="보관한 작품을 고르고 목차 순서를 정해요. 파일은 이 기기에 내려받아요."
      >
        <Field
          label="작품집 제목"
          value={p.title}
          onChange={(v) => edit("title", v)}
        />
        <Field
          label="작가 별명"
          value={p.author}
          onChange={(v) => edit("author", v)}
          hint="실명 대신 나만의 작가 별명을 써 보세요."
        />
        <Field
          label="작가의 말"
          value={p.note}
          area
          max={1500}
          onChange={(v) => edit("note", v)}
        />
        <fieldset className="portfolio-choices">
          <legend>담을 작품 고르기 · {state.works.length}편 보관 중</legend>
          {!state.works.length && (
            <p>
              생각 카드·인터뷰·선택의 마을에서 작품을 보관하거나 체험 미션을
              완료해 주세요.
            </p>
          )}
          {state.works.map((w) => (
            <label key={w.id}>
              <input
                type="checkbox"
                checked={p.selected.includes(w.id)}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    portfolio: {
                      ...s.portfolio,
                      selected: e.target.checked
                        ? [...new Set([...s.portfolio.selected, w.id])]
                        : s.portfolio.selected.filter((id) => id !== w.id),
                    },
                  }))
                }
              />
              {w.title}
              <small>
                {
                  {
                    writing: "고쳐 쓴 글",
                    interview: "인터뷰",
                    choice: "선택과 성찰",
                    cards: "생각 카드",
                  }[w.kind]
                }
              </small>
            </label>
          ))}
        </fieldset>
        <h3>목차 순서</h3>
        <ol className="portfolio-order">
          {selected.map((w, n) => (
            <li key={w!.id}>
              <span>{w!.title}</span>
              <button
                disabled={n === 0}
                aria-label={`${w!.title} 목차 위로`}
                onClick={() => move(n, -1)}
              >
                ↑
              </button>
              <button
                disabled={n === selected.length - 1}
                aria-label={`${w!.title} 목차 아래로`}
                onClick={() => move(n, 1)}
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
        <button
          className="button button-primary"
          disabled={!selected.length || !p.title.trim() || !p.author.trim()}
          onClick={() =>
            downloadHtml("책숲-나의-작품집.html", portfolioHtml(state))
          }
        >
          인쇄용 작품집 내려받기
        </button>
        <p className="form-help">
          HTML 파일을 열어 인쇄하거나 브라우저의 ‘PDF로 저장’을 이용하세요.
          초고·수정본과 고친 이유도 함께 담겨요.
        </p>
      </Panel>
      <Panel title="작품집 미리보기">
        <article className="portfolio-cover studio-paper">
          <span className="eyebrow">MY FIRST BOOK</span>
          <span aria-hidden="true">📖</span>
          <h3>{p.title}</h3>
          <p>{p.author} 지음</p>
          <p className="studio-writing">{p.note}</p>
        </article>
        <h3>목차</h3>
        <ol>
          {selected.map((w) => (
            <li key={w!.id}>{w!.title}</li>
          ))}
        </ol>
        {selected.map((w) => (
          <details key={w!.id} className="studio-history">
            <summary>{w!.title} · 펼쳐 읽기</summary>
            <p className="studio-writing">{w!.body}</p>
            {w!.original && w!.original !== w!.body && (
              <>
                <h4>처음 쓴 글</h4>
                <p className="studio-writing">{w!.original}</p>
              </>
            )}
            {w!.reason && <p>고친 이유: {w!.reason}</p>}
          </details>
        ))}
      </Panel>
    </div>
  );
}
