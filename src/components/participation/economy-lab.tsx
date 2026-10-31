"use client";
import type { HubData } from "@/lib/hub-data";
import type { ParticipationData } from "@/lib/participation";
import { ClassField, Field, Panel } from "@/components/hub/shared";
import { ParticipationForm, TextArea, value } from "./form";
const jobStatus: Record<string, string> = {
  pending: "신청 확인 중",
  assigned: "역할 맡음",
  submitted: "완료 보고 확인 중",
  paid: "보수 지급 완료",
  declined: "이번 신청 마침",
};
export function EconomyLab({
  hub,
  extra,
}: {
  hub: HubData;
  extra: ParticipationData;
}) {
  const teacher = hub.profile.role === "teacher",
    currency = (cls: string) =>
      String(
        hub.settings.find((s) => s.classroom_id === cls)?.currency_name ??
          "책잎",
      );
  return (
    <div className="economy-lab">
      <Panel title="학급 직업 · 함께 운영하는 교실">
        <p>
          역할 신청 → 선생님 배정 → 학생 완료 보고 → 선생님 확인 후 학급 화폐를
          받아요. 독서 기록·미션 보상과 같은 지갑에 반영됩니다.
        </p>
        {!extra.jobs.length && <p>아직 모집 중인 학급 역할이 없습니다.</p>}
        {extra.jobs.map((j) => (
          <article className="participation-record" key={j.id}>
            <small>
              {hub.classes.find((c) => c.id === j.classroom_id)?.name}
            </small>
            <h3>{j.title}</h3>
            <p className="submission-body">{j.description}</p>
            <p>
              모집 {j.capacity}명 · 확인 후 {j.reward}{" "}
              {currency(j.classroom_id)}
            </p>
            {!j.active && <p className="status-pill">새 신청 마감</p>}
            {teacher && (
              <ParticipationForm
                command="job_toggle"
                label={j.active ? "새 신청 마감하기" : "새 신청 다시 열기"}
                payload={() => ({ id: j.id, active: !j.active })}
              />
            )}
            {!teacher &&
              !extra.applications.some(
                (a) => a.job_id === j.id && a.student_id === hub.profile.id,
              ) &&
              j.active && (
                <ParticipationForm
                  command="job_apply"
                  label="이 역할 신청"
                  payload={() => ({ id: j.id })}
                />
              )}
            {extra.applications
              .filter((a) => a.job_id === j.id)
              .map((a) => (
                <section key={a.id} className="job-application">
                  <p>
                    <strong>{teacher ? a.display_name : "나의 신청"}</strong> ·{" "}
                    {jobStatus[a.status]}
                  </p>
                  {a.report && <p className="submission-body">{a.report}</p>}
                  {teacher && a.status === "pending" && (
                    <div className="button-row">
                      <ParticipationForm
                        command="job_decide"
                        label="역할 맡기기"
                        payload={() => ({ id: a.id, approve: true })}
                      />
                      <ParticipationForm
                        command="job_decide"
                        label="이번 신청 마치기"
                        payload={() => ({ id: a.id, approve: false })}
                      />
                    </div>
                  )}
                  {!teacher && a.status === "assigned" && (
                    <ParticipationForm
                      command="job_report"
                      label="역할 완료 보고"
                      payload={(fd) => ({
                        id: a.id,
                        report: value(fd, "report"),
                      })}
                    >
                      <TextArea name="report" label="내가 한 일과 배운 점" />
                    </ParticipationForm>
                  )}
                  {teacher && a.status === "submitted" && (
                    <ParticipationForm
                      command="job_pay"
                      label="완료 확인·보수 지급"
                      payload={() => ({ id: a.id })}
                    />
                  )}
                </section>
              ))}
          </article>
        ))}
        {teacher && hub.classes.length > 0 && (
          <details>
            <summary>새 학급 역할 모집</summary>
            <ParticipationForm
              command="job_create"
              label="학급 역할 열기"
              payload={(fd) => ({
                classroomId: value(fd, "classroomId"),
                title: value(fd, "title"),
                description: value(fd, "description"),
                reward: Number(value(fd, "reward")),
                capacity: Number(value(fd, "capacity")),
              })}
            >
              <ClassField classes={hub.classes} />
              <Field
                label="역할 이름"
                name="title"
                maxLength={80}
                defaultValue="책 추천 도우미"
              />
              <TextArea
                name="description"
                label="할 일과 완료 확인 기준"
                defaultValue="친구들에게 소개할 책을 고르고, 추천 이유를 학급에서 나눠 주세요."
              />
              <Field
                label="완료 보수 · 학급 화폐"
                name="reward"
                type="number"
                min={1}
                max={1000}
                defaultValue={5}
              />
              <Field
                label="모집 인원"
                name="capacity"
                type="number"
                min={1}
                max={30}
                defaultValue={2}
              />
            </ParticipationForm>
          </details>
        )}
      </Panel>
      {!teacher && (
        <Panel title="나의 저축 목표">
          <p>
            현재 학급 지갑 잔액으로 목표 달성 정도를 살펴봐요. 별도 계좌로
            옮기는 기능은 아니며, 상품을 구매하면 달성률도 현재 잔액에 맞춰
            바뀝니다.
          </p>
          {extra.savings.map((s) => (
            <article key={s.id}>
              <h3>{s.title}</h3>
              <p>
                {hub.totals.balances[s.classroom_id] ?? 0} / {s.target}{" "}
                {currency(s.classroom_id)}
              </p>
              <progress
                aria-label={s.title + " 저축 목표"}
                max={s.target}
                value={Math.min(
                  s.target,
                  Math.max(0, hub.totals.balances[s.classroom_id] ?? 0),
                )}
              />
            </article>
          ))}
          {hub.classes.length > 0 && (
            <ParticipationForm
              command="saving_save"
              label="저축 목표 저장·변경"
              payload={(fd) => ({
                classroomId: value(fd, "classroomId"),
                title: value(fd, "title"),
                target: Number(value(fd, "target")),
              })}
            >
              <ClassField classes={hub.classes} />
              <Field label="모으고 싶은 목표" name="title" maxLength={80} />
              <Field
                label="목표 금액 · 학급 화폐"
                name="target"
                type="number"
                min={1}
                max={100000}
                defaultValue={30}
              />
            </ParticipationForm>
          )}
        </Panel>
      )}
      <Panel title="학생이 제안하는 학급 상점">
        <p>
          갖고 싶은 학급 활동권과 적절한 가격을 제안해요. 선생님이 가격·수량을
          확인해 승인하면 기존 상점에 상품이 열립니다.
        </p>
        {extra.proposals.map((p) => (
          <article className="participation-record" key={p.id}>
            <h3>{p.name}</h3>
            <p>{p.reason}</p>
            <p>
              제안 가격 {p.price} {currency(p.classroom_id)} ·{" "}
              {p.status === "pending"
                ? "선생님 확인 중"
                : p.status === "approved"
                  ? "상점에 등록됨"
                  : "이번 제안 마침"}
            </p>
            {teacher && p.status === "pending" && (
              <>
                <ParticipationForm
                  command="proposal_decide"
                  label="가격 확인·상점에 등록"
                  payload={(fd) => ({
                    id: p.id,
                    approve: true,
                    price: Number(value(fd, "price")),
                    stock: Number(value(fd, "stock")),
                  })}
                >
                  <Field
                    label="승인 가격"
                    name="price"
                    type="number"
                    min={1}
                    max={100000}
                    defaultValue={p.price}
                  />
                  <Field
                    label="판매 수량"
                    name="stock"
                    type="number"
                    min={1}
                    max={10000}
                    defaultValue={1}
                  />
                </ParticipationForm>
                <ParticipationForm
                  command="proposal_decide"
                  label="이번 제안 마치기"
                  payload={() => ({ id: p.id, approve: false })}
                />
              </>
            )}
          </article>
        ))}
        {!teacher && hub.classes.length > 0 && (
          <ParticipationForm
            command="proposal_create"
            label="상점 상품 제안"
            payload={(fd) => ({
              classroomId: value(fd, "classroomId"),
              name: value(fd, "name"),
              reason: value(fd, "reason"),
              price: Number(value(fd, "price")),
            })}
          >
            <ClassField classes={hub.classes} />
            <Field label="제안하는 학급 활동권" name="name" maxLength={80} />
            <TextArea
              label="제안 이유와 운영 방법"
              name="reason"
              maxLength={1000}
            />
            <Field
              label="제안 가격 · 학급 화폐"
              name="price"
              type="number"
              min={1}
              max={100000}
              defaultValue={20}
            />
          </ParticipationForm>
        )}
      </Panel>
    </div>
  );
}
