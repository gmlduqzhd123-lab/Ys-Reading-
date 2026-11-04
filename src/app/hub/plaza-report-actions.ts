"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("report"),
    post: z.uuid(),
    reason: z.enum(["privacy", "hurtful", "other"]),
    note: z.string().max(500),
    request: z.uuid(),
  }),
  z.object({
    action: z.enum(["keep", "hide"]),
    id: z.uuid(),
    revision: z.number().int().positive(),
    request: z.uuid(),
  }),
]);
export async function plazaReportCommand(input: unknown) {
  try {
    const v = schema.parse(input),
      { action, request, ...payload } = v,
      c = await createClient();
    const r = await c.rpc("plaza_report_command", {
      p_action: action,
      p_payload: payload,
      p_request: request,
    });
    if (r.error) throw r.error;
    revalidatePath("/hub");
    return {
      ok: true,
      message:
        action === "report"
          ? "담당 선생님에게 확인을 요청했어요."
          : "검토 결과를 기록했어요.",
    };
  } catch {
    return {
      ok: false,
      message:
        "처리하지 못했어요. 현재 권한과 게시 상태를 확인하고 다시 불러와 주세요.",
    };
  }
}
