"use server";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { participationInput, participationError } from "@/lib/participation";
export async function participationCommand(input: unknown) {
  try {
    const value = participationInput.parse(input);
    await requireProfile();
    const client = await createClient();
    const { data, error } = await client.rpc("participation_command", {
      p_command: value.command,
      p_payload: value.payload,
      p_request_id: value.requestId,
    });
    if (error) throw error;
    if (!data) throw new Error("EMPTY_RESULT");
    for (const path of ["/hub", "/app", "/start", "/operations"])
      revalidatePath(path);
    return {
      ok: true,
      message: "저장했어요. 최신 기록에 반영되었습니다.",
      data: data as Record<string, unknown>,
    };
  } catch (error) {
    return { ok: false, message: participationError(error), data: null };
  }
}
