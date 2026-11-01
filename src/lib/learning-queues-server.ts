import "server-only";
import { requireProfile } from "./auth";
import { createClient } from "./supabase/server";
import { z } from "zod";
import type { TodayState, ReviewState } from "./learning-queues";
export async function loadStudentToday(page = 1): Promise<TodayState | null> {
  const p = await requireProfile();
  if (p.role !== "student" || p.consent_status !== "verified") return null;
  const c = await createClient(),
    r = await c.rpc("student_today_state", {
      p_page: Math.max(1, Math.min(100000, Math.trunc(page) || 1)),
    });
  if (r.error || !r.data)
    throw Error(
      "오늘 할 일을 읽지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.",
    );
  return r.data as TodayState;
}
export async function loadReviewQueue(
  classroom?: string,
  kind?: string,
  page = 1,
): Promise<ReviewState> {
  const p = await requireProfile();
  if (p.role !== "teacher") throw Error("선생님 계정에서 확인해 주세요.");
  const c = await createClient(),
    r = await c.rpc("review_queue_state", {
      p_classroom: z.uuid().safeParse(classroom).success ? classroom : null,
      p_kind: kind === "reading" ? "reading" : "writing",
      p_page: Math.max(1, Math.min(100000, Math.trunc(page) || 1)),
    });
  if (r.error || !r.data)
    throw Error(
      "학생 확인함을 읽지 못했어요. 담당 학급과 연결을 확인해 주세요.",
    );
  return r.data as ReviewState;
}
