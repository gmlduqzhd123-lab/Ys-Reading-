"use server";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { operationsError } from "@/lib/operations";
import { z } from "zod";
export async function savePrivacyReview(input: unknown) {
  try {
    await requireProfile();
    const v = z
      .object({
        classroom: z.uuid(),
        days: z.number().int().min(30).max(3650),
        note: z.string().trim().min(1).max(200),
        confirmed: z.literal(true),
        requestId: z.uuid(),
      })
      .parse(input);
    const c = await createClient(),
      r = await c.rpc("review_privacy_policy", {
        p_classroom: v.classroom,
        p_days: v.days,
        p_note: v.note,
        p_confirmed: v.confirmed,
        p_request_id: v.requestId,
      });
    if (r.error) throw r.error;
    revalidatePath("/account/records");
    return {
      ok: true,
      message: "학교에서 확인한 동의·보관 운영 기준을 기록했어요.",
    };
  } catch (e) {
    return { ok: false, message: operationsError(e) };
  }
}
export async function saveReceipt(input: unknown) {
  try {
    await requireProfile();
    const v = z
      .object({
        id: z.uuid(),
        revision: z.number().int().min(0),
        state: z.enum(["retained", "removed"]),
        due: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        note: z.string().max(200),
      })
      .parse(input);
    const c = await createClient(),
      r = await c.rpc("update_export_receipt", {
        p_id: v.id,
        p_revision: v.revision,
        p_state: v.state,
        p_due: v.due,
        p_note: v.note,
      });
    if (r.error) throw r.error;
    revalidatePath("/account/records");
    return {
      ok: true,
      message:
        "사본 관리 상태를 기록했어요. 실제 파일 삭제는 저장 위치에서 직접 확인해 주세요.",
    };
  } catch {
    return {
      ok: false,
      message: "저장하지 못했어요. 최신 상태를 불러온 뒤 다시 확인해 주세요.",
    };
  }
}
