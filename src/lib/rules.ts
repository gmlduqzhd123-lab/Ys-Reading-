import { z } from "zod";

export const WRITING_TITLE_LIMIT = 100;
export const WRITING_BODY_LIMIT = 10_000;

export const writingSchema = z.object({
  title: z
    .string({ error: "글 제목을 입력해 주세요." })
    .trim()
    .min(1, "글 제목을 입력해 주세요.")
    .max(WRITING_TITLE_LIMIT, "제목은 100자 이내로 작성해 주세요."),
  body: z
    .string({ error: "글 내용을 입력해 주세요." })
    .trim()
    .min(1, "글 내용을 입력해 주세요.")
    .max(WRITING_BODY_LIMIT, "내용은 10,000자 이내로 작성해 주세요."),
});

export type WritingInput = z.infer<typeof writingSchema>;

export function validateWriting(title: unknown, body: unknown) {
  return writingSchema.safeParse({ title, body });
}

const REDIRECT_BASE = "https://bookforest.invalid";
const DEFAULT_REDIRECT = "/app";

function isInternalPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return false;
  }

  let decoded = value;
  // Check decoded forms as well: a framework may decode a path after this check.
  // Limit the work and reject excessive nesting rather than trusting it.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (
      !decoded.startsWith("/") ||
      decoded.startsWith("//") ||
      /[\\\u0000-\u001f\u007f]/.test(decoded)
    ) {
      return false;
    }
    try {
      const url = new URL(decoded, REDIRECT_BASE);
      if (url.origin !== REDIRECT_BASE || url.pathname.startsWith("//")) {
        return false;
      }
      const next = decodeURIComponent(decoded);
      if (next === decoded) return true;
      decoded = next;
    } catch {
      return false;
    }
  }
  return false;
}

/** Accept only an in-app path, including when the caller supplies a fallback. */
export function safeInternalRedirect(
  value: unknown,
  fallback = DEFAULT_REDIRECT,
): string {
  if (isInternalPath(value)) return value;
  return isInternalPath(fallback) ? fallback : DEFAULT_REDIRECT;
}

/** All user-facing dates use the service's Korea timezone, not the host timezone. */
export function formatKoreanDate(
  value: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (value === null || value === undefined || value === "") return "날짜 미정";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 미정";

  const formatOptions = options ?? {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  return new Intl.DateTimeFormat("ko-KR", {
    ...formatOptions,
    timeZone: "Asia/Seoul",
  }).format(date);
}
