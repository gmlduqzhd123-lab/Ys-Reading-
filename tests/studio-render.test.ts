import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoRoom } from "@/components/studio/demo-room";
import {
  WritingCards,
  CharacterInterview,
  ChoiceVillage,
} from "@/components/studio/creative-tools";
import {
  AdventureMap,
  ThoughtGarden,
  CompareRoom,
} from "@/components/studio/growth-tools";
import {
  MissionMaker,
  FestivalWorkshop,
  FirstPortfolio,
} from "@/components/studio/teacher-tools";
import {
  initialStudio,
  sampleDraft,
  submitDemo,
  reviewDemo,
  enterDemo,
  judgeDemo,
  publishDemo,
  studioSchema,
} from "@/lib/studio";
import type { ToolProps } from "@/components/studio/shared";
const at = "2026-10-29T00:00:00Z";
const tools = [
  DemoRoom,
  WritingCards,
  CharacterInterview,
  ChoiceVillage,
  AdventureMap,
  ThoughtGarden,
  CompareRoom,
  MissionMaker,
  FestivalWorkshop,
  FirstPortfolio,
];
function completedState() {
  const initial = initialStudio();
  initial.demo = { ...initial.demo, assigned: true, ...sampleDraft };
  let s = reviewDemo(
    submitDemo(initial, "1", at),
    "revision_requested",
    "까닭을 보태요",
    at,
  );
  s = {
    ...s,
    demo: {
      ...s.demo,
      body: s.demo.body + " 거절당할까 두려워도 제안한 모습이 용감했어.",
      reason: "모모의 마음을 설명했어요.",
    },
  };
  s = reviewDemo(submitDemo(s, "2", at), "completed", "마음이 잘 전해져요", at);
  s.portfolio.selected = [s.works[0].id];
  return publishDemo(
    judgeDemo(
      enterDemo(s, "2", [true, true, true, true], true, at),
      { thought: 25, evidence: 25, structure: 20, expression: 10 },
      "생각을 응원해요",
    ),
  );
}
describe("학습 도구의 기록 상태 렌더링", () => {
  it.each(tools)("빈 기록에서도 도구가 오류 없이 표시된다: %s", (Component) => {
    const props: ToolProps = {
      state: initialStudio(),
      update: () => false,
      go: () => {},
    };
    expect(renderToStaticMarkup(createElement(Component, props))).toContain(
      "<",
    );
  });
  it("완료·심사·발표 기록이 있는 상태를 모든 도구가 읽는다", () => {
    const state = completedState();
    expect(studioSchema.safeParse(state).success).toBe(true);
    for (const Component of tools)
      expect(() =>
        renderToStaticMarkup(
          createElement(Component, {
            state,
            update: () => false,
            go: () => {},
          }),
        ),
      ).not.toThrow();
  });
  it("작품집 미리보기는 선택한 기록과 초고를 포함하고 사용자 태그를 실행하지 않는다", () => {
    const state = completedState();
    state.portfolio.title = "<img onerror=alert(1)>";
    const html = renderToStaticMarkup(
      createElement(FirstPortfolio, {
        state,
        update: () => false,
        go: () => {},
      }),
    );
    expect(html).toContain("처음 쓴 글");
    expect(html).toContain("모모에게 보내는 응원");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img onerror");
  });
  it("발표 여부와 출품 원본이 어긋난 저장 기록은 읽기 전에 거부된다", () => {
    const state = completedState();
    state.demo.entry!.scores = null;
    expect(studioSchema.safeParse(state).success).toBe(false);
    state.demo.entry!.published = false;
    state.demo.entry!.body = "바뀐 출품본";
    expect(studioSchema.safeParse(state).success).toBe(false);
  });
});
