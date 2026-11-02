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
});
export async function createReport(input: unknown) {
  try {
    const p = await requireProfile();
    if (p.role !== "teacher") throw Error("BF_FORBIDDEN");
    const v = schema.parse(input),
      c = await createClient(),
      r = await c.rpc("create_growth_report", {
        p_classroom: v.classroom,
        p_student: v.student,
        p_from: v.from,
        p_until: v.until,
        p_works: v.works,
        p_title: v.title,
        p_note: v.note,
        p_publish: v.publish,
        p_confirmed: v.confirmed,
        p_expected_version: v.version,
        p_request_id: v.requestId,
      });
    if (r.error) throw r.error;
    revalidatePath("/reports");
    return {
      ok: true,
      message: "확인한 보고서를 새 판으로 저장했어요.",
      data: r.data,
    };
  } catch (e) {
    const code = String(
      e && typeof e === "object" && "message" in e ? e.message : e,
    );
    return {
      ok: false,
      message: code.includes("BF_REPORT_CONFLICT")
        ? "다른 화면에서 보고서를 저장했어요. 새로고침 후 확인해 주세요."
        : growthTermError(e),
    };
  }
}
