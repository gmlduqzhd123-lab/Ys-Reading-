"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { classroomToolCommand } from "@/app/classroom/actions";
import { draftKey } from "@/lib/teacher-draft";
import { koreanDay } from "@/lib/hub";
import type { ToolCommand } from "@/lib/classroom-tools";
export function useToolAction(owner: string, classroom: string) {
  const router = useRouter(),
    keys = useRef<Record<string, string>>({}),
    pending = useRef(false),
    generation = useRef(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange((event, session) => {
      if (
        event === "SIGNED_OUT" ||
        (session?.user && session.user.id !== owner)
      ) {
        generation.current++;
        setBlocked(true);
        setMessage(
          "계정이 바뀌었어요. 현재 화면을 닫고 본인의 학급을 다시 열어 주세요.",
        );
      }
    });
    return () => {
      generation.current++;
      subscription.unsubscribe();
    };
  }, [owner]);
  async function run(command: ToolCommand, payload: Record<string, unknown>) {
    if (pending.current || blocked) return null;
    const g = generation.current,
      key = koreanDay() + command + draftKey(payload);
    keys.current[key] ??= crypto.randomUUID();
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const r = await classroomToolCommand({
        owner,
        classroom,
        command,
        payload,
        request: keys.current[key],
      });
      if (g !== generation.current) return null;
      setMessage(r.message);
      if (r.ok) {
        router.refresh();
        return r.data;
      }
      return null;
    } catch {
      if (g === generation.current)
        setMessage(
          "연결이 끊겼어요. 입력을 유지한 채 같은 버튼으로 다시 시도해 주세요.",
        );
      return null;
    } finally {
      pending.current = false;
      if (g === generation.current) setBusy(false);
    }
  }
  return { run, busy, blocked, message, setMessage };
}
