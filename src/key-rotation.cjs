class APIKeyRotator{
 constructor(){this.cursors=new Map()}
 async run(provider,keys,request){
  const unique=[...new Set((keys||[]).map(x=>String(x||'').trim()).filter(Boolean))];
  if(!unique.length)throw Error(`Chưa cấu hình API key ${provider}. Vào Cài đặt AI để thêm key.`);
  const start=(this.cursors.get(provider)||0)%unique.length;
  this.cursors.set(provider,(start+1)%unique.length);
  const errors=[];
  for(let i=0;i<unique.length;i++){
   try{return await request(unique[(start+i)%unique.length])}
   catch(error){
    const detail=String(error?.message||error);
    const limited=error?.status===429||/rate.?limit|quota|resource_exhausted|too many requests|exceeded.*limit/i.test(detail);
    if(!limited)throw error;
    errors.push(detail);
   }
  }
  throw Error(`Tất cả ${unique.length} API key ${provider} đều chạm giới hạn hoặc hết quota. Hãy kiểm tra quota hoặc thêm key từ tài khoản/project khác. Chi tiết: ${errors.at(-1)||'HTTP 429'}`);
 }
}
module.exports={APIKeyRotator};
