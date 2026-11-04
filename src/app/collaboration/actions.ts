"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { operationsError } from "@/lib/operations";
export async function collaborationCommand(input: unknown) {
  try {
    const p = await requireProfile();
    if (p.role !== "teacher") throw Error("BF_FORBIDDEN");
    const v = z
      .object({
        command: z.enum([
          "invite",
          "accept",
          "revoke_invitation",
          "revoke_staff",
          "school_create",
          "school_link_request",
          "school_link_accept",
          "handover_propose",
          "handover_accept",
          "revoke_school_admin",
          "revoke_operator",
        ]),
        payload: z.record(z.string(), z.unknown()),
        requestId: z.uuid(),
      })
      .parse(input);
    if (JSON.stringify(v.payload).length > 4000)
      throw Error("BF_INVALID_INPUT");
    const c = await createClient(),
      r = await c.rpc("collaboration_command", {
        p_command: v.command,
        p_payload: v.payload,
        p_request_id: v.requestId,
      });
    if (r.error) throw r.error;
    revalidatePath("/collaboration");
    revalidatePath("/reports");
    revalidatePath("/hub");
    return {
      ok: true,
      message: "처리했어요. 현재 학급과 권한을 다시 확인해 주세요.",
      data: r.data as { code?: string; school?: string },
    };
  } catch (e) {
    const m = String(
      e && typeof e === "object" && "message" in e ? e.message : e,
    );
    return {
      ok: false,
      message: m.includes("BF_TEACHER_REQUIRED")
        ? "등록·승인된 교사의 이메일을 확인해 주세요."
        : m.includes("BF_INVITE_NOT_FOUND")
          ? "이 계정으로 받을 수 없거나 만료·취소된 초대입니다."
          : operationsError(e),
      data: null,
    };
  }
}
