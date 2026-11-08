"use server";
import { z } from "zod";
import { cookies } from "next/headers";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
const classroom = z.union([z.uuid(), z.literal("")]);
export async function setClassStudentView(owner:string, input:unknown) {
  const p=await requireProfile();
  if(p.id!==z.uuid().parse(owner)||p.role!=="teacher")throw Error("선생님 계정으로 다시 확인해 주세요.");
  const v=z.object({classroom:z.uuid(),simple:z.boolean(),guidance:z.enum(["line","guided","free"])}).strict().parse(input);
  const c=await createClient(),r=await c.rpc("set_class_student_view",{p_classroom:v.classroom,p_simple:v.simple,p_guidance:v.guidance});
  if(r.error)throw Error("학급 소유 교사 권한과 연결 상태를 확인해 주세요.");
}
export async function rememberHubClass(owner: string, id: string) {
  const p = await requireProfile();
  if (p.id !== z.uuid().parse(owner)) throw Error("로그인 계정이 바뀌었어요.");
  classroom.parse(id);
  if (id) {
    const c = await createClient(),
      r = await c.from("classrooms").select("id").eq("id", id).single();
    if (r.error || !r.data) throw Error("선택한 학급을 확인해 주세요.");
  }
  (await cookies()).set("bf_class_" + p.id, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/hub",
    maxAge: 30 * 86400,
  });
}
export async function batchExportAction(owner: string, input: unknown) {
  const p = await requireProfile();
  if (p.id !== z.uuid().parse(owner)) throw Error("로그인 계정이 바뀌었어요.");
  const c = await createClient();
  const v = z
    .discriminatedUnion("action", [
      z.object({ action: z.literal("list") }).strict(),
      z
        .object({
          action: z.literal("start"),
          title: z.string().trim().min(1).max(100),
          kind: z.enum(["reading", "writing", "draft"]),
          format: z.enum(["docx", "csv", "google-docs", "google-sheets"]),
          includeNames: z.boolean(),
          selection: z.enum(["all", "latest", "completed"]).default("all"),
          requestId:z.uuid(),
          classroom,
          from: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
          to: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
        })
        .strict(),
      z
        .object({
          action: z.literal("part"),
          id: z.uuid(),
          part: z.number().int().min(0).max(399),
          done: z.boolean().default(false),
          url: z.url().nullable().default(null),
        })
        .strict(),
      z.object({action:z.literal("discard"),id:z.uuid()}).strict(),
      z.object({action:z.literal("zip"),id:z.uuid(),operation:z.enum(["start","status","cancel"])}).strict(),
    ])
    .parse(input);
  const r =
    v.action === "start"
      ? await c.rpc("create_export_batch", {
          p_title: v.title,
          p_kind: v.kind,
          p_format: v.format,
          p_names: v.includeNames,
          p_classroom: v.classroom || null,
          p_from: v.from || null,
          p_to: v.to || null,
          p_selection: v.selection,
          p_request:v.requestId,
        })
      : v.action==="discard"?await c.rpc("discard_export_batch",{p_id:v.id}):v.action==="zip"?await c.rpc("zip_job",{p_batch:v.id,p_action:v.operation}):await c.rpc(
          "export_batch_state",
          v.action === "list"
            ? {}
            : { p_id: v.id, p_part: v.part, p_done: v.done, p_url: v.url },
        );
  if (r.error)
    throw Error(
      /BF_EXPORT_(QUOTA|STORAGE_QUOTA)/.test(r.error.message)?"내보내기 한도에 도달했어요. 필요 없는 묶음을 지우거나 다음 날 다시 만들어 주세요. 보관 10개·하루 새 묶음 20개·원문 합계 64MiB까지 지원합니다.":r.error.message.includes("BF_EXPORT_NOT_GENERATED")
        ? "파일 생성 확인 후 다시 시도해 주세요."
        : r.error.message.includes("BF_EXPORT_TOO_LARGE") ? "선택한 기록이 커요. 학급·날짜 범위를 나누어 새 묶음을 만들어 주세요."
        : "조건·권한·연결을 확인해 주세요. 기록은 1~10,000건까지 묶을 수 있습니다.",
    );
  return r.data;
}
export async function manageOperatorInvitation(input: unknown) {
  const v = z
      .object({
        email: z.email().max(254),
        name: z.string().trim().min(2).max(40),
        revoke: z.boolean(),
      })
      .strict()
      .parse(input),
    p = await requireProfile();
  if (!p.operator) throw Error("운영자 권한이 필요해요.");
  const c = await createClient(),
    r = await c.rpc("operator_manage_invitation", {
      p_email: v.email,
      p_name: v.name,
      p_revoke: v.revoke,
    });
  if (r.error)
    throw Error(
      "2단계 인증 확인 후 다시 시도해 주세요. 수락한 계정은 권한 관리에서 변경합니다.",
    );
  return {
    message: v.revoke
      ? "대기 중 초대를 취소했어요."
      : "14일간 수락할 수 있도록 준비했어요. 소유자가 직접 로그인·인증앱 확인·수락해야 하며 이메일은 자동 발송하지 않습니다.",
  };
}
export async function checkDomesticProvider() {
  const p = await requireProfile();
  if (!p.operator) throw Error("운영자 권한이 필요해요.");
  const { domesticBookSearchConfigured, searchBooks } = await import(
    "@/lib/book-search"
  );
  if (!domesticBookSearchConfigured())
    return {
      message:
        "국내 API 키 발급·운영 환경 등록을 기다리고 있어요. 연결 코드와 비공개 설정 도구는 준비돼 있습니다.",
    };
  try {
    const r = await searchBooks("어린 왕자");
    return {
      message:
        ["알라딘", "카카오 도서 검색"].includes(r.source) && r.books.length
          ? `${r.source} 실제 응답 확인 · 검색 결과 ${r.books.length}건`
          : `국내 제공자의 결과를 확인하지 못했어요. 현재 응답: ${r.source}. 키·제공자 권한을 확인해 주세요.`,
    };
  } catch {
    return {
      message: "제공자 응답을 확인하지 못했어요. 키·권한·연결을 확인해 주세요.",
    };
  }
}
export async function requestCloudBackup() {
  const p = await requireProfile();
  if (!p.operator) throw Error("운영자 권한이 필요해요.");
  const c = await createClient(),
    r = await c.rpc("operator_request_cloud_backup");
  if (r.error) throw Error("최근 2단계 인증과 서버 백업 설정을 확인해 주세요.");
  return {
    message:
      "서버 예약 작업에 새 백업을 요청했어요. 5분 주기로 확인하며 최근 실행이 있으면 최대 15분 간격 제한 후 실행합니다. 완료·복원 검증은 별도로 확인해 주세요.",
  };
}
