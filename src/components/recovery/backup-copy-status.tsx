import {createClient} from "@/lib/supabase/server";
import {formatOperationsDate} from "@/lib/operations";
export async function BackupCopyStatus(){
 const c=await createClient(),r=await c.rpc("service_copy_health"),d=r.data;
 return <section className="panel"><h2>백업 사본 자동 점검</h2>
 <p role="status">{r.error||!d?"사본 보고를 읽지 못했어요. 연결 상태를 확인해 주세요.":!d.configured?"사본 대상을 지정하고 첫 예약 보고를 기다리고 있어요.":d.healthy?"설정한 사본의 복사·검증과 PC 보고가 정상입니다.":"사본 복사 실패 또는 오래된 보고가 있어요. 원본 백업과 별도로 확인해 주세요."}</p>
 {(d?.targets??[]).map((t:{kind:string;configured:boolean;external:boolean;state:string;verifiedAt:string|null})=><p key={t.kind}>{t.kind==="cloud-mirror"?"서버 암호화 파일 외부 사본":"복구 묶음 사본"} · {!t.configured?"미설정":t.external?"외부 저장 장치·네트워크 폴더":"같은 PC 사본"} · {t.state==="verified"&&t.verifiedAt?"검증 "+formatOperationsDate(t.verifiedAt):t.state==="unconfigured"?"준비 대기":"복사 확인 필요"}</p>)}
 <p className="form-help">설정한 사본이 실패하면 GitHub 운영 알림에 기록합니다. 같은 PC의 폴더는 외부 보관으로 표시하지 않습니다.</p></section>;
}
