import { z } from "zod";
import { missions } from "./missions";

export const STUDIO_KEY = "bookforest.studio.v1";
export const cardIds = ["scene", "thought", "evidence", "experience"] as const;
export type CardId = (typeof cardIds)[number];
export const cardLabels: Record<CardId, string> = {
  scene: "기억에 남는 장면",
  thought: "내 생각",
  evidence: "그렇게 생각한 까닭",
  experience: "내 경험과 연결",
};
const short = z.string().max(100);
const body = z.string().max(10000);
const versionSchema = z.object({
  id: short,
  title: short,
  body,
  version: z.number().int().positive(),
  status: z.enum(["submitted", "revision_requested", "completed"]),
  feedback: z.string().max(1500),
  reason: z.string().max(1000),
  at: short,
});
export const templateSchema = z.object({
  id: short,
  title: short.trim().min(1, "미션 제목을 적어 주세요."),
  theme: z.enum(["courage", "empathy", "fairness"]),
  grade: z.enum(["3-4", "5-6"]),
  kind: z.enum(["question", "writing", "revision"]),
  prompt: z.string().trim().min(1, "생각 질문을 적어 주세요.").max(1500),
  steps: z.string().trim().min(1, "활동 순서를 적어 주세요.").max(2000),
  criteria: z.string().trim().min(1, "살펴볼 기준을 적어 주세요.").max(1500),
});
export type LocalTemplate = z.infer<typeof templateSchema>;
export const workSchema = z.object({
  id: short,
  kind: z.enum(["writing", "interview", "choice", "cards"]),
  title: short,
  body,
  original: body,
  reason: z.string().max(1000),
  at: short,
});
export type LocalWork = z.infer<typeof workSchema>;
export const scoreSchema = z.object({
  thought: z.number().int().min(0).max(30),
  evidence: z.number().int().min(0).max(30),
  structure: z.number().int().min(0).max(25),
  expression: z.number().int().min(0).max(15),
});
export const rubric = [
  {
    key: "thought",
    label: "내 생각",
    max: 30,
    help: "어떤 생각을 전하고 싶은지 드러나나요?",
  },
  {
    key: "evidence",
    label: "까닭과 근거",
    max: 30,
    help: "책의 장면이나 이유로 생각을 뒷받침했나요?",
  },
  {
    key: "structure",
    label: "글의 흐름",
    max: 25,
    help: "처음부터 끝까지 이야기를 따라갈 수 있나요?",
  },
  {
    key: "expression",
    label: "나의 표현",
    max: 15,
    help: "내 말로 표현하고 읽기 쉽게 다듬었나요?",
  },
] as const;

const templateDraft = z.object({
  id: short,
  title: short,
  theme: z.enum(["courage", "empathy", "fairness"]),
  grade: z.enum(["3-4", "5-6"]),
  kind: z.enum(["question", "writing", "revision"]),
  prompt: z.string().max(1500),
  steps: z.string().max(2000),
  criteria: z.string().max(1500),
});
export const studioSchema = z
  .object({
    schema: z.literal(1),
    demo: z.object({
      assigned: z.boolean(),
      missionId: z.string().refine((id) => missions.some((m) => m.id === id)),
      title: short,
      body,
      reason: z.string().max(1000),
      versions: z.array(versionSchema).max(50),
      entry: z
        .object({
          sourceId: short,
          title: short,
          body,
          at: short,
          scores: scoreSchema.nullable(),
          comment: z.string().max(1500),
          published: z.boolean(),
        })
        .nullable(),
    }),
    cards: z.object({
      order: z
        .array(z.enum(cardIds))
        .length(4)
        .refine((ids) => new Set(ids).size === 4),
      answers: z.object({
        scene: z.string().max(2000),
        thought: z.string().max(2000),
        evidence: z.string().max(2000),
        experience: z.string().max(2000),
      }),
    }),
    interview: z.object({
      book: short,
      character: short,
      questions: z
        .array(
          z.object({
            question: z.string().max(300),
            answer: z.string().max(1500),
            evidence: z.string().max(1000),
          }),
        )
        .length(3),
    }),
    choices: z.record(
      z.string(),
      z.object({
        choice: short,
        reason: z.string().max(1500),
        reflection: z.string().max(1500),
      }),
    ),
    garden: z.object({
      ground: z.enum(["meadow", "sunset", "night"]),
      decoration: z.enum(["none", "flowers", "lantern", "bird"]),
    }),
    templates: z.array(templateSchema).max(30),
    templateDraft,
    works: z.array(workSchema).max(60),
    portfolio: z.object({
      title: short,
      author: short,
      note: z.string().max(1500),
      selected: z.array(short).max(60),
    }),
  })
  .superRefine((s, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      new Set(s.demo.versions.map((v) => v.id)).size !==
        s.demo.versions.length ||
      s.demo.versions.some((v, index) => v.version !== index + 1)
    )
      add("제출 기록 순서가 달라요.");
    const entry = s.demo.entry;
    if (entry) {
      const source = s.demo.versions.find(
        (v) => v.id === entry.sourceId && v.status === "completed",
      );
      if (!source || source.title !== entry.title || source.body !== entry.body)
        add("출품본과 완료 기록이 일치하지 않아요.");
      if (entry.published && !entry.scores)
        add("심사 전 결과가 발표될 수 없어요.");
    }
    if (new Set(s.works.map((w) => w.id)).size !== s.works.length)
      add("중복된 작품 기록이에요.");
    if (
      new Set(s.portfolio.selected).size !== s.portfolio.selected.length ||
      s.portfolio.selected.some((id) => !s.works.some((w) => w.id === id))
    )
      add("작품집의 선택 기록이 달라요.");
  });
export type StudioState = z.infer<typeof studioSchema>;
export type DemoVersion = StudioState["demo"]["versions"][number];
export const emptyTemplate = (): LocalTemplate => ({
  id: "draft",
  title: "",
  theme: "courage",
  grade: "3-4",
  kind: "writing",
  prompt: "",
  steps: "",
  criteria: "",
});
export const initialStudio = (): StudioState => ({
  schema: 1,
  demo: {
    assigned: false,
    missionId: missions[2].id,
    title: "",
    body: "",
    reason: "",
    versions: [],
    entry: null,
  },
  cards: {
    order: [...cardIds],
    answers: { scene: "", thought: "", evidence: "", experience: "" },
  },
  interview: {
    book: "",
    character: "",
    questions: Array.from({ length: 3 }, () => ({
      question: "",
      answer: "",
      evidence: "",
    })),
  },
  choices: {},
  garden: { ground: "meadow", decoration: "none" },
  templates: [],
  templateDraft: emptyTemplate(),
  works: [],
  portfolio: {
    title: "나의 첫 생각 작품집",
    author: "책숲 탐험가",
    note: "",
    selected: [],
  },
});
export const sampleStory =
  "다람쥐 모모는 숲의 마지막 씨앗을 발견했어요. 혼자 심으면 열매를 모두 가질 수 있었지요. 그때 날개를 다친 참새가 물을 가져오지 못해 걱정했어요. 모모는 씨앗을 함께 돌보자고 말하려다, 친구들이 거절할까 망설였어요. 모모가 작은 목소리로 제안하자 친구들은 각자 할 수 있는 일을 찾았어요. 모모는 땅을 파고, 참새는 그늘에서 씨앗을 지켜 주었지요. 첫 열매가 열렸을 때, 친구들은 어떻게 나눌지 다시 모여 이야기했어요.";
export const sampleDraft = {
  title: "모모에게 보내는 응원",
  body: "모모야, 친구들에게 말하기가 어려웠겠다. 그래도 함께 씨앗을 돌보자고 말한 너를 응원해. 친구들과 힘을 합쳐서 좋았어.",
};

export function readStudio(raw: string): StudioState {
  if (raw.length > 2500000)
    throw new Error("체험 기록이 너무 커요. 보관한 작품 수를 확인해 주세요.");
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error(
      "체험 기록을 읽지 못했어요. 필요한 기록을 백업한 뒤 초기화해 주세요.",
    );
  }
  const result = studioSchema.safeParse(decoded);
  if (!result.success)
    throw new Error(
      "체험 기록 형식이 달라 불러오지 못했어요. 초기화하거나 다른 브라우저에서 시작해 주세요.",
    );
  return result.data;
}
function fail(message: string): never {
  throw new Error(message);
}
export function submitDemo(
  state: StudioState,
  id: string,
  at: string,
): StudioState {
  const d = state.demo;
  if (!d.assigned) fail("먼저 선생님 역할에서 미션을 배정해 주세요.");
  if (!d.title.trim() || !d.body.trim()) fail("제목과 생각을 적어 주세요.");
  const previous = d.versions.at(-1);
  const replay = d.versions.find((v) => v.id === id);
  if (replay) {
    if (replay.title !== d.title.trim() || replay.body !== d.body.trim())
      fail("같은 요청으로 다른 글을 제출할 수 없어요.");
    return state;
  }
  if (previous?.status === "submitted")
    fail("선생님 역할에서 피드백을 남긴 뒤 다시 제출해 주세요.");
  if (
    previous?.body.trim() === d.body.trim() &&
    previous.title.trim() === d.title.trim()
  )
    fail("이전 글과 같아요. 생각이나 표현을 고쳐 주세요.");
  if (previous && !d.reason.trim()) fail("고친 부분과 그 이유를 적어 주세요.");
  if (d.versions.length >= 50)
    fail("체험 제출 기록이 가득 찼어요. 작품집을 내려받은 뒤 초기화해 주세요.");
  const version: DemoVersion = {
    id,
    at,
    version: d.versions.length + 1,
    title: d.title.trim(),
    body: d.body.trim(),
    reason: previous ? d.reason.trim() : "",
    feedback: "",
    status: "submitted",
  };
  return {
    ...state,
    demo: { ...d, reason: "", versions: [...d.versions, version] },
  };
}
export function keepWork(state: StudioState, work: LocalWork): StudioState {
  if (state.works.length >= 60 && !state.works.some((w) => w.id === work.id))
    fail("작품 보관함이 가득 찼어요. 작품집을 먼저 내려받아 주세요.");
  return {
    ...state,
    works: [...state.works.filter((w) => w.id !== work.id), work],
  };
}
export function reviewDemo(
  state: StudioState,
  decision: "revision_requested" | "completed",
  feedback: string,
  at: string,
): StudioState {
  const v = state.demo.versions.at(-1);
  if (!v || v.status !== "submitted") fail("검토할 새 제출본이 없어요.");
  if (!feedback.trim() || feedback.length > 1500)
    fail("1~1,500자의 구체적인 피드백을 적어 주세요.");
  const mission = missions.find((m) => m.id === state.demo.missionId)!;
  if (
    decision === "completed" &&
    mission.requires_revision &&
    !state.demo.versions
      .slice(0, -1)
      .some((p) => p.status === "revision_requested" && p.feedback)
  )
    fail(
      "고쳐 쓰기 미션이에요. 초고에 수정 요청을 남기고 수정본을 받아 주세요.",
    );
  const next = {
    ...state,
    demo: {
      ...state.demo,
      versions: state.demo.versions.map((row) =>
        row.id === v.id
          ? { ...row, status: decision, feedback: feedback.trim() }
          : row,
      ),
    },
  };
  return decision === "completed"
    ? keepWork(next, {
        id: `demo:${v.id}`,
        kind: "writing",
        title: v.title,
        body: v.body,
        original: state.demo.versions[0].body,
        reason: v.reason,
        at,
      })
    : next;
}
export function enterDemo(
  state: StudioState,
  sourceId: string,
  checks: boolean[],
  optedIn: boolean,
  at: string,
): StudioState {
  if (state.demo.entry)
    fail("이미 출품했어요. 체험 출품본은 바꾸지 않고 보관해요.");
  const source = state.demo.versions.find(
    (v) => v.id === sourceId && v.status === "completed",
  );
  if (!source) fail("완료된 제출본을 골라 주세요.");
  if (checks.length !== 4 || checks.some((c) => c !== true) || !optedIn)
    fail("네 가지 기준을 점검하고 체험 출품에 동의해 주세요.");
  return {
    ...state,
    demo: {
      ...state.demo,
      entry: {
        sourceId,
        title: source.title,
        body: source.body,
        at,
        scores: null,
        comment: "",
        published: false,
      },
    },
  };
}
export function judgeDemo(
  state: StudioState,
  scores: unknown,
  comment: string,
): StudioState {
  const entry = state.demo.entry;
  if (!entry || entry.published || entry.scores)
    fail("심사할 체험 출품본이 없거나 심사가 확정됐어요.");
  const parsed = scoreSchema.safeParse(scores);
  if (!parsed.success || !comment.trim() || comment.length > 1500)
    fail("기준별 점수 범위와 1~1,500자의 심사 의견을 확인해 주세요.");
  return {
    ...state,
    demo: {
      ...state.demo,
      entry: { ...entry, scores: parsed.data, comment: comment.trim() },
    },
  };
}
export function publishDemo(state: StudioState): StudioState {
  if (!state.demo.entry?.scores) fail("심사를 먼저 확정해 주세요.");
  return {
    ...state,
    demo: { ...state.demo, entry: { ...state.demo.entry, published: true } },
  };
}
export function cardsBody(state: StudioState): string {
  return state.cards.order
    .map((id) => `${cardLabels[id]}\n${state.cards.answers[id].trim()}`)
    .join("\n\n");
}
export function growth(state: StudioState) {
  const questions = state.works.some(
    (w) => w.kind === "cards" || w.kind === "interview",
  );
  const revision = state.demo.versions.some((v) => v.version > 1);
  const complete = state.demo.versions.some((v) => v.status === "completed");
  const empathy = state.works.some((w) => w.kind === "interview");
  const fairness = state.works.some((w) => w.kind === "choice");
  const milestones = [
    questions,
    state.demo.versions.length > 0,
    revision,
    complete,
    empathy,
    fairness,
    Boolean(state.demo.entry),
    state.portfolio.selected.length > 0,
  ];
  return {
    questions,
    revision,
    complete,
    empathy,
    fairness,
    leaves: milestones.filter(Boolean).length,
    flowers: questions,
    lantern: revision,
    bird: empathy,
  };
}
export const scenarios = [
  {
    id: "fruit",
    title: "첫 열매는 누구의 몫일까?",
    scene:
      "모모는 땅을 파고, 참새는 씨앗을 지켰어요. 첫 열매가 두 개뿐이라면 어떻게 나누면 좋을까요?",
    options: [
      "모두 조금씩 나누기",
      "지금 더 필요한 친구에게 먼저 주기",
      "서로 의논해서 새로운 방법 찾기",
    ],
    after: [
      "똑같이 나누었지만, 배가 많이 고픈 친구는 여전히 배가 고파요.",
      "먼저 받은 친구는 고마워하지만, 오래 기다린 친구는 서운해해요.",
      "여러 의견을 듣다 보니 시간이 걸려요. 빨리 결정하자는 친구도 있어요.",
    ],
  },
  {
    id: "voice",
    title: "목소리가 작은 친구",
    scene:
      "다음 씨앗을 어디에 심을지 정하는 모임이에요. 말이 빠른 친구들 사이에서 참새는 한 번도 말하지 못했어요.",
    options: [
      "모두 한 번씩 말할 차례 만들기",
      "잠깐 쉬고 참새의 생각 따로 듣기",
      "말 대신 그림이나 쪽지로 의견 모으기",
    ],
    after: [
      "차례가 생겼지만, 사람들 앞에서 말하기 어려운 친구도 있어요.",
      "참새의 생각을 들었어요. 그 의견을 모임에서 어떻게 소개할까요?",
      "여러 의견이 모였어요. 글이나 그림이 어려운 친구는 어떻게 참여할까요?",
    ],
  },
] as const;

export type DiffPart = { kind: "same" | "removed" | "added"; text: string };
export function diffWords(before: string, after: string): DiffPart[] {
  if (before === after) return [{ kind: "same", text: before }];
  const a = before.match(/\s+|[^\s]+/g) ?? [],
    b = after.match(/\s+|[^\s]+/g) ?? [];
  // Bound the LCS memory for long writing. The fallback still preserves every character.
  if (a.length * b.length > 160000)
    return [
      { kind: "removed", text: before },
      { kind: "added", text: after },
    ];
  const rows = Array.from(
    { length: a.length + 1 },
    () => new Uint16Array(b.length + 1),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      rows[i][j] =
        a[i] === b[j]
          ? rows[i + 1][j + 1] + 1
          : Math.max(rows[i + 1][j], rows[i][j + 1]);
  const parts: DiffPart[] = [];
  let i = 0,
    j = 0;
  const push = (kind: DiffPart["kind"], text: string) => {
    if (parts.at(-1)?.kind === kind) parts[parts.length - 1].text += text;
    else parts.push({ kind, text });
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push("same", a[i++]);
      j++;
    } else if (
      i < a.length &&
      (j === b.length || rows[i + 1][j] >= rows[i][j + 1])
    )
      push("removed", a[i++]);
    else push("added", b[j++]);
  }
  return parts;
}
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function printableHtml(title: string, contents: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>body{font:16px/1.9 'Malgun Gothic',sans-serif;color:#253b30;max-width:760px;margin:40px auto;padding:24px}h1,h2,h3{line-height:1.5}p{white-space:pre-wrap;overflow-wrap:anywhere}section{break-before:page;margin-top:48px}small{color:#626e61}@media print{@page{size:A4;margin:20mm}body{margin:0;padding:0}button{display:none}}</style></head><body>${contents}</body></html>`;
}
export function portfolioHtml(state: StudioState): string {
  const p = state.portfolio,
    works = p.selected
      .map((id) => state.works.find((w) => w.id === id))
      .filter((w): w is LocalWork => Boolean(w));
  if (!works.length) fail("작품을 한 편 이상 골라 주세요.");
  return printableHtml(
    p.title,
    `<header><small>책숲 · 이 기기에서 만든 작품집</small><h1>${escapeHtml(p.title)}</h1><p>글쓴이 ${escapeHtml(p.author)}</p><h2>작가의 말</h2><p>${escapeHtml(p.note)}</p><h2>목차</h2><ol>${works.map((w) => `<li>${escapeHtml(w.title)}</li>`).join("")}</ol></header>${works.map((w) => `<section><h2>${escapeHtml(w.title)}</h2><p>${escapeHtml(w.body)}</p>${w.original && w.original !== w.body ? `<h3>처음 쓴 글</h3><p>${escapeHtml(w.original)}</p>` : ""}${w.reason ? `<h3>고친 부분과 그 이유</h3><p>${escapeHtml(w.reason)}</p>` : ""}</section>`).join("")}`,
  );
}
