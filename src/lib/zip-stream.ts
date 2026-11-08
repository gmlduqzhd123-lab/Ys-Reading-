// ZIP32, stored method with known CRC/size. A single document is held at a time;
// only central-directory metadata remains in memory between documents.
const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=(data:Uint8Array)=>{let c=0xffffffff;for(const x of data)c=table[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
type Entry={name:string;data:Uint8Array};
export function zipStream(entries:AsyncIterable<Entry>){
 const iterator=entries[Symbol.asyncIterator](),directory:Uint8Array[]=[];let offset=0,count=0,closed=false;
 return new ReadableStream<Uint8Array>({async pull(controller){
  if(closed)return;
  try{const next=await iterator.next();
   if(!next.done){const {name,data}=next.value;
    if(!/^책숲-\d+-\d+\.(docx|csv)$/.test(name)||data.length>3145728||offset+data.length>70000000)throw Error("ZIP_BOUNDS");
    const encoded=new TextEncoder().encode(name),crc=crc32(data),header=new Uint8Array(30+encoded.length),h=new DataView(header.buffer);
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,encoded.length,true);header.set(encoded,30);
    const central=new Uint8Array(46+encoded.length),v=new DataView(central.buffer);
    v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,33,true);v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,encoded.length,true);v.setUint32(42,offset,true);central.set(encoded,46);directory.push(central);
    offset+=header.length+data.length;count++;controller.enqueue(header);controller.enqueue(data);return;
   }
   const start=offset;for(const item of directory){controller.enqueue(item);offset+=item.length;}
   const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,count,true);v.setUint16(10,count,true);v.setUint32(12,offset-start,true);v.setUint32(16,start,true);controller.enqueue(end);closed=true;controller.close();
  }catch(e){closed=true;controller.error(e);await iterator.return?.();}
 },async cancel(){closed=true;await iterator.return?.();}});
}
