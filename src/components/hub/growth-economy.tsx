"use client";
import {
  activityLabels,
  badgeLabels,
  characterLevel,
  defaultRewards,
  ledgerReason,
} from "@/lib/hub";
import type { HubData } from "@/lib/hub-data";
import { ClassField, Empty, Field, HubForm, Panel, string } from "./shared";
export function Character({ data }: { data: HubData }) {
  const level = characterLevel(data.totals.xp);
  const species = data.character?.species ?? "rabbit";
  const teacher = data.profile.role === "teacher";
  return (
    <>
      <Panel title="나의 책숲 친구">
        <div className="character-card">
          <span
            className={`character-avatar ${species}`}
            role="img"
            aria-label={
              species === "fox" ? "여우" : species === "owl" ? "부엉이" : "토끼"
            }
          >
            {species === "fox" ? "🦊" : species === "owl" ? "🦉" : "🐰"}
          </span>
          <div>
            <h3>{data.character?.nickname ?? "나의 책숲 친구"}</h3>
            <strong>
              레벨 {level.level} · {level.xp} XP
            </strong>
            <progress
              value={level.xp}
              max={level.next}
              aria-label="다음 레벨까지의 성장"
            />
            <p>
              다음 레벨까지 {level.next - level.xp} XP · 화폐를 사용해도
              경험치는 줄지 않아요.
            </p>
          </div>
        </div>
        {!teacher && (
          <HubForm
            command="character_save"
            payload={(f) => ({
              nickname: string(f, "nickname"),
              species: string(f, "species"),
            })}
          >
            <Field
              name="nickname"
              label="친구 이름 · 광장 필명"
              defaultValue={data.character?.nickname ?? "책숲 작가"}
              maxLength={30}
            />
            <label className="field">
              캐릭터
              <select name="species" defaultValue={species}>
                <option value="rabbit">토끼</option>
                <option value="fox">여우</option>
                <option value="owl">부엉이</option>
              </select>
            </label>
          </HubForm>
        )}
        {!teacher && (
          <HubForm
            command="attendance"
            payload={(f) => ({ classroomId: string(f, "classroomId") })}
            disabled={!data.classes.length}
            label="오늘의 책숲 활동 출석"
          >
            <ClassField classes={data.classes} />
            <p className="form-help">
              한국 날짜 기준 학급마다 하루 한 번만 인정돼요. 학교 출결과는
              별개입니다.
            </p>
          </HubForm>
        )}
        <div className="badge-grid">
          {data.orders
            .filter(
              (o) =>
                o.status === "fulfilled" &&
                o.kind === "decoration" &&
                o.student_id === data.profile.id,
            )
            .map((o) => (
              <span className="hub-badge" key={o.id}>
                ✨ {String(o.item_name)}
              </span>
            ))}
        </div>
      </Panel>
      <Panel title="우리의 배지 수첩">
        {!data.achievements.length && (
          <Empty>독서 기록, 미션, 고쳐쓰기를 통해 첫 배지를 만나 보세요.</Empty>
        )}
        <div className="badge-grid">
          {data.achievements.map((b) => (
            <article className="hub-badge" key={b.id}>
              <span aria-hidden="true">🏅</span>
              <strong>{badgeLabels[String(b.code)] ?? String(b.code)}</strong>
              <small>
                {String(b.period_key) === "all"
                  ? "누적 성취"
                  : String(b.period_key)}{" "}
                · 근거 {Number(b.evidence_count)}회
                {teacher
                  ? ` · ${data.students.find((p) => p.id === b.student_id)?.display_name ?? "학생"}`
                  : ""}
              </small>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="최근 성장 기록">
        {data.events.map((e) => (
          <p key={e.id}>
            {activityLabels[String(e.kind)]} · +{Number(e.xp)} XP ·{" "}
            {new Date(e.created_at).toLocaleDateString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}
            {teacher && (
              <small>
                {" "}
                ·{" "}
                {data.students.find((p) => p.id === e.student_id)
                  ?.display_name ?? "학생"}
              </small>
            )}
          </p>
        ))}
        {!data.events.length && (
          <Empty>완료한 활동의 기록이 이곳에 쌓여요.</Empty>
        )}
      </Panel>
    </>
  );
}
export function Economy({ data }: { data: HubData }) {
  const teacher = data.profile.role === "teacher";
  const name = (id: string) =>
    String(
      data.settings.find((s) => s.classroom_id === id)?.currency_name ?? "책잎",
    );
  return (
    <>
      {teacher && (
        <Panel title="우리 반 지갑 현황">
          {(data.totals.studentBalances ?? []).map((w) => (
            <div
              className="hub-row hub-ledger"
              key={`${w.classroomId}:${w.studentId}`}
            >
              <span>
                {data.students.find((p) => p.id === w.studentId)
                  ?.display_name ?? "학생"}{" "}
                · {data.classes.find((c) => c.id === w.classroomId)?.name}
              </span>
              <strong>
                {w.balance} {name(w.classroomId)}
              </strong>
            </div>
          ))}
          {!data.totals.studentBalances?.length && (
            <Empty>화폐 지급·사용이 시작되면 학생별 잔액을 볼 수 있어요.</Empty>
          )}
        </Panel>
      )}
      {!teacher && (
        <Panel title="나의 학급 지갑">
          <div className="stat-grid">
            {data.classes.map((c) => (
              <div className="stat-card" key={c.id}>
                <span>{c.name}</span>
                <strong>
                  {data.totals.balances[c.id] ?? 0}
                  <small>{name(c.id)}</small>
                </strong>
              </div>
            ))}
          </div>
          <p>
            학급마다 화폐를 따로 관리해요. 구매하면 금액과 재고가 예약되고,
            선생님이 취소하면 돌려받습니다.
          </p>
        </Panel>
      )}
      <Panel title="우리 반 상점">
        <div className="hub-card-grid">
          {data.items.map((item) => (
            <article className="hub-record" key={item.id}>
              <h3>{String(item.name)}</h3>
              <p>
                {Number(item.price)} {name(item.classroom_id)} · 남은 수량{" "}
                {Number(item.stock)}
              </p>
              <small>
                {data.classes.find((c) => c.id === item.classroom_id)?.name} ·{" "}
                {item.kind === "decoration" ? "캐릭터 꾸미기" : "학급 보상"}
              </small>
              {teacher ? (
                <HubForm
                  command="shop_toggle"
                  payload={() => ({ id: item.id })}
                  label={item.active ? "판매 중지" : "판매 시작"}
                />
              ) : (
                <HubForm
                  command="shop_buy"
                  payload={() => ({ id: item.id })}
                  disabled={!item.active || Number(item.stock) < 1}
                  label="구매 예약하기"
                />
              )}
            </article>
          ))}
        </div>
        {!data.items.length && (
          <Empty>선생님이 상품을 등록하면 이곳에서 만날 수 있어요.</Empty>
        )}
      </Panel>
      {teacher && (
        <Panel title="상품 등록">
          <HubForm
            command="shop_create"
            payload={(f) => ({
              classroomId: string(f, "classroomId"),
              name: string(f, "name"),
              price: Number(f.get("price")),
              stock: Number(f.get("stock")),
              kind: string(f, "kind"),
            })}
          >
            <ClassField classes={data.classes} />
            <Field name="name" label="상품·학급 보상 이름" maxLength={80} />
            <div className="hub-form-grid">
              <Field
                name="price"
                label="가격"
                type="number"
                min={1}
                max={100000}
              />
              <Field
                name="stock"
                label="수량"
                type="number"
                min={0}
                max={10000}
              />
            </div>
            <label className="field">
              종류
              <select name="kind">
                <option value="privilege">학급 보상</option>
                <option value="decoration">캐릭터 장식</option>
              </select>
            </label>
          </HubForm>
        </Panel>
      )}
      <Panel title={teacher ? "구매 승인·취소" : "나의 구매 내역"}>
        {data.orders.map((o) => (
          <article key={o.id} className="hub-record">
            <strong>{String(o.item_name)}</strong> · {Number(o.price)}{" "}
            {name(o.classroom_id)} ·{" "}
            {o.status === "pending"
              ? "선생님 확인 중"
              : o.status === "fulfilled"
                ? "지급 완료"
                : "취소·환불"}
            {teacher && (
              <p>
                {data.students.find((p) => p.id === o.student_id)
                  ?.display_name ?? "학생"}
              </p>
            )}
            {teacher && o.status === "pending" && (
              <div className="hub-inline">
                <HubForm
                  command="order_decide"
                  payload={() => ({ id: o.id, status: "fulfilled" })}
                  label="지급 완료"
                />
                <HubForm
                  command="order_decide"
                  payload={() => ({ id: o.id, status: "cancelled" })}
                  label="취소·환불"
                />
              </div>
            )}
          </article>
        ))}
        {!data.orders.length && <Empty>구매 내역이 없습니다.</Empty>}
      </Panel>
      {teacher && (
        <Panel title="화폐 지급·조정">
          <HubForm
            command="wallet_adjust"
            payload={(f) => ({
              classroomId: string(f, "classroomId"),
              id: string(f, "studentId"),
              amount: Number(f.get("amount")),
              reason: string(f, "reason"),
            })}
          >
            <ClassField classes={data.classes} />
            <label className="field">
              학생
              <select name="studentId" required>
                {data.students
                  .filter((p) => p.role === "student")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                    </option>
                  ))}
              </select>
            </label>
            <Field
              name="amount"
              label="지급액 · 차감은 음수"
              type="number"
              min={-10000}
              max={10000}
            />
            <Field name="reason" label="지급·조정 사유" maxLength={160} />
            <p>학급 소속을 다시 검사하며 잔액보다 많이 차감할 수 없습니다.</p>
          </HubForm>
        </Panel>
      )}
      <Panel title="거래 내역">
        <p>기존 거래는 덮어쓰지 않고 취소·조정도 별도 기록으로 남깁니다.</p>
        {data.ledger.map((l) => (
          <div className="hub-row hub-ledger" key={l.id}>
            <span>
              {ledgerReason(String(l.reason))}
              {teacher && (
                <small>
                  {" "}
                  ·{" "}
                  {data.students.find((p) => p.id === l.student_id)
                    ?.display_name ?? "학생"}
                </small>
              )}
              <small>
                {" "}
                ·{" "}
                {new Date(l.created_at).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </small>
            </span>
            <strong>
              {Number(l.amount) > 0 ? "+" : ""}
              {Number(l.amount)} {name(l.classroom_id)}
            </strong>
          </div>
        ))}
        {!data.ledger.length && <Empty>아직 거래가 없습니다.</Empty>}
      </Panel>
      {teacher && (
        <Panel title="학급 화폐·보상 기준">
          {data.classes.map((cls) => {
            const settings = data.settings.find(
              (s) => s.classroom_id === cls.id,
            );
            const rules = (settings?.reward_rules ??
              defaultRewards) as typeof defaultRewards;
            return (
              <details key={cls.id}>
                <summary>{cls.name} 설정</summary>
                <HubForm
                  command="economy_settings"
                  payload={(f) => ({
                    classroomId: cls.id,
                    currencyName: string(f, "currencyName"),
                    rules: Object.fromEntries(
                      Object.keys(defaultRewards).map((k) => [
                        k,
                        {
                          xp: Number(f.get(`${k}-xp`)),
                          coins: Number(f.get(`${k}-coins`)),
                        },
                      ]),
                    ),
                  })}
                >
                  <Field
                    name="currencyName"
                    label="화폐 이름"
                    defaultValue={String(settings?.currency_name ?? "책잎")}
                    maxLength={12}
                  />
                  {Object.keys(defaultRewards).map((k) => (
                    <div key={k}>
                      <strong>{activityLabels[k]}</strong>
                      <div className="hub-form-grid">
                        <Field
                          name={`${k}-xp`}
                          label="경험치"
                          type="number"
                          defaultValue={rules[k as keyof typeof rules].xp}
                          min={0}
                          max={1000}
                        />
                        <Field
                          name={`${k}-coins`}
                          label="학급 화폐"
                          type="number"
                          defaultValue={rules[k as keyof typeof rules].coins}
                          min={0}
                          max={100}
                        />
                      </div>
                    </div>
                  ))}
                  <p>
                    변경한 기준은 다음 활동부터 적용되며 이전 보상은 유지됩니다.
                  </p>
                </HubForm>
              </details>
            );
          })}
        </Panel>
      )}
    </>
  );
}
