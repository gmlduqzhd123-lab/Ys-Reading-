// Pwned Passwords range API: send only the first five SHA-1 characters with
// response padding. Never send/store a password, complete hash or account ID.
export async function assertPasswordNotBreached(password:string,request:typeof fetch=fetch) {
 const buffer=await crypto.subtle.digest("SHA-1",new TextEncoder().encode(password));
 const hash=Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
 let text:string;
 try{const r=await request("https://api.pwnedpasswords.com/range/"+hash.slice(0,5),{headers:{"Add-Padding":"true"},signal:AbortSignal.timeout(5000),cache:"no-store"});if(!r.ok)throw Error();text=await r.text();if(text.length>2000000||!text.split(/\r?\n/).some(l=>/^[A-F0-9]{35}:\d+$/.test(l)))throw Error();}
 catch{throw Error("BF_PASSWORD_CHECK_UNAVAILABLE");}
 if(text.split(/\r?\n/).some(line=>{const [suffix,count]=line.split(":");return suffix===hash.slice(5)&&Number(count)>0;}))throw Error("BF_PASSWORD_PWNED");
}
