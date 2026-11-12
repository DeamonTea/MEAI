const crypto=require('node:crypto');
const makeId=()=>crypto.randomBytes(10).toString('hex');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function cleanPageText(text){return String(text||'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').replace(/^\s*\d{1,4}\s*$/gm,'').replace(/^\s*(?:copyright|published by|all rights reserved)\b.*$/gim,'').trim()}
function splitUnits(pages){
 const lineCounts=new Map();const normalizedPages=pages.map(p=>{const lines=cleanPageText(p.text).split('\n');for(const line of lines){const k=line.trim().replace(/\s+/g,' ').toLowerCase();if(k.length>4&&k.length<120)lineCounts.set(k,(lineCounts.get(k)||0)+1)}return {...p,lines}});const threshold=Math.max(3,Math.ceil(pages.length*0.35));const repeated=new Set([...lineCounts].filter(([k,n])=>n>=threshold).map(([k])=>k));const cleaned=normalizedPages.map(p=>({...p,text:p.lines.filter(line=>!repeated.has(line.trim().replace(/\s+/g,' ').toLowerCase())).join('\n')}));
 const all=cleaned.map(p=>`\n[[PAGE:${p.page}]]\n${p.text}`).join('\n');const lines=all.split('\n');
 const starts=[];let currentPage=null;const unitRe=/^\s*(?:(?:\d+(?:\.\d+)*\.?\s*)?(?:UNIT|LESSON|CHAPTER|MODULE)\s*(?:NO\.?\s*)?[\dIVX]+(?:\s*[:.\-–]\s*|\s+).{0,120}|(?:\d+(?:\.\d+)*\.?\s*)?(?:UNIT|LESSON|CHAPTER|MODULE)\s*[\dIVX]+\s*)$/i;
 for(let i=0;i<lines.length;i++){const s=lines[i].trim().replace(/\s+/g,' ');const pm=s.match(/^\[\[PAGE:(\d+)\]\]$/);if(pm)currentPage=Number(pm[1]);if(unitRe.test(s)&&s.length<150)starts.push({i,title:s,page:currentPage});}
 let groups=[];
 if(starts.length){if(starts[0].i>0){const pre=lines.slice(0,starts[0].i).join('\n').trim();const toc=/mục lục|table of contents|\bcontents\b|nội dung các bài/i.test(pre);if(pre.length>300&&pre.length<5000&&!toc)groups.push({title:'Phần mở đầu',text:pre});}
 for(let j=0;j<starts.length;j++){const end=j+1<starts.length?starts[j+1].i:lines.length;groups.push({title:starts[j].title,text:lines.slice(starts[j].i,end).join('\n').trim(),startPage:starts[j].page})}}
 else {
  // No explicit Unit headings: preserve page boundaries and make conservative section groups.
  let cur=[],size=0,idx=1;for(const p of pages){cur.push(`[[PAGE:${p.page}]]\n${p.text}`);size+=p.text.length;if(size>=10000){groups.push({title:`Phần ${idx++}`,text:cur.join('\n\n')});cur=[];size=0;}}
  if(cur.length)groups.push({title:`Phần ${idx}`,text:cur.join('\n\n')});
 }
 return groups.filter(g=>g.text.length>250).map((g,i)=>{const ps=[...g.text.matchAll(/\[\[PAGE:(\d+)\]\]/g)].map(m=>Number(m[1]));if(g.startPage&&!ps.includes(g.startPage))ps.unshift(g.startPage);return {title:g.title||`Phần ${i+1}`,pages:[...new Set(ps)],source:g.text.replace(/\[\[PAGE:\d+\]\]/g,'').trim()}})
}
function norm(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim()}
function normalizeEvidenceText(s){return String(s||'').normalize('NFKC').replace(/[\u2018\u2019\u201a\u201b\u2032\u0060\u00b4]/g,"'").replace(/[\u201c\u201d\u201e\u201f\u2033]/g,'"').replace(/[\s\u00a0]+/g,' ').trim()}
function verifyVocabularySource(item,source){const sourceText=normalizeEvidenceText(source),evidence=String(item?.evidence||'').trim(),example=String(item?.example||'').trim(),hasEvidence=!!evidence,hasExample=!!example,evidenceVerified=hasEvidence&&sourceText.includes(normalizeEvidenceText(evidence)),exampleVerified=hasExample?sourceText.includes(normalizeEvidenceText(example)):null;return {...item,sourceVerified:evidenceVerified&&(!hasExample||exampleVerified),evidenceVerified,exampleVerified,sourceCheckedAt:new Date().toISOString()}}
function verifyVocabularyList(items,source){return (items||[]).map(item=>verifyVocabularySource(item,source))}
function validateAnalysis(x,source){
 if(!x||!Array.isArray(x.vocabulary)||!Array.isArray(x.readings)||!Array.isArray(x.exercises)||!Array.isArray(x.grammar)||typeof x.summary!=='string')throw Error('AI trả về thiếu trường phân tích. Chưa lưu kết quả.');
 let rejected=0;
 const excerpt=(v)=>{if(typeof v!=='string'||!v.trim()||v.length>1800||!norm(source).includes(norm(v))){rejected++;return null}return v.trim()};
  const vocabulary=[];
  for(const v of x.vocabulary.slice(0,150)){const term=String(v.term||'').trim().slice(0,120);if(!term){rejected++;continue}const evidence=typeof v.evidence==='string'?v.evidence.trim().slice(0,1800):'',example=typeof v.example==='string'?v.example.trim().slice(0,500):'';vocabulary.push(verifyVocabularySource({term,ipa:String(v.ipa||'').slice(0,80),meaning:String(v.meaning||'Chưa xác định nghĩa từ nguồn').slice(0,400),partOfSpeech:String(v.partOfSpeech||'Chưa nêu trong nguồn').slice(0,60),example,evidence,page:Number.isFinite(Number(v.page))?Number(v.page):null},source))}
 const readings=[];
 for(const v of x.readings.slice(0,30)){const evidence=excerpt(v.evidence);if(!evidence)continue;const content=typeof v.content==='string'&&v.content.length<=12000&&norm(source).includes(norm(v.content))?v.content:evidence;readings.push({title:String(v.title||'Bài đọc').slice(0,160),content,summary:String(v.summary||'').slice(0,600),page:Number.isFinite(Number(v.page))?Number(v.page):null})}
 const exercises=[];
 for(const v of x.exercises.slice(0,100)){const evidence=excerpt(v.evidence);if(!evidence)continue;const answerEvidence=typeof v.answerEvidence==='string'&&norm(source).includes(norm(v.answerEvidence))?v.answerEvidence:'';const answer=answerEvidence?String(v.answer||'').slice(0,300):'';exercises.push({type:String(v.type||'Bài tập').slice(0,80),question:evidence,options:Array.isArray(v.options)?v.options.slice(0,8).map(s=>String(s).slice(0,200)):[],answer,answerEvidence,page:Number.isFinite(Number(v.page))?Number(v.page):null})}
 const grammar=[];
 for(const v of x.grammar.slice(0,50)){const evidence=excerpt(v.evidence);if(!evidence)continue;grammar.push({title:String(v.title||'Ngữ pháp').slice(0,150),explanation:String(v.explanation||'').slice(0,900),evidence})}
  const warnings=[];if(rejected)warnings.push(`Đã bỏ ${rejected} mục không có dẫn chứng nguyên văn kiểm chứng được.`);const unverified=vocabulary.filter(v=>!v.sourceVerified).length;if(unverified)warnings.push(`${unverified} từ vựng có dẫn chứng chưa khớp nguyên văn với tài liệu nguồn.`);if(!vocabulary.length)warnings.push('Chưa trích xuất được từ vựng có dẫn chứng đủ rõ.');
 const levels=['A1','A2','B1','B2','C1','C2'],cefr=levels.includes(String(x.cefr||'').toUpperCase())?String(x.cefr).toUpperCase():'Chưa xác định';
 return {summary:x.summary.slice(0,1800),cefr,cefrRationale:String(x.cefrRationale||'').slice(0,400),units:Array.isArray(x.units)?x.units.slice(0,20).map(String):[],vocabulary,readings,exercises,grammar,filteredOut:Array.isArray(x.filteredOut)?x.filteredOut.slice(0,30).map(String):[],validationWarnings:warnings};
}
module.exports={makeId,hash,cleanPageText,splitUnits,validateAnalysis,normalizeEvidenceText,verifyVocabularySource,verifyVocabularyList};
