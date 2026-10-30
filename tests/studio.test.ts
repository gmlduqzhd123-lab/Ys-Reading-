import { describe, expect, it } from "vitest";
import {
  cardsBody,
  diffWords,
  enterDemo,
  growth,
  initialStudio,
  judgeDemo,
  keepWork,
  portfolioHtml,
  publishDemo,
  readStudio,
  reviewDemo,
  sampleDraft,
  studioSchema,
  submitDemo,
  templateSchema,
  type StudioState,
} from "@/lib/studio";
const at = "2026-10-29T01:00:00.000Z";
function assigned(): StudioState {
  const state = initialStudio();
  return { ...state, demo: { ...state.demo, assigned: true, ...sampleDraft } };
}
function revised(): StudioState {
  let s = submitDemo(assigned(), "v1", at);
  s = reviewDemo(s, "revision_requested", "책의 장면을 보태 주세요.", at);
  s = {
    ...s,
    demo: {
      ...s.demo,
      body:
        s.demo.body +
        " 거절할까 망설였지만 함께하자고 말한 장면에서 용기를 보았어.",
      reason: "장면을 보태서 용기를 설명했어요.",
    },
  };
  return submitDemo(s, "v2", at);
}
function complete(): StudioState {
  return reviewDemo(revised(), "completed", "장면과 생각이 잘 연결돼요.", at);
}
describe("기기 내 체험 기록", () => {
  it("새 상태를 저장 형식으로 왕복한다", () =>
    expect(readStudio(JSON.stringify(initialStudio()))).toEqual(
      initialStudio(),
    ));
  it("손상되거나 다른 버전인 기록은 덮어쓰지 않고 거부한다", () => {
    expect(() => readStudio("bad")).toThrow("기록");
    expect(() =>
      readStudio(JSON.stringify({ ...initialStudio(), schema: 2 })),
    ).toThrow("형식");
  });
  it("중복 카드 순서와 과도한 글 길이를 거부한다", () => {
    const s = initialStudio();
    s.cards.order = ["scene", "scene", "thought", "evidence"];
    expect(studioSchema.safeParse(s).success).toBe(false);
    s.demo.body = "가".repeat(10001);
    expect(studioSchema.safeParse(s).success).toBe(false);
  });
  it("저장할 미션은 질문·활동·기준이 모두 필요하다", () => {
    expect(
      templateSchema.safeParse(initialStudio().templateDraft).success,
    ).toBe(false);
    expect(
      templateSchema.safeParse({
        ...initialStudio().templateDraft,
        title: "질문 미션",
        prompt: "왜?",
        steps: "읽기\n쓰기",
        criteria: "까닭 찾기",
      }).success,
    ).toBe(true);
  });
});
describe("체험 제출과 완료", () => {
  it("미배정 또는 빈 글 제출을 거부한다", () => {
    expect(() => submitDemo(initialStudio(), "1", at)).toThrow("배정");
    const s = assigned();
    s.demo.body = " ";
    expect(() => submitDemo(s, "1", at)).toThrow("생각");
  });
  it("같은 요청은 중복되지 않고 다른 본문 재사용은 거부한다", () => {
    const s = submitDemo(assigned(), "v1", at);
    expect(submitDemo(s, "v1", at)).toBe(s);
    expect(() =>
      submitDemo({ ...s, demo: { ...s.demo, body: "다른 내용" } }, "v1", at),
    ).toThrow("같은 요청");
  });
  it("검토 대기 중인 새 제출을 막는다", () => {
    const s = submitDemo(assigned(), "v1", at);
    expect(() => submitDemo(s, "v2", at)).toThrow("피드백");
  });
  it("수정형 초고를 바로 완료할 수 없다", () => {
    const s = submitDemo(assigned(), "v1", at);
    expect(() => reviewDemo(s, "completed", "잘했어요", at)).toThrow(
      "수정 요청",
    );
  });
  it("빈 피드백과 검토한 버전의 재검토를 거부한다", () => {
    const s = submitDemo(assigned(), "v1", at);
    expect(() => reviewDemo(s, "revision_requested", " ", at)).toThrow(
      "피드백",
    );
    const reviewed = reviewDemo(s, "revision_requested", "근거를 더해요", at);
    expect(() => reviewDemo(reviewed, "completed", "완료", at)).toThrow(
      "새 제출본",
    );
  });
  it("같은 글 또는 수정 이유가 없는 재제출을 거부한다", () => {
    let s = reviewDemo(
      submitDemo(assigned(), "v1", at),
      "revision_requested",
      "보태 주세요",
      at,
    );
    expect(() => submitDemo(s, "v2", at)).toThrow("이전 글");
    s = { ...s, demo: { ...s.demo, body: "새 생각" } };
    expect(() => submitDemo(s, "v2", at)).toThrow("이유");
  });
  it("수정본 완료 시 초고와 이유를 작품집 기록으로 남긴다", () => {
    const s = complete();
    expect(s.works[0].original).toBe(sampleDraft.body);
    expect(s.works[0].body).toContain("장면");
    expect(s.works[0].reason).toContain("용기");
    expect(s.demo.versions.map((v) => v.status)).toEqual([
      "revision_requested",
      "completed",
    ]);
  });
  it("새 초안 작성이 완료본과 출품 사본을 바꾸지 않는다", () => {
    const s = enterDemo(complete(), "v2", [true, true, true, true], true, at);
    const changed = { ...s, demo: { ...s.demo, body: "새 초안" } };
    expect(changed.demo.entry!.body).toBe(s.demo.versions[1].body);
    expect(changed.demo.versions[1].body).not.toBe("새 초안");
  });
  it("완료 후 새 버전을 제출해도 이전 완료와 잎이 유지된다", () => {
    const s = complete();
    const next = submitDemo(
      {
        ...s,
        demo: {
          ...s.demo,
          body: "더 다듬은 생각",
          reason: "새 관점을 보탰어요",
        },
      },
      "v3",
      at,
    );
    expect(growth(next).complete).toBe(true);
    expect(next.works[0]).toEqual(s.works[0]);
  });
});
describe("출품과 심사", () => {
  it("완료 전이나 자기 점검·선택 동의 전에는 접수하지 않는다", () => {
    expect(() =>
      enterDemo(revised(), "v2", [true, true, true, true], true, at),
    ).toThrow("완료");
    expect(() =>
      enterDemo(complete(), "v2", [true, false, true, true], true, at),
    ).toThrow("점검");
    expect(() =>
      enterDemo(complete(), "v2", [true, true, true, true], false, at),
    ).toThrow("점검");
  });
  it("중복 출품을 막는다", () => {
    const s = enterDemo(complete(), "v2", [true, true, true, true], true, at);
    expect(() =>
      enterDemo(s, "v2", [true, true, true, true], true, at),
    ).toThrow("이미");
  });
  it("출품 전 심사·심사 전 발표·점수 범위 위반을 막는다", () => {
    expect(() => judgeDemo(complete(), {}, "의견")).toThrow("출품본");
    const s = enterDemo(complete(), "v2", [true, true, true, true], true, at);
    expect(() => publishDemo(s)).toThrow("먼저");
    expect(() =>
      judgeDemo(
        s,
        { thought: 31, evidence: 30, structure: 25, expression: 15 },
        "의견",
      ),
    ).toThrow("점수");
  });
  it("심사를 확정해 발표하고 이후 덮어쓰지 않는다", () => {
    const s = judgeDemo(
      enterDemo(complete(), "v2", [true, true, true, true], true, at),
      { thought: 25, evidence: 23, structure: 20, expression: 12 },
      "생각이 잘 전해져요.",
    );
    expect(publishDemo(s).demo.entry!.published).toBe(true);
    expect(() => judgeDemo(s, {}, "바꾸기")).toThrow("확정");
  });
});
describe("학습 도구와 작품집", () => {
  it("생각 카드 순서대로 글 뼈대를 만든다", () => {
    const s = initialStudio();
    s.cards.answers.scene = "씨앗을 찾음";
    s.cards.order = ["thought", "scene", "experience", "evidence"];
    expect(cardsBody(s).indexOf("내 생각")).toBeLessThan(
      cardsBody(s).indexOf("씨앗을 찾음"),
    );
  });
  it("같은 작품 보관은 잎이나 작품을 중복 생성하지 않는다", () => {
    const w = {
      id: "i",
      kind: "interview" as const,
      title: "인터뷰",
      body: "질문",
      original: "",
      reason: "",
      at,
    };
    const s = keepWork(keepWork(initialStudio(), w), w);
    expect(s.works).toHaveLength(1);
    expect(growth(s).leaves).toBe(2);
    expect(growth(s).bird).toBe(true);
  });
  it("선택한 순서와 초고·성찰을 작품집에 담고 HTML을 이스케이프한다", () => {
    const s = complete();
    s.portfolio = {
      title: "<script>alert(1)</script>",
      author: "작가 & 나",
      note: "<img src=x onerror=alert(1)>",
      selected: [s.works[0].id],
    };
    const html = portfolioHtml(s);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("작가 &amp; 나");
    expect(html).toContain("처음 쓴 글");
    expect(html).toContain("고친 부분과 그 이유");
  });
  it("빈 작품집 내보내기를 막는다", () =>
    expect(() => portfolioHtml(initialStudio())).toThrow("한 편"));
  it.each([
    ["가 나", "가 다 나"],
    ["", "새 문장"],
    ["지운 문장", ""],
    ["같은 글", "같은 글"],
    ["a ".repeat(600), "b ".repeat(600)],
  ])("비교 결과에서 원문과 수정문을 손실 없이 복원한다", (a, b) => {
    const parts = diffWords(a, b);
    expect(
      parts
        .filter((p) => p.kind !== "added")
        .map((p) => p.text)
        .join(""),
    ).toBe(a);
    expect(
      parts
        .filter((p) => p.kind !== "removed")
        .map((p) => p.text)
        .join(""),
    ).toBe(b);
  });
});
