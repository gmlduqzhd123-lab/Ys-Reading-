"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { growthTermError } from "@/lib/growth-terms";
const schema = z.object({
  classroom: z.uuid(),
  student: z.uuid(),
  from: z.iso.date().nullable(),
  until: z.iso.date().nullable(),
  works: z.array(z.uuid()).max(3),
  title: z.string().trim().min(1).max(100),
  note: z.string().max(2000),
  publish: z.boolean(),
  confirmed: z.literal(true),
  version: z.number().int().min(0),
  requestId: z.uuid(),
  sourceToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export async function createReport(input: unknown) {
  try {
    const p = await requireProfile();
    if (p.role !== "teacher") throw Error("BF_FORBIDDEN");
    const v = schema.parse(input),
      c = await createClient(),
      r = await c.rpc("create_reviewed_report", {
        p_classroom: v.classroom,
        p_student: v.student,
        p_from: v.from,
        p_until: v.until,
        p_works: v.works,
        p_title: v.title,
        p_note: v.note,
        p_source_token: v.sourceToken,
        p_expected_version: v.version,
        p_request_id: v.requestId,
      });
    if (r.error) throw r.error;
    revalidatePath("/reports");
    return {
      ok: true,
      message:
        "보고서 초안을 새 판으로 저장했어요. 내용을 검토한 뒤 공개할 수 있습니다.",
      data: r.data,
    };
  } catch (e) {
    const code = String(
      e && typeof e === "object" && "message" in e ? e.message : e,
    );
    return {
      ok: false,
      message: code.includes("BF_REPORT_SOURCE_CHANGED")
        ? "활동 기록이 바뀌었어요. 성장 기록을 다시 불러와 확인해 주세요."
        : code.includes("BF_REPORT_CONFLICT")
          ? "다른 화면에서 보고서를 저장했어요. 새로고침 후 확인해 주세요."
          : growthTermError(e),
    };
  }
}
export async function reviewReport(input: unknown) {
  try {
    const p = await requireProfile();
    if (p.role !== "teacher") throw Error("BF_FORBIDDEN");
    const v = z
      .object({
        id: z.uuid(),
        action: z.enum(["review", "publish", "withdraw"]),
        revision: z.number().int().positive(),
        requestId: z.uuid(),
        confirmed: z.literal(true),
      })
      .parse(input);
    const c = await createClient(),
      r = await c.rpc("report_review_command", {
        p_report: v.id,
        p_action: v.action,
        p_revision: v.revision,
        p_request_id: v.requestId,
      });
    if (r.error) throw r.error;
    revalidatePath("/reports");
    return {
      ok: true,
      message:
        v.action === "withdraw"
          ? "학생 공개를 취소했어요. 이미 내보낸 외부 사본은 회수되지 않습니다."
          : v.action === "review"
            ? "검토를 완료했어요. 공개 범위를 확인한 뒤 학생에게 공개하세요."
            : "학생에게 공개했어요.",
    };
  } catch (e) {
    const m = String(
      e && typeof e === "object" && "message" in e ? e.message : e,
    );
    return {
      ok: false,
      message: m.includes("BF_REPORT_SOURCE_CHANGED")
        ? "활동 기록이 변경됐어요. 새 판을 만들어 다시 검토해 주세요."
        : m.includes("BF_REPORT_CONFLICT")
          ? "다른 화면에서 변경했어요. 새로고침해 주세요."
          : growthTermError(e),
    };
  }
}
export async function previewReportBatch(input: unknown) {
  try {
    const v = z
      .object({
        classroom: z.uuid(),
        from: z.iso.date().nullable(),
        until: z.iso.date().nullable(),
        after: z.uuid().optional(),
      })
      .parse(input);
    const p = await requireProfile();
    if (p.role !== "teacher") throw Error("BF_FORBIDDEN");
    const c = await createClient();
    const r = await c.rpc("report_batch_preview", {
      p_classroom: v.classroom,
      p_from: v.from,
      p_until: v.until,
      p_after: v.after ?? null,
    });
    if (r.error) throw r.error;
    const data = r.data.data as {
      student: string;
      name: string;
      token: string;
      version: number;
      counts: import("@/lib/growth-report").ReportState["counts"];
      title: string;
      note: string;
    }[];
    return {
      ok: true,
      data,
      next: r.data.next as string | null,
      message:
        "학생별 수치를 확인한 후 초안을 만드세요. 의견과 대표 작품은 개별 검토에서 추가합니다.",
    };
  } catch {
    return {
      ok: false,
      data: [],
      next: null,
      message: "담당 학급과 기간을 확인해 주세요.",
    };
  }
}
export async function saveReportBatch(input: unknown) {
  try {
    const v = z
      .object({
        classroom: z.uuid(),
        from: z.iso.date().nullable(),
        until: z.iso.date().nullable(),
        items: z
          .array(
            z.object({
              student: z.uuid(),
              token: z.string().regex(/^[a-f0-9]{64}$/),
              version: z.number().int().min(0),
              title: z.string().trim().min(1).max(100),
              note: z.string().max(2000),
            }),
          )
          .min(1)
          .max(30),
        requestId: z.uuid(),
        confirmed: z.literal(true),
      })
      .parse(input);
    const p = await requireProfile();
    if (p.role !== "teacher") throw Error("BF_FORBIDDEN");
    const c = await createClient(),
      r = await c.rpc("batch_report_drafts", {
        p_classroom: v.classroom,
        p_from: v.from,
        p_until: v.until,
        p_items: v.items,
        p_request_id: v.requestId,
      });
    if (r.error) throw r.error;
    revalidatePath("/reports");
    return {
      ok: true,
      data: r.data as { student: string; ok: boolean }[],
      message:
        "일괄 초안 생성 결과를 확인하세요. 충돌한 학생은 다시 불러와야 합니다.",
    };
  } catch {
    return {
      ok: false,
      data: [],
      message: "초안을 저장하지 못했어요. 같은 요청으로 다시 시도해 주세요.",
    };
  }
}
