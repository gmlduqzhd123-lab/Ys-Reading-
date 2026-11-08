"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
export function OperatorInvitation() {
  const [pending, setPending] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  useEffect(() => {
    let active = true;
    Promise.resolve(createClient().rpc("operator_invitation_status"))
      .then((r) => {
        if (active) setPending(r.data?.pending === true);
      }).catch(()=>{if(active)setMessage("초대 상태를 읽지 못했어요. 연결 후 이 화면을 다시 열어 주세요.");});
    return () => {
      active = false;
    };
  }, []);
  if (!pending) return message?<p role="status">{message}</p>:null;
  return (
    <section className="panel">
      <h2>대체 운영자 초대 수락</h2>
      <p>
        본인 이메일로 확인된 초대입니다. 위에서 인증앱 등록과 2단계 인증을 마친
        뒤 전체 운영 권한을 수락해 주세요.
      </p>
      <button
        disabled={busy}
        className="button button-primary"
        onClick={async () => {
          setBusy(true);
          try {
            const r = await createClient().rpc("complete_operator_email_setup");
            if (r.error || !r.data?.claimed) {
              setMessage(
                r.data?.requiresMfa
                  ? "먼저 인증앱으로 최근 2단계 인증을 완료해 주세요."
                  : "초대 상태를 확인하지 못했어요.",
              );
              return;
            }
            setMessage("대체 운영자 초대를 수락했어요.");
            setPending(false);
            router.refresh();
          } catch {setMessage("초대 수락을 확인하지 못했어요. 연결 후 같은 수락을 다시 시도해 주세요.");} finally {
            setBusy(false);
          }
        }}
      >
        2단계 인증 후 운영자 초대 수락
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
