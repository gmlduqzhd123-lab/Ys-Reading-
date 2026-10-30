"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Profile } from "@/lib/auth";
import type { Classroom, Assignment, Draft, Submission, Contest, Entry, Review } from "@/lib/data";

export type ActionResult<T = unknown> = { ok: boolean; message: string; data?: T };

class ActionFailure extends Error {}
const uuid = z.string().uuid();
const writing = {
  title: z.string().trim().min(1).max(100),
  body: z.string().max(10000).refine((value) => value.trim().length > 0),
};
const optionalDraftWriting = { title: z.string().max(100), body: z.string().max(10000) };

function friendlyError(error: unknown): string {
  if (error instanceof ActionFailure) return error.message;
  if (error instanceof z.ZodError) return "입력 내용을 확인해 주세요. 필수 항목과 글자 수를 다시 살펴봐 주세요.";
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  if (message.includes("BF_NOT_CONFIGURED")) return "아직 학급 서비스 연결을 준비하고 있어요. 잠시 후 다시 방문해 주세요.";
  if (/BF_(DRAFT_CONFLICT|REVISION_MISMATCH)/.test(message)) return "다른 창에서 글이 바뀌었어요. 현재 글을 복사해 보관한 뒤 새로고침해 주세요.";
  if (/BF_.*CONSENT/.test(message)) return "보호자 동의 확인을 기다리고 있어요. 선생님에게 문의해 주세요.";
  if (message.includes("BF_INVALID_DEADLINE")) return "권장 마감은 현재보다 뒤의 날짜로 정해 주세요.";
  if (message.includes("BF_CONTEST_STILL_OPEN")) return "아직 접수 중이에요. 마감 후에 심사와 결과 안내를 진행해 주세요.";
  if (message.includes("BF_NO_ENTRIES")) return "아직 접수된 작품이 없어 결과를 안내할 수 없어요.";
  if (message.includes("BF_INVALID_SCORES")) return "평가 항목별 배점과 점수를 다시 확인해 주세요.";
  if (/BF_.*(DEADLINE|CLOSED|NOT_OPEN|WINDOW)/.test(message)) return "현재 접수 가능한 시간이 아니에요. 대회 일정을 확인해 주세요.";
  if (/BF_.*(IDEMPOTENCY|REQUEST_MISMATCH)/.test(message)) return "이전 요청과 내용이 달라요. 접수 결과를 먼저 확인한 뒤 다시 시도해 주세요.";
  if (/BF_.*(REVISION_REQUIRED|NEEDS_REVISION)/.test(message)) return "이 미션은 피드백과 수정 제출을 마친 뒤 완료할 수 있어요.";
  if (message.includes("BF_REVISION_NOT_REQUESTED")) return "선생님이 이전 글을 확인하고 있어요. 피드백이 도착하면 다시 제출할 수 있어요.";
  if (message.includes("BF_REVISION_UNCHANGED")) return "이전 제출본과 같은 내용이에요. 글을 다듬은 뒤 다시 제출해 주세요.";
  if (/BF_.*(STALE|LATEST)/.test(message)) return "새로운 제출본이 있어요. 최신 제출본을 열어 확인해 주세요.";
  if (/BF_.*(NOT_COMPLETED|INELIGIBLE|COMPLETED_WORK_REQUIRED)/.test(message)) return "선생님이 완료 처리한 작품만 출품할 수 있어요.";
  if (/BF_.*(INCOMPLETE|MISSING_REVIEW|UNREVIEWED)/.test(message)) return "아직 심사가 끝나지 않은 작품이 있어요.";
  if (/BF_.*(FORBIDDEN|UNAUTHORIZED|MEMBERSHIP|AUTH|NOT_FOUND)/.test(message)) return "이 활동을 이용할 권한을 확인하지 못했어요. 선생님에게 문의해 주세요.";
  if (/BF_.*(ALREADY|DUPLICATE)/.test(message)) return "이미 처리된 활동이에요. 현재 기록을 확인해 주세요.";
  return "요청을 완료하지 못했어요. 내용을 보관한 뒤 잠시 후 다시 시도해 주세요.";
}

async function actor(requiredRole?: "student" | "teacher", needsConsent = true) {
  if (!isSupabaseConfigured()) throw new ActionFailure("아직 학급 서비스 연결을 준비하고 있어요.");
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new ActionFailure("로그인이 필요해요. 다시 로그인해 주세요.");
  const { data, error: profileError } = await supabase.from("profiles")
    .select("id,display_name,role,consent_status").eq("id", user.id).maybeSingle();
  if (profileError || !data) throw new ActionFailure("계정 준비 상태를 확인해 주세요. 선생님 또는 운영자에게 문의해 주세요.");
  const profile = data as Profile;
  if (requiredRole && profile.role !== requiredRole) throw new ActionFailure("이 작업을 할 수 있는 계정이 아니에요.");
  if (needsConsent && profile.role === "student" && profile.consent_status !== "verified") {
    throw new ActionFailure("보호자 동의 확인을 기다리고 있어요. 선생님에게 문의해 주세요.");
  }
  return { supabase, profile };
}

async function command<T>(role: "student" | "teacher", rpc: string, parameters: Record<string, unknown>, success: string, refresh = true): Promise<ActionResult<T>> {
  try {
    const { supabase } = await actor(role);
    const { data, error } = await supabase.rpc(rpc, parameters);
    if (error) throw error;
    if (!data) throw new Error("BF_EMPTY_RESULT");
    if (refresh) revalidatePath("/app", "layout");
    return { ok: true, message: success, data: (Array.isArray(data) ? data[0] : data) as T };
  } catch (error) { return { ok: false, message: friendlyError(error) }; }
}

function formDate(value: FormDataEntryValue | null, required: boolean): string | null {
  if (typeof value !== "string" || !value.trim()) {
    if (required) throw new ActionFailure("날짜와 시간을 입력해 주세요.");
    return null;
  }
  // A datetime-local field is displayed in Korea time, never the deployment host's time zone.
  const candidate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value) ? `${value}+09:00` : value;
  const timestamp = Date.parse(candidate);
  if (!Number.isFinite(timestamp)) throw new ActionFailure("날짜와 시간을 다시 확인해 주세요.");
  return new Date(timestamp).toISOString();
}

export async function login(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "아직 학급 서비스 연결을 준비하고 있어요." };
  try {
    const identifier = z.string().trim().min(3).max(254).parse(formData.get("identifier") ?? formData.get("email"));
    const password = z.string().min(1).max(256).parse(formData.get("password"));
    const isEmail = identifier.includes("@");
    const email = isEmail
      ? z.email().parse(identifier)
      : `${z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/).parse(identifier).toLowerCase()}@students.bookforest.invalid`;
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { ok: false, message: "아이디 또는 비밀번호를 확인해 주세요." };
    const { data: profile, error: profileError } = await supabase.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
    if (profileError || !profile) {
      await supabase.auth.signOut();
      return { ok: false, message: "계정 준비 상태를 확인해 주세요. 선생님 또는 운영자에게 문의해 주세요." };
    }
  } catch (error) { return { ok: false, message: friendlyError(error) }; }
  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function logout(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error("로그아웃을 완료하지 못했어요. 다시 시도해 주세요.");
  }
  revalidatePath("/app", "layout");
  redirect("/");
}

export async function createClassroom(formData: FormData): Promise<ActionResult<Classroom>> {
  try {
    const name = z.string().trim().min(2).max(80).parse(formData.get("name"));
    return command("teacher", "create_classroom", { p_name: name }, "새 학급을 만들었어요.");
  } catch (error) { return { ok: false, message: friendlyError(error) }; }
}

export async function assignMission(formData: FormData): Promise<ActionResult<Assignment>> {
  try {
    const classroomId = uuid.parse(formData.get("classroomId"));
    const missionId = uuid.parse(formData.get("missionId"));
    const dueAt = formDate(formData.get("dueAt"), false);
    return command("teacher", "assign_mission", { p_classroom_id: classroomId, p_mission_id: missionId, p_due_at: dueAt }, "미션을 학급에 배정했어요.");
  } catch (error) { return { ok: false, message: friendlyError(error) }; }
}

export async function saveDraft(input: { assignmentId: string; title: string; body: string; expectedRevision: number }): Promise<ActionResult<Draft>> {
  try {
    const value = z.object({ assignmentId: uuid, ...optionalDraftWriting, expectedRevision: z.number().int().min(0) }).strict().parse(input);
    return command("student", "save_draft", {
      p_assignment_id: value.assignmentId, p_title: value.title, p_body: value.body, p_expected_revision: value.expectedRevision,
    }, "저장했어요.", false);
  } catch (error) { return { ok: false, message: friendlyError(error) }; }
}

export async function submitWork(input: { assignmentId: string; title: string; body: string; requestId: string }): Promise<ActionResult<Submission>> {
  try {
    const value = z.object({ assignmentId: uuid, ...writing, requestId: uuid }).strict().parse(input);
    return command("student", "submit_work", {
      p_assignment_id: value.assignmentId, p_title: value.title, p_body: value.body, p_request_id: value.requestId,
    }, "선생님께 글을 제출했어요.");
  } catch (error) { return { ok: false, message: friendlyError(error) }; }
}

export async function reviewWork(input: { submissionId: string; body: string; decision: "revision_requested" | "completed" }): Promise<ActionResult<Submission>> {
  try {
    const value = z.object({ submissionId: uuid, body: z.string().trim().min(1).max(2000), decision: z.enum(["revision_requested", "completed"]) }).strict().parse(input);
    return command("teacher", "review_work", { p_submission_id: value.submissionId, p_body: value.body, p_decision: value.decision }, value.decision === "completed" ? "작품을 완료 처리했어요." : "수정할 내용을 학생에게 전했어요.");
  } catch (error) { return { ok: false, message: friendlyError(error) }; }
}

export async function createContest(formData: FormData): Promise<ActionResult<Contest>> {
  try {
    const classroomId = uuid.parse(formData.get("classroomId"));
    const title = z.string().trim().min(2).max(100).parse(formData.get("title"));
    const description = z.string().trim().min(1).max(3000).parse(formData.get("description"));
    const opensAt = formDate(formData.get("opensAt"), true)!;
    const closesAt = formDate(formData.get("closesAt"), true)!;
    if (Date.parse(closesAt) <= Date.parse(opensAt)) throw new ActionFailure("마감은 접수 시작보다 뒤여야 해요.");
    return command("teacher", "create_contest", { p_classroom_id: classroomId, p_title: title, p_description: description, p_opens_at: opensAt, p_closes_at: closesAt }, "학급 글쓰기 축제를 열었어요.");
  } catch (error) { return { ok: false, message: friendlyError(error) }; }
}

export async function enterContest(input: { contestId: string; submissionId: string; requestId: string }): Promise<ActionResult<Entry>> {
  try {
    const value = z.object({ contestId: uuid, submissionId: uuid, requestId: uuid }).strict().parse(input);
    return command("student", "enter_contest", { p_contest_id: value.contestId, p_submission_id: value.submissionId, p_request_id: value.requestId }, "작품을 접수했어요. 접수번호를 확인해 주세요.");
  } catch (error) { return { ok: false, message: friendlyError(error) }; }
}

export async function submitReview(input: { entryId: string; scores: { thought: number; evidence: number; structure: number; expression: number }; comment: string }): Promise<ActionResult<Review>> {
  try {
    const value = z.object({
      entryId: uuid,
      scores: z.object({ thought: z.number().int().min(0).max(30), evidence: z.number().int().min(0).max(30), structure: z.number().int().min(0).max(25), expression: z.number().int().min(0).max(15) }).strict(),
      comment: z.string().trim().min(1).max(2000),
    }).strict().parse(input);
    return command("teacher", "submit_review", { p_entry_id: value.entryId, p_scores: value.scores, p_comment: value.comment }, "심사를 저장했어요.");
  } catch (error) { return { ok: false, message: friendlyError(error) }; }
}

export async function publishContest(input: { contestId: string }): Promise<ActionResult<Contest>> {
  try {
    const value = z.object({ contestId: uuid }).strict().parse(input);
    return command("teacher", "publish_contest", { p_contest_id: value.contestId }, "참가 학생에게 심사 결과를 안내했어요.");
  } catch (error) { return { ok: false, message: friendlyError(error) }; }
}
