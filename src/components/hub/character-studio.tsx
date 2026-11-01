"use client";
import { useState } from "react";
import type { HubData } from "@/lib/hub-data";
import { evolution, type GrowthState } from "@/lib/growth-terms";
import { characterLevel } from "@/lib/hub";
import { CharacterScene } from "./character-scene";
import { GrowthTermForm } from "./growth-term-form";
import { ClassField, Field, Panel, string } from "./shared";
export function CharacterStudio({
  data,
  state,
}: {
  data: HubData;
  state: GrowthState;
}) {
  const teacher = data.profile.role === "teacher";
  const [accessory, setAccessory] = useState(state.accessory ?? ""),
    [background, setBackground] = useState(state.background),
    [notice, setNotice] = useState("");
  const xp = teacher ? 0 : state.xp,
    { stage, label, nextXp } = evolution(xp),
    level = characterLevel(xp);
  const changed =
    accessory !== (state.accessory ?? "") || background !== state.background;
  return (
    <>
      <Panel title={teacher ? "책숲 친구 살펴보기" : "나의 성장 · 꾸미기"}>
        <div className="companion-layout">
          <div>
            <CharacterScene
              species={data.character?.species}
              xp={xp}
              accessory={accessory || null}
              background={background}
              preview={teacher || changed}
            />
            <p className="scene-caption">
              {teacher
                ? "교사용 모습 미리보기"
                : changed
                  ? "미리보기 · 아래에서 저장하면 적용돼요"
                  : "현재 적용한 모습"}
            </p>
          </div>
          <div className="companion-details">
            <span className="eyebrow">GROW WITH YOUR STORY</span>
            <h3>{data.character?.nickname ?? "나의 책숲 친구"}</h3>
            <p className="evolution-title">
              {label} <span>성장 {stage}/4</span>
            </p>
            {!teacher && (
              <>
                <strong>
                  레벨 {level.level} · {xp} XP
                </strong>
                <progress
                  value={xp}
                  max={level.next}
                  aria-label="다음 레벨까지의 성장"
                />
                <p>
                  {nextXp === null
                    ? "책숲의 작가가 되었어요. 새로운 생각을 계속 모아 보세요."
                    : `다음 모습까지 ${nextXp - xp} XP · 다음 레벨까지 ${level.next - xp} XP`}
                </p>
              </>
            )}
            <p>
              독서·글쓰기 활동으로 모습이 자라요. 경험치와 지급받은 장식은 진급
              후에도 이어집니다.
            </p>
            <ol className="evolution-track">
              {[
                "작은 새싹",
                "생각의 탐험가",
                "이야기 수집가",
                "책숲의 작가",
              ].map((n, i) => (
                <li key={n} aria-current={i + 1 === stage ? "step" : undefined}>
                  <span>{["0", "50", "450", "1,250"][i]} XP</span>
                  {n}
                </li>
              ))}
            </ol>
          </div>
        </div>
        {!teacher && (
          <GrowthTermForm
            command="equip"
            payload={() => ({
              revision: state.revision,
              accessory,
              background,
            })}
            label="꾸미기 저장"
            onSuccess={() => setNotice("꾸미기를 저장했어요.")}
          >
            <div className="wardrobe-grid">
              {(["accessory", "background"] as const).map((slot) => (
                <div key={slot}>
                  <h3>{slot === "accessory" ? "작은 장식" : "머무는 공간"}</h3>
                  <label className="field">
                    {slot === "accessory" ? "장식 선택" : "배경 선택"}
                    <select
                      name={slot}
                      value={slot === "accessory" ? accessory : background}
                      onChange={(e) =>
                        slot === "accessory"
                          ? setAccessory(e.target.value)
                          : setBackground(e.target.value)
                      }
                    >
                      {slot === "accessory" && (
                        <option value="">장식 벗기</option>
                      )}
                      {state.catalog
                        .filter((c) => c.slot === slot)
                        .map((c) => (
                          <option
                            key={c.key}
                            value={c.key}
                            disabled={!c.canEquip}
                          >
                            {c.name}
                            {!c.canEquip
                              ? ` · 잠김${c.min_xp > xp ? ` (${c.min_xp} XP)` : " · 상점 지급 필요"}`
                              : c.source === "shop"
                                ? " · 보유"
                                : " · 성장 보상"}
                          </option>
                        ))}
                    </select>
                  </label>
                  <ul className="wardrobe-list">
                    {state.catalog
                      .filter((c) => c.slot === slot)
                      .map((c) => (
                        <li key={c.key}>
                          <strong>{c.name}</strong>
                          <span>
                            {c.canEquip
                              ? c.source === "shop"
                                ? "보유 · 착용 가능"
                                : "열림 · 착용 가능"
                              : c.min_xp > xp
                                ? `${c.min_xp} XP 필요${c.source === "shop" ? " · 상점 지급 필요" : ""}`
                                : "상점에서 지급받기"}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="form-help">
              상점 장식은 구매 예약 후 선생님의 지급이 완료되어야 착용할 수
              있어요.
            </p>
          </GrowthTermForm>
        )}
        {notice && <p role="status">{notice}</p>}
        {teacher && (
          <p className="form-help">
            교사용 미리보기입니다. 학생은 자신의 활동 경험치와 실제 지급 내역에
            따라 꾸밀 수 있어요.
          </p>
        )}
      </Panel>
      {teacher && (
        <Panel title="캐릭터 장식 상점 열기">
          <GrowthTermForm
            command="decoration_shop"
            payload={(f) => ({
              classroomId: string(f, "classroomId"),
              itemKey: string(f, "itemKey"),
              price: Number(f.get("price")),
              stock: Number(f.get("stock")),
            })}
            label="장식 상품 등록"
            disabled={!data.classes.some((c) => c.term_state !== "archived")}
          >
            <ClassField classes={data.classes} />
            <label className="field">
              착용할 수 있는 장식
              <select name="itemKey">
                {state.catalog
                  .filter((c) => c.source === "shop")
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name}
                      {c.min_xp ? ` · ${c.min_xp} XP 필요` : ""}
                    </option>
                  ))}
              </select>
            </label>
            <Field
              label="가격 · 학급 화폐"
              name="price"
              type="number"
              min={1}
              max={100000}
              defaultValue={10}
            />
            <Field
              label="수량"
              name="stock"
              type="number"
              min={1}
              max={1000}
              defaultValue={30}
            />
            <p>
              학생이 경제 교실에서 예약하면, 선생님이 주문을 확인해 지급할 수
              있어요. 기존 학급 보상 상품도 계속 사용할 수 있습니다.
            </p>
          </GrowthTermForm>
        </Panel>
      )}
    </>
  );
}
