import {
  readStudio,
  STUDIO_KEY,
  studioSchema,
  type StudioState,
} from "./studio";

export const BACKUP_FORMAT = "bookforest-studio-backup";
export const MAX_BACKUP_BYTES = 8_000_000;
const SIZE_ERROR =
  "백업 파일은 8MB 이하만 불러올 수 있어요. 기존 기록은 그대로 있어요.";
export type BackupPreview = {
  state: StudioState;
  createdAt: string | null;
  legacy: boolean;
};
export type StudioStorage = Pick<Storage, "getItem" | "setItem">;

export function createStudioBackup(
  state: StudioState,
  at = new Date().toISOString(),
): string {
  const data = studioSchema.safeParse(state);
  if (!data.success || !Number.isFinite(Date.parse(at)))
    throw new Error(
      "기록을 백업할 수 없어요. 현재 기록의 형식을 확인해 주세요.",
    );
  const raw = JSON.stringify(
    { format: BACKUP_FORMAT, version: 1, createdAt: at, data: data.data },
    null,
    2,
  );
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES)
    throw new Error(SIZE_ERROR);
  return raw;
}

export function parseStudioBackup(raw: string): BackupPreview {
  if (
    raw.length > MAX_BACKUP_BYTES ||
    new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES
  )
    throw new Error(SIZE_ERROR);
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(
      "백업 파일을 읽지 못했어요. 책숲에서 내려받은 JSON 파일을 골라 주세요.",
    );
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded))
    throw new Error("책숲 체험 기록이 담긴 백업 파일을 골라 주세요.");
  const record = decoded as Record<string, unknown>;
  let data: unknown = record,
    createdAt: string | null = null,
    legacy = true;
  if ("format" in record) {
    if (record.format !== BACKUP_FORMAT || record.version !== 1)
      throw new Error(
        "이 백업 형식은 현재 책숲에서 불러올 수 없어요. 기존 기록은 그대로 있어요.",
      );
    if (
      typeof record.createdAt !== "string" ||
      !Number.isFinite(Date.parse(record.createdAt))
    )
      throw new Error(
        "백업 날짜를 확인하지 못했어요. 다른 백업 파일을 골라 주세요.",
      );
    data = record.data;
    createdAt = record.createdAt;
    legacy = false;
  }
  try {
    return {
      state: readStudio(JSON.stringify(data) ?? "null"),
      createdAt,
      legacy,
    };
  } catch {
    throw new Error(
      "백업의 기록 형식이나 작품 연결이 맞지 않아요. 기존 기록을 바꾸지 않았어요.",
    );
  }
}

export async function readBackupFile(file: {
  size: number;
  text: () => Promise<string>;
}): Promise<BackupPreview> {
  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > MAX_BACKUP_BYTES
  )
    throw new Error(SIZE_ERROR);
  let raw: string;
  try {
    raw = await file.text();
  } catch {
    throw new Error(
      "파일을 열지 못했어요. 내려받은 백업 파일을 다시 골라 주세요.",
    );
  }
  return parseStudioBackup(raw);
}

export function summarizeBackup(state: StudioState) {
  return {
    versions: state.demo.versions.length,
    completed: state.demo.versions.filter((v) => v.status === "completed")
      .length,
    works: state.works.length,
    missions: state.templates.length,
    selected: state.portfolio.selected.length,
    hasDraft: Boolean(state.demo.title || state.demo.body),
  };
}

// Compare before the one synchronous storage write. A validation/conflict/quota failure
// never swaps the UI to an unpersisted restore or overwrites a newer tab's record.
export function restoreStudioBackup(
  storage: StudioStorage,
  state: StudioState,
  expectedRaw: string | null,
): string {
  const data = studioSchema.safeParse(state);
  if (!data.success)
    throw new Error(
      "복원할 기록의 형식을 확인해 주세요. 기존 기록은 그대로 있어요.",
    );
  let current: string | null;
  try {
    current = storage.getItem(STUDIO_KEY);
  } catch {
    throw new Error(
      "이 브라우저의 저장 공간을 확인하지 못해 복원하지 않았어요.",
    );
  }
  if (current !== expectedRaw)
    throw new Error(
      "파일을 고른 뒤 체험 기록이 바뀌었어요. 백업 파일을 다시 선택하고 내용을 확인해 주세요.",
    );
  const raw = JSON.stringify(data.data);
  try {
    storage.setItem(STUDIO_KEY, raw);
  } catch {
    throw new Error(
      "저장 공간이 부족하거나 잠겨 있어 복원하지 못했어요. 기존 기록은 그대로 있어요.",
    );
  }
  return raw;
}
