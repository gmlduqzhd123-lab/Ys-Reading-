"use client";
import type { Assignment } from "@/lib/data";
import { missionDisplayTitle } from "@/lib/participation";
import { ParticipationForm, value } from "./form";
export function MissionChoicePicker({
  assignment,
}: {
  assignment: Assignment;
}) {
  return (
    <section className="panel choice-picker">
      <span className="eyebrow">MY WAY TO EXPRESS</span>
      <h1>어떤 방법으로 표현할까요?</h1>
      <h2>{missionDisplayTitle(assignment)}</h2>
      <p>
        내가 읽은 책에서 기억에 남는 장면을 골라 보세요. 원하는 표현 방법으로 내
        생각과 그 이유를 담아 봅시다.
      </p>
      <ParticipationForm
        command="choose_mission"
        payload={(fd) => ({ id: assignment.id, key: value(fd, "choice") })}
        label="이 방법으로 글쓰기 시작"
      >
        {assignment.choices?.map((choice) => (
          <label className="choice-card" key={choice.key}>
            <input type="radio" name="choice" value={choice.key} required />
            <span>
              <strong>{choice.label}</strong>
              <span>{choice.prompt}</span>
            </span>
          </label>
        ))}
        <p>
          글쓰기를 시작하면 선택이 보존됩니다. 선생님은 세 방법 모두 같은 미션의
          생각 표현으로 확인해요.
        </p>
      </ParticipationForm>
    </section>
  );
}
