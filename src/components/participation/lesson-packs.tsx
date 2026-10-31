"use client";
import { useState } from "react";
import type { HubData } from "@/lib/hub-data";
import type { ParticipationData, LessonPack } from "@/lib/participation";
import { responseChoices, feedbackStarters } from "@/lib/participation";
import { missions, themes } from "@/lib/missions";
import { ClassField, Field, Panel } from "@/components/hub/shared";
import { ParticipationForm, TextArea, value } from "./form";
export function LessonPacks({
  hub,
  extra,
}: {
  hub: HubData;
  extra: ParticipationData;
}) {
  const [grade, setGrade] = useState(""),
    [theme, setTheme] = useState(""),
    [query, setQuery] = useState("");
  if (hub.profile.role !== "teacher") return null;
  const packs = extra.packs.filter(
    (p) =>
      (!grade || p.grade_band === grade) &&
      (!theme || p.theme === theme) &&
      (p.title + " " + p.description).includes(query),
  );
  return (
    <>
      <Panel title="선생님들의 수업 꾸러미">
        <p>
          선택형 미션·활동 확인 기준·피드백 문구·공동 목표를 묶었습니다. 복제한
          꾸러미는 내 계정의 사본이 되고, 학급에 배부하면 학생의 미션과 교사의
          문구·공동 목표가 함께 준비돼요.
        </p>
        <div className="hub-inline">
          <label className="field">
            학년군
            <select value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">모든 학년</option>
              <option value="3-4">3~4학년</option>
              <option value="5-6">5~6학년</option>
            </select>
          </label>
          <label className="field">
            주제
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="">모든 주제</option>
              {Object.entries(themes).map(([id, t]) => (
                <option value={id} key={id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            꾸러미 이름·설명 검색
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={80}
            />
          </label>
        </div>
        {!packs.length && (
          <p>
            조건에 맞는 꾸러미가 없어요. 아래에서 우리 반 수업 꾸러미를 만들어
            보세요.
          </p>
        )}
        {packs.map((p) => (
          <article className="lesson-pack" key={p.id}>
            <small>
              {p.grade_band}학년 ·{" "}
              {themes[p.theme as keyof typeof themes]?.label} ·{" "}
              {p.teacher_id === hub.profile.id
                ? p.source_id
                  ? "내가 복제한 꾸러미"
                  : "내 꾸러미"
                : "다른 선생님의 공유 꾸러미"}{" "}
              · {p.published ? "교사들과 공유 중" : "내 계정에 보관"}
            </small>
            <h3>{p.title}</h3>
            <p>{p.description}</p>
            <details>
              <summary>미션·기준·피드백 살펴보기</summary>
              <p>
                {missions.find((m) => m.id === p.mission_id)?.title ??
                  "독서미션"}
              </p>
              <ul>
                {p.choices.map((c) => (
                  <li key={c.key}>
                    <strong>{c.label}</strong> · {c.prompt}
                  </li>
                ))}
              </ul>
              <h4>활동 확인 기준</h4>
              <p className="submission-body">{p.criteria}</p>
              <h4>피드백 시작 문구</h4>
              <p>{p.feedback}</p>
              <p>
                함께 모을 미션 완료 {p.goal_target}회 · 배부 후 30일 공동 목표
              </p>
            </details>
            <ParticipationForm
              command="pack_clone"
              label="내 꾸러미로 복제"
              payload={() => ({ id: p.id })}
            />
            {p.teacher_id === hub.profile.id && (
              <>
                <ParticipationForm
                  command="pack_visibility"
                  label={
                    p.published
                      ? "다른 교사에게 공유 중지"
                      : "다른 교사에게 공유하기"
                  }
                  payload={() => ({ id: p.id, published: !p.published })}
                />
                <details>
                  <summary>내 꾸러미 수정</summary>
                  <PackEdit pack={p} />
                </details>
              </>
            )}
            {hub.classes.length > 0 && (
              <ParticipationForm
                command="pack_assign"
                label="이 학급에 꾸러미 배부"
                payload={(fd) => ({
                  id: p.id,
                  classroomId: value(fd, "classroomId"),
                })}
              >
                <ClassField classes={hub.classes} />
              </ParticipationForm>
            )}
          </article>
        ))}
        <p className="form-help">
          최근 접근 가능한 꾸러미 100개 안에서 찾습니다. 꾸러미에는 학생
          계정·글·피드백 기록이 포함되지 않습니다.
        </p>
      </Panel>
      <details className="panel">
        <summary>내 수업 꾸러미 만들기</summary>
        <ParticipationForm
          command="pack_save"
          label="수업 꾸러미 저장"
          payload={(fd) => ({
            title: value(fd, "title"),
            description: value(fd, "description"),
            missionId: value(fd, "missionId"),
            choices: responseChoices,
            feedback: value(fd, "feedback"),
            criteria: value(fd, "criteria"),
            goalTarget: Number(value(fd, "goalTarget")),
            published: fd.get("published") === "on",
          })}
        >
          <Field name="title" label="꾸러미 이름" maxLength={80} />
          <TextArea
            name="description"
            label="수업의 목적과 사용 방법"
            maxLength={1000}
          />
          <label className="field">
            기본 독서미션
            <select name="missionId" required>
              {missions
                .filter((m) => m.kind === "writing")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.grade_band}학년 · {m.title}
                  </option>
                ))}
            </select>
          </label>
          <p>
            표현 방법은 인물에게 편지·새 결말·질문 세우기 세 가지를 제공합니다.
          </p>
          <TextArea
            name="criteria"
            label="학생과 공유할 활동 확인 기준"
            defaultValue="책 속 장면을 근거로 나의 생각을 표현했나요?\n다른 사람의 입장과 생각을 존중했나요?"
          />
          <TextArea
            name="feedback"
            label="교사용 피드백 시작 문구"
            defaultValue={feedbackStarters[0]}
          />
          <Field
            name="goalTarget"
            label="학급 공동 미션 완료 목표"
            type="number"
            min={1}
            max={1000}
            defaultValue={30}
          />
          <label className="hub-check">
            <input type="checkbox" name="published" />
            다른 승인된 선생님도 이 꾸러미를 보고 복제할 수 있게 공유합니다.
          </label>
          <p>공유할 설명·문구에 학생의 이름이나 실제 작품을 넣지 마세요.</p>
        </ParticipationForm>
      </details>
    </>
  );
}
function PackEdit({ pack }: { pack: LessonPack }) {
  return (
    <ParticipationForm
      command="pack_update"
      label="내 꾸러미 수정 저장"
      payload={(fd) => ({
        id: pack.id,
        title: value(fd, "title"),
        description: value(fd, "description"),
        missionId: value(fd, "missionId"),
        choices: pack.choices,
        feedback: value(fd, "feedback"),
        criteria: value(fd, "criteria"),
        goalTarget: Number(value(fd, "goalTarget")),
      })}
    >
      <Field
        name="title"
        label="꾸러미 이름"
        maxLength={80}
        defaultValue={pack.title}
      />
      <TextArea
        name="description"
        label="수업의 목적과 사용 방법"
        maxLength={1000}
        defaultValue={pack.description}
      />
      <label className="field">
        기본 독서미션
        <select name="missionId" required defaultValue={pack.mission_id}>
          {missions
            .filter((m) => m.kind === "writing")
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.grade_band}학년 · {m.title}
              </option>
            ))}
        </select>
      </label>
      <TextArea
        name="criteria"
        label="학생과 공유할 활동 확인 기준"
        defaultValue={pack.criteria}
      />
      <TextArea
        name="feedback"
        label="교사용 피드백 시작 문구"
        defaultValue={pack.feedback}
      />
      <Field
        name="goalTarget"
        label="학급 공동 미션 완료 목표"
        type="number"
        min={1}
        max={1000}
        defaultValue={pack.goal_target}
      />
      <p>
        수정은 앞으로 복제·배부할 꾸러미에 적용됩니다. 이미 배부한 미션과 학생의
        글은 바뀌지 않습니다.
      </p>
    </ParticipationForm>
  );
}
