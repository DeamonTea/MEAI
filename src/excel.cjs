const JSZip=require('jszip');
const {DOMParser}=require('@xmldom/xmldom');
const path=require('node:path');

function parseXml(xml,label){
 const errors=[];
 const doc=new DOMParser({errorHandler:{warning:()=>{},error:m=>errors.push(m),fatalError:m=>errors.push(m)}}).parseFromString(xml,'application/xml');
 if(errors.length||!doc.documentElement)throw Error(`Không đọc được cấu trúc ${label} trong file Excel.`);
 return doc;
}
function nodes(node,name){return Array.from(node.getElementsByTagName(name))}
function columnIndex(ref){const letters=(String(ref||'').match(/^[A-Z]+/i)||['A'])[0].toUpperCase();let n=0;for(const c of letters)n=n*26+c.charCodeAt(0)-64;return n-1}
function normalizeHeader(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]/g,'')}

async function readUserWorkbook(file){
 const zip=await JSZip.loadAsync(require('node:fs').readFileSync(file));
 const shared=[];
 const sharedFile=zip.file('xl/sharedStrings.xml');
 if(sharedFile){const doc=parseXml(await sharedFile.async('string'),'sharedStrings.xml');for(const si of nodes(doc,'si'))shared.push(nodes(si,'t').map(t=>t.textContent||'').join(''))}
 const workbookFile=zip.file('xl/workbook.xml');
 const relsFile=zip.file('xl/_rels/workbook.xml.rels');
 if(!workbookFile||!relsFile)throw Error('File Excel không có workbook hợp lệ (.xlsx).');
 const workbook=parseXml(await workbookFile.async('string'),'workbook.xml');
 const rels=parseXml(await relsFile.async('string'),'workbook.xml.rels');
 const sheet=nodes(workbook,'sheet')[0];
 if(!sheet)throw Error('File Excel chưa có trang tính.');
 const rid=sheet.getAttribute('r:id')||sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
 const rel=nodes(rels,'Relationship').find(x=>x.getAttribute('Id')===rid);
 if(!rel)throw Error('Không tìm được trang tính đầu tiên trong file Excel.');
 const target=rel.getAttribute('Target');
 const sheetPath=target.startsWith('/')?target.slice(1):path.posix.normalize(path.posix.join('xl',target));
 const sheetFile=zip.file(sheetPath);
 if(!sheetFile)throw Error('Không đọc được trang tính đầu tiên trong file Excel.');
 const sheetDoc=parseXml(await sheetFile.async('string'),'worksheet');
 const rows=nodes(sheetDoc,'row').map(row=>nodes(row,'c').map(cell=>{
  const type=cell.getAttribute('t'),v=nodes(cell,'v')[0],inline=nodes(cell,'is')[0];
  let value=v?.textContent||'';
  if(type==='s')value=shared[Number(value)]||'';
  else if(type==='inlineStr')value=inline?nodes(inline,'t').map(t=>t.textContent||'').join(''):'';
  return [columnIndex(cell.getAttribute('r')),String(value).trim()];
 }).reduce((arr,[i,value])=>{arr[i]=value;return arr},[]));
 if(rows.length<2)throw Error('Excel cần có dòng tiêu đề và ít nhất một tài khoản.');
 const header=rows[0].map(normalizeHeader);
 const find=aliases=>header.findIndex(x=>aliases.some(a=>x===a||x.startsWith(a)));
 const columns={username:find(['username','user','taikhoan','tendangnhap']),password:find(['password','matkhau','pass']),full_name:find(['fullname','hovaten','hoten','name']),role:find(['role','quyen','vaitro','chucvu'])};
 if(columns.username<0||columns.password<0)throw Error('Thiếu cột bắt buộc. Dòng đầu cần có username và password (hoặc Tài khoản và Mật khẩu).');
 return rows.slice(1).map((row,index)=>({row:index+2,username:String(row[columns.username]||'').trim(),password:String(row[columns.password]||''),full_name:columns.full_name<0?'':String(row[columns.full_name]||'').trim(),role:columns.role>=0&&/admin|quantri/i.test(String(row[columns.role]||''))?'admin':'user'})).filter(x=>x.username||x.password||x.full_name);
}
module.exports={readUserWorkbook};
