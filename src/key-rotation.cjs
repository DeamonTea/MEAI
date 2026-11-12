class APIKeyRotator{
 constructor({sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){this.cursors=new Map();this.sleep=sleep}
 async run(provider,keys,request,{onWait=async()=>{}}={}){
  const unique=[...new Set((keys||[]).map(x=>String(x||'').trim()).filter(Boolean))];
  if(!unique.length)throw Error(`Chưa cấu hình API key ${provider}. Vào Cài đặt AI để thêm key.`);
  const start=(this.cursors.get(provider)||0)%unique.length;
  this.cursors.set(provider,(start+1)%unique.length);
  let lastErrors=[];
  for(let attempt=0;attempt<2;attempt++){
   const errors=[];
   for(let i=0;i<unique.length;i++){
    try{return await request(unique[(start+i)%unique.length])}
    catch(error){
     const detail=String(error?.message||error);
     const limited=error?.status===429||/rate.?limit|quota|resource_exhausted|too many requests|exceeded.*limit/i.test(detail);
     if(!limited)throw error;
     errors.push(error);
    }
   }
   lastErrors=errors;
   const delays=errors.map(error=>Number(error?.retryAfterMs)).filter(value=>Number.isFinite(value)&&value>=0);
   const waitMs=delays.length?Math.min(...delays):null;
   if(attempt===0&&waitMs!==null&&waitMs<=20000){
    const seconds=Math.max(1,Math.ceil(waitMs/1000));
    try{await onWait(seconds)}catch{}
    await this.sleep(waitMs);
    continue;
   }
   break;
  }
  throw Error(`Tất cả ${unique.length} API key ${provider} đều chạm giới hạn hoặc hết quota. Hãy kiểm tra quota hoặc thêm key từ tài khoản/project khác. Chi tiết: ${lastErrors.at(-1)?.message||'HTTP 429'}`);
 }
}
module.exports={APIKeyRotator};
