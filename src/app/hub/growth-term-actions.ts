"use server";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { growthTermInput, growthTermError } from "@/lib/growth-terms";
export async function growthTermCommand(input: unknown) {
  try {
    const value = growthTermInput.parse(input);
    await requireProfile();
    const c = await createClient();
    const r = await c.rpc("growth_term_command", {
      p_command: value.command,
      p_payload: value.payload,
      p_request_id: value.requestId,
    });
    if (r.error || !r.data) throw r.error ?? Error("EMPTY_RESULT");
    for (const path of ["/hub", "/app", "/operations", "/start"])
      revalidatePath(path);
    return {
      ok: true,
      message: "저장했어요. 최신 상태에 반영되었습니다.",
      data: r.data as Record<string, unknown>,
    };
  } catch (error) {
    return { ok: false, message: growthTermError(error), data: null };
  }
}
