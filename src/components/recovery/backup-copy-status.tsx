import {createClient} from "@/lib/supabase/server";
import {formatOperationsDate} from "@/lib/operations";
export async function BackupCopyStatus(){
 const c=await createClient(),r=await c.rpc("service_copy_health"),d=r.data;
 return <section className="panel"><h2>백업 사본 자동 점검</h2>
 <p role="status">{r.error||!d?"사본 보고를 읽지 못했어요. 연결 상태를 확인해 주세요.":!d.configured?"사본 대상을 지정하고 첫 예약 보고를 기다리고 있어요.":d.healthy?"최신 백업과 일치하는 사본의 복사·검증과 PC 보고가 정상입니다.":"사본 실패·오래된 원본·최신 백업 불일치 또는 보고 지연이 있어요."}</p>
 {(d?.targets??[]).map((t:{kind:string;configured:boolean;external:boolean;state:string;verifiedAt:string|null;sourceCreatedAt?:string|null;latest?:boolean})=><article key={t.kind}>
 <h3>{t.kind==="cloud-mirror"?"서버 암호화 파일 외부 사본":"복구 묶음 사본"}</h3><p>{!t.configured?"미설정":t.external?"외부 저장 장치·네트워크 폴더":"같은 PC 사본"}</p>
 {t.configured&&<><p>원본 백업 생성: {t.sourceCreatedAt?formatOperationsDate(t.sourceCreatedAt):"확인 필요"}</p><p>사본 복원 검사: {t.verifiedAt?formatOperationsDate(t.verifiedAt):"검사 기록 없음"}</p><p>최신 백업과 일치: {t.latest?"일치":"다시 확인 필요"}</p></>}</article>)}
 <p className="form-help">오늘 파일을 검사했어도 원본 백업이 오래됐다면 최신 백업으로 표시하지 않습니다. 같은 PC의 폴더는 외부 보관이 아닙니다.</p></section>;
}
