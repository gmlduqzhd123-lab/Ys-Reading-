"use client";
import { useState,useId } from "react";
export type ThoughtMemo={mode:string;scene:string;feeling:string;idea:string};
export function GuidedThought({ initial = "",value,onChange,memo,onMemoChange }: { initial?: string;value?:string;onChange?:(value:string)=>void;memo?:ThoughtMemo;onMemoChange?:(value:ThoughtMemo)=>void }) {
  const thoughtId=useId();
  const [ownMode, setOwnMode] = useState(initial ? "free" : "line"),
    [ownThought, setOwnThought] = useState(initial);
  const thought=value??ownThought;
  const setThought=(next:string|((previous:string)=>string))=>{const text=typeof next==="function"?next(thought):next;setOwnThought(text);onChange?.(text);};
  const [ownScene, setOwnScene] = useState(""),
    [ownFeeling, setOwnFeeling] = useState(""),
    [ownIdea, setOwnIdea] = useState("");
  const mode=memo?.mode??ownMode,scene=memo?.scene??ownScene,feeling=memo?.feeling??ownFeeling,idea=memo?.idea??ownIdea;
  const updateMemo=(next:Partial<ThoughtMemo>)=>{const all={mode,scene,feeling,idea,...next};setOwnMode(all.mode);setOwnScene(all.scene);setOwnFeeling(all.feeling);setOwnIdea(all.idea);onMemoChange?.(all);};
  const setMode=(v:string)=>updateMemo({mode:v}),setScene=(v:string)=>updateMemo({scene:v}),setFeeling=(v:string)=>updateMemo({feeling:v}),setIdea=(v:string)=>updateMemo({idea:v});
  return (
    <div className="guided-thought">
      <label className="field">
        작성 방법 선택
        <select aria-label="작성 방법 선택" value={mode} onChange={(e) => setMode(e.target.value)}>
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
                updateMemo({scene:"",feeling:"",idea:""});
              }
            }}
          >
            도움 메모를 나의 기록에 담기
          </button>
        </fieldset>
      )}
      <div className="field">
        <label htmlFor={thoughtId}>기억에 남는 장면과 나의 생각</label>
        <textarea
          id={thoughtId}
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
      </div>
      <p className="form-help">
        {mode === "line"
          ? "한 문장도 괜찮아요. 나중에 생각을 덧붙일 수 있어요."
          : "도움 질문은 생각을 꺼내는 도구예요. 내 경험과 표현으로 자유롭게 써 보세요."}{" "}
        작성 방법을 바꿔도 입력한 기록은 유지됩니다.
      </p>
    </div>
  );
}
