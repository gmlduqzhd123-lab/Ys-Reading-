import {projectRef} from "./operator-vault.mjs";
export async function recoveryPreflight(env,{fetcher=fetch}={}){
 const db=new URL(env.NEXT_PUBLIC_SUPABASE_URL),app=new URL(env.NEXT_PUBLIC_APP_URL);
 if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(db.href)||db.hostname===projectRef+".supabase.co"||app.protocol!=="https:"||app.username||app.password||app.search||app.hash||app.pathname!=="/"||app.hostname==="reading-blush-zeta.vercel.app")throw Error("INDEPENDENT_TARGET_REQUIRED");
 const key=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 let role;try{role=JSON.parse(Buffer.from(key.split('.')[1],"base64url").toString()).role;}catch{}
 if(!(key?.startsWith("sb_publishable_")||role==="anon"))throw Error("PUBLIC_KEY_REQUIRED");
 async function read(url,options={}){try{const r=await fetcher(url,{...options,redirect:"error",signal:AbortSignal.timeout(8000)});return {status:r.status,data:await r.json()};}catch{return {status:0,data:null};}}
 const [health,contract,worker,zip]=await Promise.all([
  read(app.origin+"/api/health?deep=1"),
  read(db.origin+"/rest/v1/rpc/service_release_contract",{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:"{}"}),
  read(db.origin+"/functions/v1/account-operations?health=1",{headers:{apikey:key}}),
  read(app.origin+"/api/exports/worker",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({job:crypto.randomUUID()})}),
 ]);
 const checks={application:health.status===200&&health.data?.checks?.database===true&&health.data?.checks?.authentication===true,
  database:contract.status===200&&contract.data?.recoveryOperations===true,accountWorker:worker.status===200&&worker.data?.service==="bookforest-account-worker"&&worker.data?.protocol>=2,
  zipWorker:zip.status===403&&zip.data?.code==="JOB_UNAVAILABLE"};
 return {target:db.hostname.split('.')[0],app:app.origin,checks,endpointsPassed:Object.values(checks).every(Boolean),operationalCutoverVerified:false,
  callbacks:{supabaseLogin:app.origin+"/auth/callback",googleLogin:db.origin+"/auth/v1/callback",googleDrive:app.origin+"/api/google/callback"},
  manualChecks:["독립 대상 앱의 Supabase URL이 복구 DB를 가리키는지 확인","Google·Supabase 대시보드에 위 콜백 등록","private.zip_worker_config를 복구 앱 주소로 설정","로그인·대표 기록·Google 내보내기를 직접 확인한 뒤 도메인 전환 승인"]};
}
