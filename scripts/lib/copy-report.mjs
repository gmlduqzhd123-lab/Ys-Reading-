export function copyTarget(kind,configured,status,exit,now=Date.now()){
 const external=kind==="cloud-mirror"||["removable","network"].includes(status?.location_kind);
 const digest=status?.backup_digest??status?.digest,at=status?.verified_at??status?.copiedAt;
 const valid=configured&&exit===0&&status?.verified===true&&/^[a-f0-9]{64}$/.test(digest??"")&&Number.isFinite(Date.parse(at))&&Date.parse(at)<=now+60000&&now-Date.parse(at)<48*3600000&&Number.isSafeInteger(status?.bytes)&&status.bytes>0;
 return {kind,configured,state:!configured?"unconfigured":valid?"verified":"failed",external:configured&&external,digest:valid?digest:null,verifiedAt:valid?at:null,bytes:valid?status.bytes:null};
}
export function copyWarning(main,copies){
 if(!copies?.configured)return main;
 const at=Date.parse(copies.checkedAt),valid=Number.isFinite(at)&&Math.abs(Date.now()-at)<120000&&typeof copies.healthy==="boolean";
 if(valid&&copies.healthy)return main;
 if(!main.healthy&&!main.warning)return main;
 return {healthy:false,warning:true,code:valid&&copies.code==="BACKUP_COPY_FAILED"?"BACKUP_COPY_FAILED":"BACKUP_COPY_STALE"};
}
