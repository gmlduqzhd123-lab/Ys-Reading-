// Public probes only. Never uses application cookies, account keys or student data.
const site="https://reading-blush-zeta.vercel.app";
for(let attempt=1;attempt<=12;attempt++){
 try{const r=await fetch(site+"/api/health?deep=1",{signal:AbortSignal.timeout(10000),cache:"no-store"});const d=await r.json();if(r.ok&&d.configured===true&&d.status==="ok"&&d.checks?.database===true&&d.checks?.authentication===true){console.log(JSON.stringify({service:"bookforest",healthy:true,attempt,checkedAt:new Date().toISOString()}));process.exit(0);}}catch{/* Only the sanitized final result is logged. */}
 if(attempt<12)await new Promise(resolve=>setTimeout(resolve,10000));
}
console.error(JSON.stringify({service:"bookforest",healthy:false,checkedAt:new Date().toISOString()}));process.exit(1);
