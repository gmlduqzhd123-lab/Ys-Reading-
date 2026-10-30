import { describe, expect, it } from "vitest";
import { initialWritingState } from "@/lib/writing-state";
describe("글쓰기 화면 재진입", () => {
  const submission = { title: "고친 제목", body: "피드백을 반영한 두 번째 글", created_at: "2026-10-30T15:00:00Z" };
  it("완료한 최신 제출본보다 오래된 초안을 다시 보여주지 않는다", () => {
    const draft = { title: "초고", body: "처음 쓴 글", updated_at: "2026-10-30T14:00:00Z" };
    expect(initialWritingState(draft, submission)).toEqual({ content: { title: submission.title, body: submission.body }, savedAt: submission.created_at });
  });
  it("제출 후 새로 고친 초안은 빈 제목과 문단까지 그대로 복구한다", () => {
    const draft = { title: "", body: "새로운 문장\n\n다음 문단", updated_at: "2026-10-30T15:01:00Z" };
    expect(initialWritingState(draft, submission).content).toEqual({ title: "", body: draft.body });
  });
  it("동일한 시각이면 제출된 불변 버전을 우선한다", () => {
    expect(initialWritingState({ title: "초고", body: "초고", updated_at: submission.created_at }, submission).content.body).toBe(submission.body);
  });
  it("초안만 있거나 새 미션인 경우도 시작 상태를 보존한다", () => {
    const draft = { title: "첫 생각", body: "첫 문장", updated_at: "2026-10-30T14:00:00Z" };
    expect(initialWritingState(draft).content).toEqual({ title: draft.title, body: draft.body });
    expect(initialWritingState()).toEqual({ content: { title: "", body: "" }, savedAt: null });
  });
});
