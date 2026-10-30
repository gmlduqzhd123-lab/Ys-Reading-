"use client";
import { useState } from "react";
import { cardLabels, cardsBody, keepWork, scenarios } from "@/lib/studio";
import { Field, Panel, type ToolProps } from "./shared";

export function WritingCards({ state, update, go }: ToolProps) {
  const ready = Object.values(state.cards.answers).every((v) => v.trim());
  const move = (index: number, step: number) =>
    update((s) => {
      const order = [...s.cards.order];
      [order[index], order[index + step]] = [order[index + step], order[index]];
      return { ...s, cards: { ...s.cards, order } };
    });
  return (
    <div className="studio-two-col">
      <Panel
        title="생각을 꺼내는 네 장의 카드"
        intro="짧게 적고 위·아래 버튼으로 순서를 바꿔 보세요. 정답 문장은 없어요."
      >
        {state.cards.order.map((id, index) => (
          <div className="thinking-card" key={id}>
            <div className="card-order">
              <strong>{index + 1}번째 카드</strong>
              <div>
                <button
                  aria-label={`${cardLabels[id]} 위로`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={`${cardLabels[id]} 아래로`}
                  disabled={index === 3}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
              </div>
            </div>
            <Field
              label={cardLabels[id]}
              area
              max={2000}
              rows={3}
              value={state.cards.answers[id]}
              onChange={(value) =>
                update((s) => ({
                  ...s,
                  cards: {
                    ...s.cards,
                    answers: { ...s.cards.answers, [id]: value },
                  },
                }))
              }
            />
          </div>
        ))}
      </Panel>
      <Panel
        title="나의 글 뼈대"
        intro="카드 내용이 선택한 순서로 모여요. 이어 쓰면서 연결 문장을 보태 보세요."
      >
        <div className="studio-paper">
          <p className="studio-writing">{cardsBody(state)}</p>
        </div>
        <div className="button-row">
          <button
            className="button button-primary"
            disabled={!ready}
            onClick={() =>
              update(
                (s) =>
                  keepWork(s, {
                    id: "cards",
                    kind: "cards",
                    title: "네 장의 생각 카드",
                    body: cardsBody(s),
                    original: "",
                    reason: "",
                    at: new Date().toISOString(),
                  }),
                "생각 카드를 작품 보관함에 넣었어요. 생각나무에 꽃 장식이 열렸어요.",
              )
            }
          >
            카드 작품 보관하기
          </button>
          <button
            className="button button-outline"
            disabled={!ready || !state.demo.assigned}
            onClick={() => {
              if (
                update((s) => {
                  const body = [s.demo.body, cardsBody(s)]
                    .filter(Boolean)
                    .join("\n\n");
                  if (body.length > 10000)
                    throw new Error(
                      "합친 글이 10,000자를 넘어요. 초안을 먼저 다듬어 주세요.",
                    );
                  return { ...s, demo: { ...s.demo, body } };
                }, "체험 초안 끝에 생각 카드를 덧붙였어요.")
              )
                go("classroom");
            }}
          >
            체험 초안에 덧붙이기
          </button>
        </div>
        {!state.demo.assigned && (
          <p className="form-help">
            초안으로 이어 쓰려면 체험 교실에서 미션을 먼저 배정해 주세요.
          </p>
        )}
        {!ready && (
          <p className="form-help">
            네 장에 생각을 한 가지씩 적으면 작품으로 보관할 수 있어요.
          </p>
        )}
      </Panel>
    </div>
  );
}

export function CharacterInterview({ state, update }: ToolProps) {
  const i = state.interview;
  const set = (key: "book" | "character", value: string) =>
    update((s) => ({ ...s, interview: { ...s.interview, [key]: value } }));
  const setQuestion = (
    index: number,
    key: "question" | "answer" | "evidence",
    value: string,
  ) =>
    update((s) => ({
      ...s,
      interview: {
        ...s.interview,
        questions: s.interview.questions.map((q, n) =>
          n === index ? { ...q, [key]: value } : q,
        ),
      },
    }));
  const ready =
    i.book.trim() &&
    i.character.trim() &&
    i.questions.every(
      (q) => q.question.trim() && q.answer.trim() && q.evidence.trim(),
    );
  const article = `읽은 책: ${i.book}\n인터뷰한 인물: ${i.character}\n\n${i.questions.map((q, n) => `질문 ${n + 1}. ${q.question}\n상상한 답변: ${q.answer}\n책에서 찾은 근거: ${q.evidence}`).join("\n\n")}\n\n※ 인물의 답변은 책의 장면을 바탕으로 내가 상상한 내용입니다.`;
  return (
    <div className="studio-two-col">
      <Panel
        title="책 속 인물에게 묻기"
        intro="내가 기자라면? 인물에게 세 가지 질문을 하고 책의 장면을 바탕으로 답을 상상해요."
      >
        <Field
          label="인터뷰할 책 제목"
          value={i.book}
          onChange={(v) => set("book", v)}
        />
        <Field
          label="인터뷰할 인물"
          value={i.character}
          onChange={(v) => set("character", v)}
        />
        {i.questions.map((q, index) => (
          <fieldset className="interview-question" key={index}>
            <legend>질문 {index + 1}</legend>
            <Field
              label={`${index + 1}번째 질문`}
              value={q.question}
              max={300}
              onChange={(v) => setQuestion(index, "question", v)}
            />
            <Field
              label={`${index + 1}번째 상상한 답변`}
              value={q.answer}
              area
              max={1500}
              onChange={(v) => setQuestion(index, "answer", v)}
            />
            <Field
              label={`${index + 1}번째 답변의 책 속 근거`}
              value={q.evidence}
              area
              max={1000}
              rows={2}
              onChange={(v) => setQuestion(index, "evidence", v)}
              hint="페이지나 장면을 적고 내 말로 설명해 주세요."
            />
          </fieldset>
        ))}
      </Panel>
      <Panel
        title="책숲 어린이 신문"
        intro="답변은 자동 생성되지 않아요. 내가 쓴 질문·상상·근거로 인터뷰 기사가 만들어져요."
      >
        <article className="studio-paper newspaper">
          <span className="eyebrow">BOOKFOREST TIMES</span>
          <h3>{i.character || "책 속 인물"}을 만나다</h3>
          <p className="studio-writing">{article}</p>
        </article>
        <button
          className="button button-primary"
          disabled={!ready}
          onClick={() =>
            update(
              (s) =>
                keepWork(s, {
                  id: "interview",
                  kind: "interview",
                  title: `${s.interview.character}을 만나다`.slice(0, 100),
                  body: article,
                  original: "",
                  reason: "",
                  at: new Date().toISOString(),
                }),
              "인터뷰 기사를 보관했어요. 생각나무에 새 장식이 열렸어요.",
            )
          }
        >
          인터뷰 기사 보관하기
        </button>
      </Panel>
    </div>
  );
}

export function ChoiceVillage({ state, update }: ToolProps) {
  const [scenarioId, setScenarioId] = useState<string>(scenarios[0].id);
  const scenario = scenarios.find((s) => s.id === scenarioId)!;
  const answer = state.choices[scenarioId] ?? {
    choice: "",
    reason: "",
    reflection: "",
  };
  const selectedIndex = scenario.options.findIndex((o) => o === answer.choice);
  const edit = (key: "choice" | "reason" | "reflection", value: string) =>
    update((s) => ({
      ...s,
      choices: {
        ...s.choices,
        [scenarioId]: {
          ...(s.choices[scenarioId] ?? {
            choice: "",
            reason: "",
            reflection: "",
          }),
          [key]: value,
          ...(key === "choice" ? { reflection: "" } : {}),
        },
      },
    }));
  return (
    <Panel
      title="선택의 마을"
      intro="선택의 점수나 정답은 없어요. 내 선택이 다른 사람에게 어떤 영향을 주는지 살펴봐요."
    >
      <label className="studio-field">
        <span>생각해 볼 상황</span>
        <select
          value={scenarioId}
          onChange={(e) => setScenarioId(e.target.value)}
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <div className="scenario-scene">
        <span aria-hidden="true">🌱</span>
        <h3>{scenario.title}</h3>
        <p>{scenario.scene}</p>
      </div>
      <fieldset className="choice-options">
        <legend>나라면 어떻게 할까요?</legend>
        {scenario.options.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="village-choice"
              checked={answer.choice === option}
              onChange={() => edit("choice", option)}
            />
            {option}
          </label>
        ))}
      </fieldset>
      <Field
        label="내가 이 방법을 고른 까닭"
        value={answer.reason}
        area
        max={1500}
        onChange={(v) => edit("reason", v)}
      />
      {selectedIndex >= 0 && answer.reason.trim() && (
        <div className="choice-consequence">
          <h3>선택 이후의 이야기</h3>
          <p>{scenario.after[selectedIndex]}</p>
          <Field
            label="다른 입장도 생각한 뒤 보태고 싶은 점"
            value={answer.reflection}
            area
            max={1500}
            onChange={(v) => edit("reflection", v)}
          />
        </div>
      )}
      <button
        className="button button-primary"
        disabled={
          selectedIndex < 0 ||
          !answer.reason.trim() ||
          !answer.reflection.trim()
        }
        onClick={() =>
          update(
            (s) =>
              keepWork(s, {
                id: `choice:${scenarioId}`,
                kind: "choice",
                title: scenario.title,
                body: `${scenario.scene}\n\n나의 선택: ${answer.choice}\n까닭: ${answer.reason}\n\n선택 이후: ${scenario.after[selectedIndex]}\n다시 생각한 점: ${answer.reflection}`,
                original: "",
                reason: "",
                at: new Date().toISOString(),
              }),
            "다른 입장까지 생각한 기록을 보관했어요. 모험 지도에 반영했어요.",
          )
        }
      >
        나의 선택과 성찰 보관하기
      </button>
    </Panel>
  );
}
