"use client";
import { useState } from "react";
import { GrowthTermForm } from "./growth-term-form";
import type { TermState, TermClass } from "@/lib/growth-terms";
import type { OperationsState } from "@/lib/operations";
export interface HandoverState {
  operator: boolean;
  requests: {
    id: string;
    classroom_id: string;
    name: string;
    note: string;
    status: string;
    current_teacher: string;
    own_request: boolean;
    created_at: string;
  }[];
}
export function TermBulkStart({
  state,
  cls,
}: {
  state: TermState;
  cls: TermClass;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [notice, setNotice] = useState("");
  const ready = state.roster.filter(
    (s) =>
      s.membership_id &&
      !(s.active && s.confirmed) &&
      s.consent_ready &&
      s.account_active &&
      !s.deletion_pending,
  );
  return (
    <section className="panel">
      <h3>승인된 학생 함께 시작하기</h3>
      <p>
        이 학급의 참여 동의가 승인된 학생만 선택할 수 있습니다. 자료 승인을
        대신하지 않으며, 한 명의 조건이 바뀌면 선택한 묶음 전체를 시작하지
        않습니다.
      </p>
      {ready.map((s) => (
        <label key={s.student_id} className="term-check">
          <input
            type="checkbox"
            checked={selected.includes(s.membership_id!)}
            onChange={(e) =>
              setSelected((v) =>
                e.target.checked
                  ? [...v, s.membership_id!]
                  : v.filter((id) => id !== s.membership_id),
              )
            }
          />
          {s.display_name} · 동의 승인 완료
        </label>
      ))}
      {!ready.length && <p>현재 묶음에 시작할 수 있는 학생이 없어요.</p>}
      <GrowthTermForm
        key={selected.join(",")}
        command="activate_batch"
        payload={() => ({ classroomId: cls.id, ids: selected })}
        label={`선택한 ${selected.length}명 참여 시작`}
        disabled={!selected.length}
        onSuccess={() => {
          setNotice(`${selected.length}명의 참여를 시작했어요.`);
          setSelected([]);
        }}
      />
      <p role="status">{notice}</p>
    </section>
  );
}
export function ConsentBatch({ state }: { state: OperationsState }) {
  const [selected, setSelected] = useState<string[]>([]),
    [notice, setNotice] = useState("");
  if (!state.operator) return null;
  const pending = state.consents.filter((c) => c.status === "pending");
  return (
    <details className="panel">
      <summary>자료를 확인한 동의 요청 함께 승인</summary>
      <p>
        각 요청의 자료를 직접 확인한 항목만 선택해 주세요. 학생을 자동으로
        학급에 참여시키지는 않습니다.
      </p>
      {pending.map((c) => (
        <label className="term-check" key={c.id}>
          <input
            type="checkbox"
            checked={selected.includes(c.id)}
            disabled={!selected.includes(c.id) && selected.length >= 100}
            onChange={(e) =>
              setSelected((v) =>
                e.target.checked ? [...v, c.id] : v.filter((id) => id !== c.id),
              )
            }
          />
          <span>
            {state.students.find((s) => s.id === c.student_id)?.display_name ??
              c.student_name ??
              "학생"}{" "}
            ·{" "}
            {state.classes.find((x) => x.id === c.classroom_id)?.name ??
              c.classroom_name}{" "}
            · {c.reference} · 확인일 {c.confirmed_on}
          </span>
        </label>
      ))}
      {!pending.length && <p>승인 대기 요청이 없어요.</p>}
      <GrowthTermForm
        key={selected.join(",")}
        command="consent_batch"
        payload={() => ({ ids: selected, evidenceChecked: true })}
        disabled={!selected.length}
        label={`자료 확인한 ${selected.length}건 승인`}
        onSuccess={() => {
          setNotice(`${selected.length}건을 승인했어요.`);
          setSelected([]);
        }}
      />
      <p role="status">{notice}</p>
    </details>
  );
}
export function HandoverPanel({
  state,
  classes,
  teachers = [],
}: {
  state: HandoverState;
  classes: { id: string; name: string }[];
  teachers?: { id: string; display_name: string; account_active: boolean }[];
}) {
  return (
    <section className="panel">
      <h2>담임 인계 진행</h2>
      <p>
        담당 교사가 인계를 요청하면 운영자가 다음 담당 교사를 확인해 인계합니다.
        이전 학급의 글과 새 학급의 계정 복구 권한은 각각의 담당 학급에
        유지됩니다.
      </p>
      {!state.operator && !!classes.length && (
        <GrowthTermForm
          command="handover_request"
          payload={(f) => ({
            classroomId: String(f.get("classroomId")),
            note: String(f.get("note")),
          })}
          label="운영자에게 담임 인계 요청"
        >
          <label className="field">
            인계할 학급
            <select name="classroomId">
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            운영자에게 남길 안내
            <input
              name="note"
              required
              maxLength={200}
              placeholder="예: 새 학급을 준비했습니다. 다음 담임을 확인해 주세요."
            />
          </label>
          <small>학생 이름·연락처를 입력하지 마세요.</small>
        </GrowthTermForm>
      )}
      {state.requests.map((r) => (
        <article className="hub-record" key={r.id}>
          <strong>{r.name}</strong>
          <p>
            {
              {
                pending: "운영자 인계 확인 대기",
                completed: "인계 완료",
                cancelled: "요청 종료",
              }[r.status]
            }{" "}
            · 현재 담당: {r.current_teacher}
          </p>
          <p>{r.note}</p>
          {state.operator && r.status === "pending" && (
            <GrowthTermForm
              command="handover_accept"
              payload={(f) => ({
                id: r.id,
                teacherId: String(f.get("teacherId")),
              })}
              label="확인한 다음 담임에게 인계"
            >
              <label className="field">
                다음 담당 교사
                <select name="teacherId" required>
                  <option value="">담당자를 선택해 주세요</option>
                  {teachers
                    .filter((t) => t.account_active)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.display_name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="term-check">
                <input type="checkbox" required />
                인계할 학급과 다음 담임을 확인했습니다.
              </label>
            </GrowthTermForm>
          )}
        </article>
      ))}
      {!state.requests.length && <p>담임 인계 요청이 없어요.</p>}
    </section>
  );
}
