import { describe, expect, it, vi } from "vitest";
import {
  BACKUP_FORMAT,
  createStudioBackup,
  MAX_BACKUP_BYTES,
  parseStudioBackup,
  readBackupFile,
  restoreStudioBackup,
  summarizeBackup,
  type StudioStorage,
} from "@/lib/studio-backup";
import {
  enterDemo,
  growth,
  initialStudio,
  judgeDemo,
  portfolioHtml,
  publishDemo,
  readStudio,
  reviewDemo,
  sampleDraft,
  STUDIO_KEY,
  submitDemo,
} from "@/lib/studio";
import { missions } from "@/lib/missions";
const at = "2026-10-30T01:20:00.000Z";
function fixture() {
  let state = initialStudio();
  state.demo = {
    ...state.demo,
    assigned: true,
    missionId: missions[0].id,
    ...sampleDraft,
  };
  state = reviewDemo(
    submitDemo(state, "first", at),
    "completed",
    "내 생각을 잘 표현했어요.",
    at,
  );
  state = publishDemo(
    judgeDemo(
      enterDemo(state, "first", [true, true, true, true], true, at),
      { thought: 25, evidence: 25, structure: 20, expression: 10 },
      "질문을 응원해요.",
    ),
  );
  state.portfolio.selected = [state.works[0].id];
  state.garden.ground = "sunset";
  return state;
}
function memoryStorage(raw: string | null) {
  let current = raw;
  const storage: StudioStorage = {
    getItem: vi.fn(() => current),
    setItem: vi.fn((_key, value) => {
      current = value;
    }),
  };
  return { storage, read: () => current };
}
describe("책숲 백업 파일", () => {
  it("제출·완료·출품·발표·작품집·꾸미기 기록을 날짜 있는 백업으로 왕복한다", () => {
    const state = fixture();
    const preview = parseStudioBackup(createStudioBackup(state, at));
    expect(preview).toEqual({ state, createdAt: at, legacy: false });
    expect(summarizeBackup(preview.state)).toEqual({
      versions: 1,
      completed: 1,
      works: 1,
      missions: 0,
      selected: 1,
      hasDraft: true,
    });
  });
  it("이전에 내려받은 일반 JSON 백업도 불러온다", () => {
    const state = fixture();
    expect(parseStudioBackup(JSON.stringify(state, null, 2))).toEqual({
      state,
      legacy: true,
      createdAt: null,
    });
  });
  it("BOM이 있는 UTF-8 JSON을 불러온다", () =>
    expect(
      parseStudioBackup("\uFEFF" + createStudioBackup(initialStudio(), at))
        .state,
    ).toEqual(initialStudio()));
  it.each(["not json", "null", "[]", "{}", '{"schema":2}'])(
    "손상되거나 다른 문서인 파일을 거부한다: %s",
    (raw) => expect(() => parseStudioBackup(raw)).toThrow(),
  );
  it("다른 앱 형식과 알 수 없는 백업 버전을 거부한다", () => {
    const file = JSON.parse(createStudioBackup(initialStudio(), at));
    expect(() =>
      parseStudioBackup(JSON.stringify({ ...file, format: "other-app" })),
    ).toThrow("형식");
    expect(() =>
      parseStudioBackup(JSON.stringify({ ...file, version: 2 })),
    ).toThrow("형식");
  });
  it("날짜나 본문이 빠진 파일을 거부한다", () => {
    expect(() =>
      parseStudioBackup(
        JSON.stringify({
          format: BACKUP_FORMAT,
          version: 1,
          createdAt: "잘못된 날짜",
          data: initialStudio(),
        }),
      ),
    ).toThrow("날짜");
    expect(() =>
      parseStudioBackup(
        JSON.stringify({ format: BACKUP_FORMAT, version: 1, createdAt: at }),
      ),
    ).toThrow("기록 형식");
  });
  it("출품본과 원본의 연결이 끊긴 기록을 복원 후보로 받지 않는다", () => {
    const state = fixture();
    state.demo.entry!.body = "다른 글";
    expect(() => parseStudioBackup(JSON.stringify(state))).toThrow("작품 연결");
    expect(() => createStudioBackup(state, at)).toThrow("형식");
  });
  it("파일 크기를 읽기 전에 검사한다", async () => {
    const text = vi.fn(async () => "{}");
    await expect(
      readBackupFile({ size: MAX_BACKUP_BYTES + 1, text }),
    ).rejects.toThrow("8MB");
    expect(text).not.toHaveBeenCalled();
  });
  it("선언된 크기와 달라도 실제 UTF-8 바이트 수를 제한한다", () => {
    expect(() =>
      parseStudioBackup("가".repeat(Math.floor(MAX_BACKUP_BYTES / 3) + 1)),
    ).toThrow("8MB");
  });
  it("파일 읽기 실패와 정상 파일을 구분한다", async () => {
    await expect(
      readBackupFile({
        size: 10,
        text: async () => {
          throw new Error("private file details");
        },
      }),
    ).rejects.toThrow("파일을 열지 못했어요");
    const raw = createStudioBackup(initialStudio(), at);
    expect(
      (
        await readBackupFile({
          size: new TextEncoder().encode(raw).length,
          text: async () => raw,
        })
      ).state,
    ).toEqual(initialStudio());
  });
});
describe("체험 기록 복원", () => {
  it("파일 선택만으로 저장소를 바꾸지 않는다", () => {
    const { storage } = memoryStorage("before");
    parseStudioBackup(createStudioBackup(fixture(), at));
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("확인한 원본이 그대로일 때만 지정 키에 한 번 기록한다", () => {
    const state = fixture(),
      { storage, read } = memoryStorage("before");
    const raw = restoreStudioBackup(storage, state, "before");
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(STUDIO_KEY, raw);
    const restored = readStudio(read()!);
    expect(restored).toEqual(state);
    expect(growth(restored).complete).toBe(true);
    expect(portfolioHtml(restored)).toContain(sampleDraft.title);
  });
  it("새 브라우저의 빈 저장소에서도 복원한다", () => {
    const { storage, read } = memoryStorage(null);
    restoreStudioBackup(storage, initialStudio(), null);
    expect(readStudio(read()!)).toEqual(initialStudio());
  });
  it("백업을 고른 후 다른 탭에서 생긴 변경을 덮어쓰지 않는다", () => {
    const { storage, read } = memoryStorage("newer record");
    expect(() => restoreStudioBackup(storage, fixture(), "old record")).toThrow(
      "기록이 바뀌었어요",
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(read()).toBe("newer record");
  });
  it("저장 공간 부족이면 성공을 반환하지 않고 기존 기록을 유지한다", () => {
    const { storage, read } = memoryStorage("existing");
    storage.setItem = vi.fn(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => restoreStudioBackup(storage, fixture(), "existing")).toThrow(
      "기존 기록은 그대로",
    );
    expect(read()).toBe("existing");
  });
  it("저장소 읽기 실패나 후보 변조 시에는 쓰지 않는다", () => {
    const { storage } = memoryStorage(null);
    storage.getItem = vi.fn(() => {
      throw new Error("SecurityError");
    });
    expect(() => restoreStudioBackup(storage, fixture(), null)).toThrow(
      "확인하지 못해",
    );
    expect(storage.setItem).not.toHaveBeenCalled();
    const bad = initialStudio();
    bad.portfolio.selected = ["missing-work"];
    expect(() => restoreStudioBackup(storage, bad, null)).toThrow("형식");
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
