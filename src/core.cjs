const crypto=require('node:crypto');
const makeId=()=>crypto.randomBytes(10).toString('hex');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function isStructuredTextLine(line){return /^\s*(?:\||##)/.test(String(line||''))}
function cleanPageText(text){return String(text||'').replace(/\r/g,'').split('\n').map(line=>{if(isStructuredTextLine(line))return line;return line.replace(/[ \t]+/g,' ').replace(/^\s*\d{1,4}\s*$/,'').replace(/^\s*(?:copyright|published by|all rights reserved)\b.*$/i,'')}).join('\n').replace(/\n{3,}/g,'\n\n').trim()}
function splitUnitsLegacy(pages){
 const lineCounts=new Map();const normalizedPages=pages.map(p=>{const lines=cleanPageText(p.text).split('\n');for(const line of lines){if(isStructuredTextLine(line))continue;const k=line.trim().replace(/\s+/g,' ').toLowerCase();if(k.length>4&&k.length<120)lineCounts.set(k,(lineCounts.get(k)||0)+1)}return {...p,lines}});const threshold=Math.max(3,Math.ceil(pages.length*0.35));const repeated=new Set([...lineCounts].filter(([k,n])=>n>=threshold).map(([k])=>k));const cleaned=normalizedPages.map(p=>({...p,text:p.lines.filter(line=>isStructuredTextLine(line)||!repeated.has(line.trim().replace(/\s+/g,' ').toLowerCase())).join('\n')}));
 const all=cleaned.map(p=>`\n[[PAGE:${p.page}]]\n${p.text}`).join('\n');const lines=all.split('\n');
 const starts=[];let currentPage=null;const unitRe=/^\s*(?:##\s*)?(?:(?:\d+(?:\.\d+)*\.?\s*)?(?:UNIT|LESSON|CHAPTER|MODULE)\s*(?:NO\.?\s*)?[\dIVX]+(?:\s*[:.\-–—]\s*|\s+).{0,120}|(?:\d+(?:\.\d+)*\.?\s*)?(?:UNIT|LESSON|CHAPTER|MODULE)\s*[\dIVX]+\s*)$/i;
 for(let i=0;i<lines.length;i++){const s=lines[i].trim().replace(/\s+/g,' ');const pm=s.match(/^\[\[PAGE:(\d+)\]\]$/);if(pm)currentPage=Number(pm[1]);if(unitRe.test(s)&&s.length<150)starts.push({i,title:s,page:currentPage});}
 let groups=[];
 if(starts.length){if(starts[0].i>0){const pre=lines.slice(0,starts[0].i).join('\n').trim();const toc=/mục lục|table of contents|\bcontents\b|nội dung các bài/i.test(pre);if(pre.length>300&&pre.length<5000&&!toc)groups.push({title:'Phần mở đầu',text:pre});}
 for(let j=0;j<starts.length;j++){const end=j+1<starts.length?starts[j+1].i:lines.length;groups.push({title:starts[j].title,text:lines.slice(starts[j].i,end).join('\n').trim(),startPage:starts[j].page})}}
 else {
  // No explicit Unit headings: preserve page boundaries and make conservative section groups.
  let cur=[],size=0,idx=1;for(const p of cleaned){cur.push(`[[PAGE:${p.page}]]\n${p.text}`);size+=p.text.length;if(size>=10000){groups.push({title:`Phần ${idx++}`,text:cur.join('\n\n')});cur=[];size=0;}}
  if(cur.length)groups.push({title:`Phần ${idx}`,text:cur.join('\n\n')});
 }
 return groups.filter(g=>g.text.length>250).map((g,i)=>{const ps=[...g.text.matchAll(/\[\[PAGE:(\d+)\]\]/g)].map(m=>Number(m[1]));if(g.startPage&&!ps.includes(g.startPage))ps.unshift(g.startPage);return {title:g.title||`Phần ${i+1}`,pages:[...new Set(ps)],source:g.text.replace(/\[\[PAGE:\d+\]\]/g,'').trim()}})
}
function norm(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim()}
function normalizeEvidenceText(s){return String(s||'').normalize('NFKC').replace(/[\u2018\u2019\u201a\u201b\u2032\u0060\u00b4]/g,"'").replace(/[\u201c\u201d\u201e\u201f\u2033]/g,'"').replace(/[\s\u00a0]+/g,' ').trim()}
function verifyVocabularySource(item,source){const sourceText=normalizeEvidenceText(source),evidence=String(item?.evidence||'').trim(),example=String(item?.example||'').trim(),hasEvidence=!!evidence,hasExample=!!example,evidenceVerified=hasEvidence&&sourceText.includes(normalizeEvidenceText(evidence)),exampleVerified=hasExample?sourceText.includes(normalizeEvidenceText(example)):null;return {...item,sourceVerified:evidenceVerified&&(!hasExample||exampleVerified),evidenceVerified,exampleVerified,sourceCheckedAt:new Date().toISOString()}}
function verifyVocabularyList(items,source){return (items||[]).map(item=>verifyVocabularySource(item,source))}

function selectRelevantContext(source,query,maxChars=5000){
 const text=String(source||'');if(!text.trim())return '';
 const limit=Math.max(1,Number(maxChars)||5000);if(text.length<=limit)return text;
 const lines=text.split(/(?<=\n)/),chunks=[];let sectionIsVocabulary=false,buffer='',bufferStart=0,bufferVocabulary=false;
 const flush=()=>{if(buffer){chunks.push({text:buffer,start:bufferStart,vocabulary:bufferVocabulary});buffer='';bufferVocabulary=false}};
 const append=(value,start,isVocabulary)=>{let remaining=value,partStart=start;while(remaining){if(buffer&&bufferVocabulary!==isVocabulary)flush();if(!buffer){bufferStart=partStart;bufferVocabulary=isVocabulary}const take=Math.min(800-buffer.length,remaining.length);buffer+=remaining.slice(0,take);remaining=remaining.slice(take);partStart+=take;if(buffer.length>=800)flush()}};
 let offset=0;
 for(const line of lines){
  const trimmed=line.trim(),heading=trimmed.match(/^##\s*(.*?)\s*$/);
  if(heading){flush();sectionIsVocabulary=/^(?:[A-F]\s*[.)]?\s*)?(?:GLOSSARY|VOCABULARY|WORD\s+LIST|TỪ\s*VỰNG)\b/i.test(heading[1].trim());}
  const rowLooksLikeVocabulary=sectionIsVocabulary||/^\|\s*\d+\s*[.)]?\s+\S/.test(trimmed)||/^\d+\s*[.)]?\s+\S/.test(trimmed);
  append(line,offset,rowLooksLikeVocabulary);
  offset+=line.length;
 }
 flush();
 const queryWords=new Set((String(query||'').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(word=>word.length>1&&!/^(?:the|and|for|with|from|this|that|what|when|where|which|have|your|about|into|của|các|những|được|trong|cho|với|này|đó|là|và|một|cần|hỏi|giải|thích)$/u.test(word)));
 const ranked=chunks.map((chunk,index)=>{const words=new Set((chunk.text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)||[]));let score=0;for(const word of queryWords)if(words.has(word))score++;return {...chunk,index,score}});
 const selected=new Set(ranked.filter(x=>x.vocabulary).map(x=>x.index));let used=ranked.filter(x=>x.vocabulary).reduce((n,x)=>n+x.text.length,0);
 for(const chunk of [...ranked].filter(x=>!x.vocabulary).sort((a,b)=>b.score-a.score||a.index-b.index)){
  if(used+chunk.text.length>limit)continue;
  selected.add(chunk.index);used+=chunk.text.length;
 }
 return ranked.filter(x=>selected.has(x.index)).map(x=>x.text).join('').trim();
}



function parseUnitHeading(value){const m=String(value||'').trim().replace(/^##\s*/,'').match(/^(?:\d+(?:\.\d+)*\.?\s*)?(UNIT|LESSON|CHAPTER|MODULE)\s*(?:NO\.?\s*)?([0-9IVX]+)(?:\s*(?:[:.\-–—]\s*|\s+)(.*))?$/i);return m?{label:m[1][0].toUpperCase()+m[1].slice(1).toLowerCase()+' '+m[2].toUpperCase(),suffix:String(m[3]||'').trim()}:null}
function isUppercaseUnitTitle(value){const s=String(value||'').trim();return !!s&&!s.startsWith('##')&&!/^[A-F]\s*\.\s*/i.test(s)&&/^(?=.*\p{Lu})[\p{Lu}\p{N}\s&'’(),:./\-–—]+$/u.test(s)&&s.replace(/[^\p{L}]/gu,'').length>=3}
function splitUnits(pages){return splitUnitsLegacy(pages).map(unit=>{const h=parseUnitHeading(unit.title);if(!h)return unit;let suffix=h.suffix;if(!suffix){const lines=String(unit.source||'').split('\n'),at=lines.findIndex(x=>{const p=parseUnitHeading(x);return p&&p.label.toLowerCase()===h.label.toLowerCase()});for(let i=at+1;i<lines.length;i++){const s=lines[i].trim();if(!s||/^\[\[PAGE:\d+\]\]$/.test(s))continue;if(isUppercaseUnitTitle(s))suffix=s;break}}return {...unit,title:h.label+(suffix?' — '+suffix:'')}})}
function sectionKind(label){const s=String(label||'').trim().replace(/^[A-F]\s*\.\s*/i,'').replace(/\s+/g,' ').toLocaleLowerCase();if(/^starter\b/.test(s))return 'starter';if(/^discussion\b/.test(s))return 'discussion';if(/^(?:presentation|reading|text|passage)(?:\s+(?:text|passage|comprehension))?$/.test(s))return 'reading';if(/^(comprehension|tasks?|exercises?)\b/.test(s))return 'tasks';if(/^(grammar(?:\s+focus)?|language\s+focus)\b/.test(s))return 'grammar';if(/^(glossary|vocabulary|word\s+list|từ\s*vựng)\b/.test(s))return 'glossary';return null}
function detectSections(text){const source=String(text||''),lines=source.split('\n'),offsets=[];let offset=0;for(const line of lines){offsets.push({line,start:offset});offset+=line.length+1}const headings=[];for(const item of offsets){const match=item.line.match(/^\s*##\s*(.*?)\s*$/);if(!match)continue;const kind=sectionKind(match[1]);if(kind)headings.push({kind,start:item.start})}const generic=[];for(const item of offsets){const match=item.line.trim().match(/^(?:[A-F]\s*[\.\)]\s*)?(STARTER|DISCUSSION|PRESENTATION|READING(?:\s+(?:TEXT|PASSAGE|SECTION))?|TEXT|PASSAGE|COMPREHENSION(?:\s+TASKS?)?|TASKS?|EXERCISES?|GRAMMAR(?:\s+FOCUS)?|LANGUAGE\s+FOCUS|GLOSSARY|VOCABULARY(?:\s+(?:LIST|ITEMS|AND\s+PHRASES))?|WORD\s+LIST|TỪ\s*VỰNG)\s*:?\s*$/i);if(match){const kind=sectionKind(item.line.trim());if(kind&&!headings.some(x=>x.start===item.start))generic.push({kind,start:item.start})}}const nonStandard=!headings.length||generic.length>0;headings.push(...generic);headings.sort((a,b)=>a.start-b.start);const sections=headings.map((heading,index)=>{const end=index+1<headings.length?headings[index+1].start:source.length;return {kind:heading.kind,start:heading.start,end,text:source.slice(heading.start,end)}});return {sections,nonStandard,warnings:nonStandard?['Cấu trúc Unit không chuẩn; dùng phân tích AI dự phòng cho phần thiếu tiêu đề nhận diện.']:[]}}
function parseGlossary(text){
 const source=typeof text==='string'?text:String(text?.text||''),items=[],unparsedRows=[];
 let found=/(?:^|\n)\s*(?:##\s*)?(?:[A-F]\s*\.\s*)?(?:GLOSSARY|VOCABULARY|WORD\s+LIST|TỪ\s*VỰNG)(?:\s|:|$)/i.test(source);
 const ipaSymbols=/[\u0250-\u02ff\u1d00-\u1d7f]/u;
 const slashIpa=/\/[^/\r\n]{1,100}\//g;
 const flatIpa=/(?<!\S)[^\s,;]*[\u0250-\u02ff\u1d00-\u1d7f][^\s,;]*/gu;
 const posGlobal=/\(([a-z]+(?:\.[a-z]+)*(?:\s*,\s*[a-z]+(?:\.[a-z]+)*)*)\)/ig;
 const posMatch=/^\(([a-z]+(?:\.[a-z]+)*(?:\s*,\s*[a-z]+(?:\.[a-z]+)*)*)\)$/i;
 function add(line,cells,flat){
  if(!line.trim()||/^\s*\[\/?BẢNG\]\s*$/i.test(line)||/^\s*\|?\s*:?-{2,}/.test(line))return;
  let values=cells?cells.map(x=>String(x||'').trim()):[];
  if(!cells){const m=line.trim().match(/^(\d+)\s*[.)]?\s+(.+)$/);if(!m)return;values=[m[1]+'. '+m[2]]}
  let no=null,first=values[0]||'',n=first.match(/^\s*(\d+)\s*[.)]?\s*(.*)$/);
  if(n){no=Number(n[1]);first=n[2].trim()}
  let term=first,pos='',ipa='',remaining=[];
  const termPos=term.match(/\s+(\([a-z]+(?:\.[a-z]+)*(?:\s*,\s*[a-z]+(?:\.[a-z]+)*)*\))\s*$/i);
  if(termPos){pos=termPos[1].slice(1,-1).toLowerCase();term=term.slice(0,termPos.index).trim()}
  const termIpa=term.match(/\/[^/\r\n]{1,100}\//);
  if(termIpa){ipa=termIpa[0];term=term.replace(termIpa[0],'').trim()}
  for(const cellValue of values.slice(1)){
   const cell=String(cellValue||'').trim();if(!cell)continue;
   if(posMatch.test(cell)){pos=cell.slice(1,-1).toLowerCase();continue}
   const slash=cell.match(/\/[^/\r\n]{1,100}\//);
   if(slash){ipa=slash[0];const rest=cell.replace(slash[0],'').trim();if(posMatch.test(rest))pos=rest.slice(1,-1).toLowerCase();else if(rest)remaining.push(rest);continue}
   if(ipaSymbols.test(cell)&&!/[;,]/.test(cell)){ipa=cell;continue}
   remaining.push(cell);
  }
  if(flat){
   const tail=values[0].replace(/^\s*\d+\s*[.)]?\s*/,'');
   const markers=[];
   for(const m of tail.matchAll(posGlobal))markers.push({index:m.index,end:m.index+m[0].length,kind:'pos',value:m[1].toLowerCase()});
   for(const m of tail.matchAll(slashIpa))markers.push({index:m.index,end:m.index+m[0].length,kind:'ipa',value:m[0]});
   for(const m of tail.matchAll(flatIpa)){if(markers.some(x=>m.index<x.end&&m.index+m[0].length>x.index))continue;markers.push({index:m.index,end:m.index+m[0].length,kind:'ipa',value:m[0]})}
   markers.sort((a,b)=>a.index-b.index);
   if(markers.length){term=tail.slice(0,markers[0].index).trim();const last=markers.reduce((a,b)=>b.end>a.end?b:a,markers[0]);remaining.push(tail.slice(last.end).trim());for(const m of markers){if(m.kind==='pos')pos=m.value;else ipa=m.value}}
  }
  term=term.replace(/^[\s:;,.]+|[\s:;,.]+$/g,'').trim();
  if(/^(?:no\.?|number|word|term|vocabulary|glossary|từ|mục)$/i.test(term))return;
  if(!term){if(line.includes('|')||/^\s*\d+\s*[.)]/.test(line))unparsedRows.push(line);return}
  const meaning=remaining.filter(Boolean).join(' ').trim();
  if(!meaning&&!pos&&!ipa){if(line.includes('|')||/^\s*\d+\s*[.)]/.test(line))unparsedRows.push(line);return}
  items.push({no,term,partOfSpeech:pos,ipa,meaning,evidence:line,fromGlossary:true,sourceVerified:true});
 }
 for(const line of source.split(/\r?\n/)){
  if(line.includes('|')){const row=line.trim();if(/^\[\/?BẢNG\]$/i.test(row))continue;const cells=row.replace(/^\|/,'').replace(/\|$/,'').split('|').map(x=>x.trim());if(cells.length>=2)add(line,cells,false);continue}
  if(/^\s*\d+\s*[.)]?\s+\S/.test(line))add(line,null,true);
 }
 if(items.length)found=true;
 return {items,unparsedRows,found}
}
function splitReadings(section,maxLength=30000){const source=typeof section==='string'?section:String(section?.text||'');if(!source.trim())return [];const truncated=source.length>maxLength,limited=source.slice(0,maxLength),lines=limited.split('\n'),starts=[];let offset=0;for(let i=0;i<lines.length;i++){const next=(lines.slice(i+1).find(x=>x.trim())||'').trim(),rawTitle=lines[i].trim(),candidateTitle=rawTitle.replace(/^##\s*/,''),isSection=/^(?:[A-F]\s*\.\s*)?(?:PRESENTATION|READING|TEXT|PASSAGE)$/i.test(candidateTitle);if(!isSection&&isUppercaseUnitTitle(candidateTitle)&&/^\(?1\)?(?:[.)]|\s)/.test(next))starts.push({start:offset,title:candidateTitle});offset+=lines[i].length+1}if(starts.length>1)return starts.map((x,i)=>({title:x.title,content:limited.slice(i?x.start:0,starts[i+1]?.start??limited.length).trim(),summary:'',truncated})).filter(x=>x.content);const title=starts[0]?.title||(()=>{for(let i=0;i<lines.length;i++){const value=lines[i].trim().replace(/^##\s*/,''),next=(lines.slice(i+1).find(x=>x.trim())||'').trim();if(!value||sectionKind(value)||/^\(?\d+\)?[.)]?\s/.test(value)||value.startsWith('|'))continue;if(/^\(?1\)?(?:[.)]|\s)/.test(next))return value}return 'Bài đọc'})();return [{title,content:limited,summary:'',truncated}]}
function splitReadingByQuotes(text,boundaries){const source=String(text||'');if(!Array.isArray(boundaries)||boundaries.length<2)return [];const matches=boundaries.map(x=>{const a=String(x?.startQuote||''),b=String(x?.endQuote||'');if(!a||!b||a.length>80||b.length>80)return null;const start=source.indexOf(a),end=source.indexOf(b,start);return start<0||end<start?null:{title:String(x.title||'Bài đọc'),start,end:end+b.length}}).filter(Boolean).sort((a,b)=>a.start-b.start);if(matches.length<2)return [];return matches.map((x,i)=>({title:x.title,content:source.slice(x.start,matches[i+1]?.start??x.end).trim(),summary:''})).filter(x=>x.content)}
function extractDiscussionTopics(text){
 const body=String(text||'').replace(/^\s*##[^\n]*\n?/,'');
 const out=[];
 const splitSentences=value=>{
  const pieces=[];let start=0;
  for(let i=0;i<value.length;i++){
   if(!/[.!?]/.test(value[i]))continue;
   let end=i+1;while(/["'”’)]/.test(value[end]||''))end++;
   if(end<value.length&&/\s/.test(value[end])&&/[\p{Lu}\d]/u.test(value.slice(end).trimStart()[0]||'')){
    const sentence=value.slice(start,end).trim();if(sentence)pieces.push(sentence);
    start=end;while(/\s/.test(value[start]||''))start++;
   }
  }
  const tail=value.slice(start).trim();if(tail)pieces.push(tail);
  return pieces;
 };
 for(const line of body.split(/\r?\n/)){
  const value=line.trim();if(!value||/^\[\/?BẢNG\]$/i.test(value))continue;
  const cells=value.includes('|')?value.replace(/^\|/,'').replace(/\|$/,'').split('|').map(x=>x.trim()).filter(Boolean):[value];
  for(let topic of cells){
   topic=topic.replace(/^(?:[-*•]|\d+[.)])\s*/,'').trim();
   const numbered=topic.split(/(?=\b\d+[.)]\s+)/u);
   for(const segment of numbered){
    const clean=segment.replace(/^\d+[.)]\s*/,'').trim();
    if(clean)out.push(...splitSentences(clean));
   }
  }
 }
 return [...new Set(out)];
}
function extractTasks(text){const source=String(text||''),starts=[...source.matchAll(/^\s*Task\s+\d+\b[^\n]*/gim)];if(!starts.length){const q=source.replace(/^\s*##[^\n]*\n?/,'').trim();return q?[{type:'Bài tập gốc',question:q,evidence:q.slice(0,1800),options:[],answer:'',answerEvidence:''}]:[]}return starts.map((m,i)=>{const question=source.slice(m.index,starts[i+1]?.index??source.length).trim();return {type:m[0].trim().replace(/\s+/g,' '),question,evidence:question.slice(0,1800),options:[],answer:'',answerEvidence:''}}).filter(x=>x.question)}
function validateAnalysis(x,source){if(!x||!Array.isArray(x.vocabulary)||!Array.isArray(x.readings)||!Array.isArray(x.exercises)||!Array.isArray(x.grammar)||typeof x.summary!=='string')throw Error('Kết quả phân tích thiếu trường bắt buộc. Chưa lưu kết quả.');let rejected=0;const src=norm(source),excerpt=(v,max=1800)=>{if(typeof v!=='string'||!v.trim()||v.length>max||!src.includes(norm(v))){rejected++;return null}return v.trim()};const vocabulary=[];for(const v of x.vocabulary.slice(0,150)){const term=String(v.term||'').trim().slice(0,120);if(!term){rejected++;continue}const item={term,ipa:String(v.ipa||'').slice(0,80),meaning:String(v.meaning||'Chưa xác định nghĩa từ nguồn').slice(0,400),partOfSpeech:String(v.partOfSpeech||'Chưa nêu trong nguồn').slice(0,60),example:String(v.example||'').slice(0,500),evidence:String(v.evidence||'').trim().slice(0,1800),page:Number.isFinite(Number(v.page))?Number(v.page):null,fromGlossary:!!v.fromGlossary};if(v.fromGlossary)vocabulary.push({...item,...verifyVocabularySource({...item,sourceVerified:true},source),fromGlossary:true,sourceVerified:true});else vocabulary.push(verifyVocabularySource(item,source))}const readings=[];for(const v of x.readings.slice(0,30)){const evidence=excerpt(v.evidence);if(!evidence)continue;const c=typeof v.content==='string'?v.content:'';readings.push({title:String(v.title||'Bài đọc').slice(0,160),content:c.trim()&&c.length<=30000&&src.includes(norm(c))?c:evidence,summary:String(v.summary||'').slice(0,600),page:Number.isFinite(Number(v.page))?Number(v.page):null})}const exercises=[];for(const v of x.exercises.slice(0,300)){if(v&&typeof v.itemKey==='string'&&v.itemKey){const kinds=new Set(['short_answer','true_false','multiple_choice','fill_blank','verb_form','matching','classify','definition_to_word','table_fill','ipa_to_word','transform','extract_from_text','discussion','image_based','other']);const statuses=new Set(['confirmed','verified_ai','needs_review','none']);const item={...v,itemKey:v.itemKey.slice(0,200),setIndex:Number.isFinite(Number(v.setIndex))?Number(v.setIndex):0,setTitle:String(v.setTitle||'Bài tập').slice(0,160),section:String(v.section||'').slice(0,40),kind:kinds.has(v.kind)?v.kind:'other',no:Number.isFinite(Number(v.no))?Number(v.no):1,prompt:String(v.prompt||'').slice(0,12000),instruction:String(v.instruction||'').slice(0,3000),rawText:String(v.rawText||'').slice(0,20000),answerStatus:statuses.has(v.answerStatus)?v.answerStatus:'none',evidence:String(v.evidence||'').slice(0,1800),answerCheck:null,page:v.page!==null&&v.page!==undefined&&Number.isFinite(Number(v.page))?Number(v.page):null};if(typeof v.answer==='string')item.answer=v.answer.slice(0,2000);else if(Array.isArray(v.answer))item.answer=v.answer.slice(0,50);else if(v.answer&&typeof v.answer==='object')item.answer=v.answer;else item.answer='';for(const key of ['options','left','right','blanks','wordBank','hint','grid'])if(v[key]!==undefined)item[key]=v[key];exercises.push(item);continue}const evidence=excerpt(v.evidence);if(!evidence)continue;const question=typeof v.question==='string'&&v.question.length<=12000&&src.includes(norm(v.question))?v.question:evidence,answerEvidence=typeof v.answerEvidence==='string'&&src.includes(norm(v.answerEvidence))?v.answerEvidence:'';exercises.push({type:String(v.type||'Bài tập').slice(0,80),question,options:Array.isArray(v.options)?v.options.slice(0,8).map(s=>String(s).slice(0,200)):[],answer:answerEvidence?String(v.answer||'').slice(0,300):'',answerEvidence,page:Number.isFinite(Number(v.page))?Number(v.page):null})} const grammar=[];for(const v of x.grammar.slice(0,50)){const evidence=excerpt(v.evidence,100000);if(!evidence)continue;grammar.push({title:String(v.title||'Ngữ pháp').slice(0,150),explanation:String(v.explanation||'').slice(0,900),evidence})}const warnings=Array.isArray(x.validationWarnings)?x.validationWarnings.map(String):[];if(rejected)warnings.push('Đã bỏ '+rejected+' mục không có dẫn chứng nguyên văn kiểm chứng được.');const unverified=vocabulary.filter(v=>!v.sourceVerified).length;if(unverified)warnings.push(unverified+' từ vựng có dẫn chứng chưa khớp nguyên văn với tài liệu nguồn.');if(!vocabulary.length)warnings.push('Chưa trích xuất được từ vựng có dẫn chứng đủ rõ.');const cefr=['A1','A2','B1','B2','C1','C2'].includes(String(x.cefr||'').toUpperCase())?String(x.cefr).toUpperCase():'Chưa xác định';return {summary:x.summary.slice(0,1800),cefr,cefrRationale:String(x.cefrRationale||'').slice(0,400),units:Array.isArray(x.units)?x.units.slice(0,20).map(String):[],starter:String(x.starter||''),discussion:Array.isArray(x.discussion)?x.discussion.map(String):[],sectionMap:Array.isArray(x.sectionMap)?x.sectionMap:[],structureNonStandard:!!x.structureNonStandard,vocabulary,readings,exercises,grammar,filteredOut:Array.isArray(x.filteredOut)?x.filteredOut.slice(0,30).map(String):[],validationWarnings:[...new Set(warnings)]}}
module.exports={makeId,hash,cleanPageText,splitUnits,detectSections,parseGlossary,splitReadings,splitReadingByQuotes,extractDiscussionTopics,extractTasks,validateAnalysis,normalizeEvidenceText,verifyVocabularySource,verifyVocabularyList,selectRelevantContext};
