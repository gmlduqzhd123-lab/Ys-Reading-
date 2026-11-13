"use server";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  toolInput,
  toolPayloads,
  toolError,
  type Evidence,
} from "@/lib/classroom-tools";
import { z } from "zod";
export async function classroomToolCommand(input: unknown) {
  try {
    const v = toolInput.parse(input),
      p = await requireProfile();
    if (p.id !== v.owner) throw Error("BF_ACCOUNT_CHANGED");
    const payload = toolPayloads[v.command].parse(v.payload),
      c = await createClient(),
      r = await c.rpc("classroom_tool_command", {
        p_command: v.command,
        p_classroom: v.classroom,
        p_payload: payload,
        p_request: v.request,
      });
    if (r.error || !r.data) throw r.error ?? Error("EMPTY_RESULT");
    revalidatePath("/classroom");
    revalidatePath("/hub");
    return {
      ok: true,
      message: "저장했어요. 최신 기록에 반영되었습니다.",
      data: r.data as Record<string, unknown>,
    };
  } catch (e) {
    return { ok: false, message: toolError(e), data: null };
  }
}
export async function classroomEvidence(
  input: unknown,
): Promise<{ ok: true; data: Evidence } | { ok: false; message: string }> {
  try {
    const v = z
        .object({ owner: z.uuid(), classroom: z.uuid(), student: z.uuid() })
        .strict()
        .parse(input),
      p = await requireProfile();
    if (p.id !== v.owner) throw Error("BF_ACCOUNT_CHANGED");
    const c = await createClient(),
      r = await c.rpc("classroom_evidence", {
        p_classroom: v.classroom,
        p_student: v.student,
      });
    if (r.error) throw r.error;
    return { ok: true, data: r.data as Evidence };
  } catch (e) {
    return { ok: false, message: toolError(e) };
  }
}
