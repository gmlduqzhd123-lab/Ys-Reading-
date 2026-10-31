"use client";
import { useState } from "react";
export function GuidedThought({ initial = "" }: { initial?: string }) {
  const [mode, setMode] = useState(initial ? "free" : "line"),
    [thought, setThought] = useState(initial);
  const [scene, setScene] = useState(""),
    [feeling, setFeeling] = useState(""),
    [idea, setIdea] = useState("");
  return (
    <div className="guided-thought">
      <label className="field">
        작성 방법 선택
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="line">한 문장으로 시작</option>
          <option value="guided">질문 세 개로 생각 모으기</option>
          <option value="free">자유롭게 쓰기</option>
        </select>
      </label>
      {mode === "guided" && (
        <fieldset className="guided-prompts">
          <legend>나의 말로 먼저 메모해요</legend>
          <label className="field">
            기억나는 장면
            <input
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              maxLength={2000}
            />
          </label>
          <label className="field">
            그때 느낀 마음
            <input
              value={feeling}
              onChange={(e) => setFeeling(e.target.value)}
              maxLength={1000}
            />
          </label>
          <div className="feeling-choices" aria-label="마음 표현 도움말">
            {[
              "궁금했어요",
              "뭉클했어요",
              "놀랐어요",
              "답답했어요",
              "다르게 생각했어요",
            ].map((word) => (
              <button
                type="button"
                className="button button-outline"
                key={word}
                onClick={() => setFeeling(word)}
              >
                {word}
              </button>
            ))}
          </div>
          <label className="field">
            내가 하고 싶은 생각
            <input
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              maxLength={2000}
            />
          </label>
          <button
            type="button"
            className="button button-outline"
            disabled={![scene, feeling, idea].some((s) => s.trim())}
            onClick={() => {
              const lines = [
                scene && "기억나는 장면: " + scene,
                feeling && "그때의 마음: " + feeling,
                idea && "나의 생각: " + idea,
              ]
                .filter(Boolean)
                .join("\n");
              if (thought.length + lines.length + 2 <= 10000) {
                setThought((old) => (old ? old + "\n\n" + lines : lines));
                setScene("");
                setFeeling("");
                setIdea("");
              }
            }}
          >
            도움 메모를 나의 기록에 담기
          </button>
        </fieldset>
      )}
      <label className="field">
        기억에 남는 장면과 나의 생각
        <textarea
          name="thought"
          value={thought}
          onChange={(e) => setThought(e.target.value)}
          required
          maxLength={10000}
          rows={mode === "line" ? 2 : 6}
          placeholder={
            mode === "line" ? "나는 이 장면에서 …라고 생각했어요." : ""
          }
        />
      </label>
      <p className="form-help">
        {mode === "line"
          ? "한 문장도 괜찮아요. 나중에 생각을 덧붙일 수 있어요."
          : "도움 질문은 생각을 꺼내는 도구예요. 내 경험과 표현으로 자유롭게 써 보세요."}{" "}
        작성 방법을 바꿔도 입력한 기록은 유지됩니다.
      </p>
    </div>
  );
}
