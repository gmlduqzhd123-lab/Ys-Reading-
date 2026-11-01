"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
export async function markClassNotices(classroom: unknown, through: unknown) {
  const input = z
    .object({ classroom: z.uuid(), through: z.iso.datetime({ offset: true }) })
    .safeParse({ classroom, through });
  if (!input.success)
    return { ok: false, message: "학급과 확인 시각을 다시 확인해 주세요." };
  const p = await requireProfile();
  if (p.role !== "teacher")
    return { ok: false, message: "담당 선생님만 확인할 수 있어요." };
  const c = await createClient(),
    r = await c.rpc("teacher_notices_read", {
      p_classroom: input.data.classroom,
      p_through: input.data.through,
    });
  if (r.error)
    return {
      ok: false,
      message: "알림 확인을 저장하지 못했어요. 다시 시도해 주세요.",
    };
  revalidatePath("/hub");
  return {
    ok: true,
    message:
      "현재 시점까지의 알림을 읽음으로 표시했어요. 미처리 활동은 계속 남아 있어요.",
  };
}
