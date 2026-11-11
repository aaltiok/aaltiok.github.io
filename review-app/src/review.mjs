
(()=>{
const root=document.getElementById('wb-type-review'),$=id=>root.querySelector('#'+id);
const types=JSON.parse($('type-data').textContent),cats=['Production/Dissemination','Operationalization/Implementation'];
const labels=['Prod./Diss.','Oper./Impl.'],codes=['PD','OI'],states=['pending','reviewed','not-required'];
const short=c=>labels[cats.indexOf(c)]||'Unassigned',code=c=>codes[cats.indexOf(c)]||'—';
const shortText=s=>cats.reduce((out,c)=>out.split(c).join(short(c)),String(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let records=Object.fromEntries(types.map(t=>[t.name,{category:t.category,status:t.review?'pending':'not-required',by:null,at:null,reviewedBy:null,reviewedAt:null}]));
let selected='Report',person='Ali',events=[],comments=[],scope='all',reviewScope='all',drafts={},openedDocs=new Set();
let exceptions={},editingDocs=new Set();
const docCache=new Map(),loadingDocs=new Set(),docErrors=new Map(),pageSize=25;
let docType='',docQuery='',docPage=0;
let readerToken=0,readerAbort,readingId='',excludedOffset=0,excludedTotal=0,excludedRows=[],excludedToken=0,excludedTimer;
async function fullReading(){
 const token=readerToken;readerAbort?.abort();readerAbort=new AbortController();$('reader-full').disabled=true;$('reader-status').textContent='Loading the report text from the World Bank…';
 try{const text=await window.wbFullText(readingId,readerAbort.signal);if(token!==readerToken)return;$('reader-content').textContent=text;$('reader-status').textContent='Report text from the World Bank. Use your browser’s Find command to search; open the PDF for the original layout.';}
 catch(e){if(token===readerToken&&e.name!=='AbortError')$('reader-status').textContent=e.message+' The saved preview remains below.';}
 finally{if(token===readerToken)$('reader-full').disabled=false;}
}
async function openReader(doc){
 readerAbort?.abort();const token=++readerToken;readingId=doc.id;$('reader-heading').textContent=doc.title;$('reader-meta').textContent=doc.type||selected;$('reader-content').textContent=doc.text||'';$('reader-status').textContent='Loading reading view…';$('reader-pdf').hidden=true;$('reader-record').hidden=true;$('reader-full').disabled=true;
 if(!$('report-reader').open)$('report-reader').showModal();
 try{const data=await window.wbGet('/api/reading?id='+encodeURIComponent(doc.id));if(token!==readerToken)return;
  $('reader-meta').textContent=`${data.year} · ${data.type}${data.included?'':' · Excluded from corpus'}`;
  $('reader-content').textContent=data.opening||'The original report is available through the links above.';
  for(const [key,id] of [['pdf','reader-pdf'],['url','reader-record']]){const u=data[key];if(u&&/^https:\/\/(?:[a-z0-9-]+\.)*worldbank\.org\//i.test(u)){$(id).href=u;$(id).hidden=false;}}
  $('reader-status').textContent=data.opening?'Saved opening preview · '+data.opening.split(/\s+/).length.toLocaleString('en-US')+' words.':'Loading source text…';$('reader-full').disabled=!data.text;
  if(data.text)fullReading();
 }catch(e){if(token===readerToken)$('reader-status').textContent=e.message;}
}
async function renderExcluded(){
 const token=++excludedToken,params=new URLSearchParams({q:$('excluded-search').value,type:$('excluded-type').value,offset:String(excludedOffset)});$('excluded-count').textContent='Loading excluded titles…';
 try{const data=await window.wbGet('/api/excluded?'+params);if(token!==excludedToken)return;excludedRows=data.rows;excludedTotal=data.total;
  $('excluded-rows').innerHTML=data.rows.map(d=>`<tr><td>${esc(d.type)}</td><td><button data-read-excluded="${esc(d.id)}">${esc(d.title)}</button><div class="t-muted">${esc(d.year)} · ${esc(d.id)}${d.reason?' · '+esc(d.reason):''}</div></td></tr>`).join('');
  $('excluded-count').textContent=data.total?`${excludedOffset+1}–${excludedOffset+data.rows.length} of ${data.total.toLocaleString('en-US')}`:'No matching excluded titles';$('excluded-prev').disabled=excludedOffset===0;$('excluded-next').disabled=excludedOffset+50>=data.total;
 }catch(e){$('excluded-count').textContent=e.message;}
}
document.getElementById('excluded-open').addEventListener('click',async()=>{
 $('excluded-dialog').showModal();excludedOffset=0;renderExcluded();
 if($('excluded-type').options.length===1){try{const types=await window.wbGet('/api/excluded-types');$('excluded-type').innerHTML='<option value="">All document types</option>'+types.map(t=>`<option value="${esc(t.type)}">${esc(t.type)} (${t.count.toLocaleString('en-US')})</option>`).join('');}catch{}}
});
$('report-reader').addEventListener('close',()=>{readerToken++;readerAbort?.abort();});
$('reader-close').addEventListener('click',()=>$('report-reader').close());$('reader-full').addEventListener('click',fullReading);
$('excluded-close').addEventListener('click',()=>$('excluded-dialog').close());
$('excluded-search').addEventListener('input',()=>{clearTimeout(excludedTimer);excludedOffset=0;excludedTimer=setTimeout(renderExcluded,250);});
$('excluded-type').addEventListener('change',()=>{excludedOffset=0;renderExcluded();});
$('excluded-prev').addEventListener('click',()=>{excludedOffset=Math.max(0,excludedOffset-50);renderExcluded();});$('excluded-next').addEventListener('click',()=>{excludedOffset+=50;renderExcluded();});
function restore(s){
 if(!['types-v1','types-v2'].includes(s?.modelContent?.schema))return;
 const m=s.modelContent,p=s.privateContent||{};
 exceptions=m.exceptions||{};
 events=Array.isArray(m.events)?m.events.slice(-14):[];
 for(const t of types){const r=m.records?.[t.name];if(!r||!(cats.includes(r.category)||(t.originalType===''&&r.category===null)))continue;
  const oldReview=[...events].reverse().find(e=>e.type===t.name&&['Marked type reviewed','Flagged type for review'].includes(e.action));
  const status=states.includes(r.status)?r.status:r.review?'pending':oldReview?.action==='Marked type reviewed'?'reviewed':'not-required';
  records[t.name]={category:r.category,status,by:['Ali','Caroline'].includes(r.by)?r.by:null,at:r.at||null,reviewedBy:r.reviewedBy||(status==='reviewed'?oldReview?.by:null)||null,reviewedAt:r.reviewedAt||(status==='reviewed'?oldReview?.at:null)||null};
 }
 comments=Array.isArray(p.comments)?p.comments.slice(-12):[];
 if(types.some(t=>t.name===p.selected))selected=p.selected;if(['Ali','Caroline'].includes(p.person))person=p.person;
}
restore(window.openai?.widgetState);
const current=()=>types.find(t=>t.name===selected);
const stamp=t=>new Date(t).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
function save(){try{window.openai?.setWidgetState?.({modelContent:{schema:'types-v2',sampleOnly:false,records,exceptions,events},privateContent:{selected,person,comments}})?.catch(()=>{});}catch{}}
function visible(){const q=$('type-search').value.toLowerCase();return types.filter(t=>t.name.toLowerCase().includes(q)&&(scope==='all'||(scope==='unassigned'?records[t.name].category===null:records[t.name].category===scope))&&(reviewScope==='all'||records[t.name].status===reviewScope));}
function renderStats(){
 $('type-stats').innerHTML=[...cats,'review'].map(c=>{const matching=types.filter(t=>c==='review'?records[t.name].status==='pending':records[t.name].category===c),n=matching.length;let count=matching.reduce((a,t)=>a+t.corpusCount,0);if(c!=='review')for(const r of Object.values(exceptions)){if(records[r.type]?.category===c)count--;if(r.category===c)count++;}return `<button class="t-stat" data-scope="${c}" aria-label="${c==='review'?'Show types needing review':'Show all '+c+' types'}" aria-pressed="${c==='review'?reviewScope==='pending':scope===c}"><span>${c==='review'?'⚑ Needs review':short(c)+' ('+code(c)+')'}<br><span>${count.toLocaleString('en-US')} documents${c==='review'&&n===0?' · Queue clear':''}</span></span><strong>${n} <span>types</span></strong></button>`;}).join('');
 $('type-review-progress').textContent=`${types.filter(t=>records[t.name].status==='pending').length} pending · ${types.filter(t=>records[t.name].status==='reviewed').length} reviewed · ${types.filter(t=>records[t.name].status==='not-required').length} no review needed`;
 const unassigned=types.filter(t=>records[t.name].category===null).reduce((n,t)=>n+t.corpusCount,0)-Object.values(exceptions).filter(r=>records[r.type]?.category===null).length,n=Object.keys(exceptions).length;$('type-unassigned-status').textContent=(unassigned?`${unassigned.toLocaleString('en-US')} documents unassigned. `:'')+`${n} individual exception${n===1?'':'s'}.`;
}
function statusMark(r){return r.status==='pending'?'<span class="t-flag">⚑ Needs review</span>':r.status==='reviewed'?`<span class="t-reviewed">✓ Reviewed${r.reviewedBy?' · '+esc(r.reviewedBy):''}</span>`:'<span class="t-muted" style="display:block;font-size:11px">No review needed</span>';}
function renderList(){const list=visible();$('type-visible').textContent=list.length+' of '+types.length;$('type-list').innerHTML=list.length?list.map(t=>`<button class="t-grid t-type" data-type="${esc(t.name)}" aria-pressed="${selected===t.name}"><span>${esc(t.name)}${statusMark(records[t.name])}</span><span class="t-count">${t.corpusCount.toLocaleString('en-US')}</span><span class="t-category" data-tooltip="${esc(records[t.name].category)}">${code(records[t.name].category)}</span></button>`).join(''):'<p class="t-muted">No types in this view. The review queue may be clear; change the filters to see other types.</p>';}
function renderDocuments(){
 const t=current();
 if(docType!==t.name){docType=t.name;docPage=0;docQuery='';$('doc-search').value='';}
 $('type-doc-title').textContent=`Inspect all ${t.corpusCount.toLocaleString('en-US')} documents in this type`;
 $('type-sample-note').textContent='Every title is available. Open a title to read its first 100 words from the original text.';
 if(!docCache.has(t.name)){
  $('type-doc-list').innerHTML=docErrors.has(t.name)?`<p class="t-muted">${esc(docErrors.get(t.name))}</p><button id="doc-retry">Retry loading titles</button>`:'<p class="t-muted" role="status">Loading document titles and openings…</p>';
  $('doc-page').textContent='';$('doc-prev').disabled=true;$('doc-next').disabled=true;
  if(!loadingDocs.has(t.name)&&!docErrors.has(t.name)){
   loadingDocs.add(t.name);
   window.wbDocuments(t.name).then(docs=>{docCache.set(t.name,docs);}).catch(e=>docErrors.set(t.name,e.message)).finally(()=>{loadingDocs.delete(t.name);if(selected===t.name)renderDocuments();});
  }return;
 }
 const docs=docCache.get(t.name).filter(d=>`${d.title} ${d.id} ${d.year}`.toLowerCase().includes(docQuery));
 const pages=Math.max(1,Math.ceil(docs.length/pageSize));docPage=Math.min(docPage,pages-1);
 const start=docPage*pageSize,shown=docs.slice(start,start+pageSize);
 $('doc-page').textContent=docs.length?`${start+1}–${start+shown.length} of ${docs.length.toLocaleString('en-US')}`:'No matching titles';
 $('doc-prev').disabled=docPage===0;$('doc-next').disabled=docPage>=pages-1;
 $('type-doc-list').innerHTML=shown.map(d=>{const x=exceptions[d.id],category=x?.category||records[t.name].category;return `<details class="t-doc" data-doc="${esc(d.id)}"${openedDocs.has(d.id)?' open':''}><summary><span>${esc(d.year)}</span><span class="t-title">${esc(d.title)}</span><span class="t-doc-label">${code(category)}${x?' · exception':''}</span></summary><div class="t-muted" style="margin-top:8px">${x?code(x.category)+' · individual exception · '+esc(x.by)+' · '+esc(stamp(x.at)):category?code(category)+' · type default':'Unassigned · no document type recorded'}${d.earlier?' · earlier individual coding: '+esc(d.earlier):''}</div><button data-read-report="${esc(d.id)}" style="margin-top:10px">Read report</button><p class="t-opening">${esc(d.text)} …</p><div class="t-muted">${Math.min(100,d.text.split(/\s+/).length)} words · original opening · document ${esc(d.id)}</div><button data-assign-document="${esc(d.id)}" class="t-assign">${x?'Change individual label':'Assign individually'}</button>${editingDocs.has(d.id)?`<div class="t-exception-controls" role="group" aria-label="Assign document ${esc(d.id)}"><span class="t-muted">This document only</span>${cats.map(c=>`<button data-exception-id="${esc(d.id)}" data-exception-category="${c}" aria-pressed="${x?.category===c}">${code(c)}</button>`).join('')}<button data-inherit-document="${esc(d.id)}"${x?'':' disabled'}>Use type default</button></div>`:''}</details>`;}).join('');
}
function renderActivity(){const c=comments.filter(x=>x.type===selected),h=events.filter(x=>x.type===selected).reverse();$('type-comment-title').textContent=`Type-level comments${c.length?' ('+c.length+')':''}`;$('type-comments').innerHTML=c.map(x=>`<div class="t-activity">${esc(x.by)} · <span class="t-muted">${esc(stamp(x.at))}</span><p>${esc(x.text)}</p></div>`).join('');$('type-note-person').textContent=person;$('type-note').value=drafts[selected+'|'+person]||'';$('type-history-title').textContent=`Change history${h.length?' ('+h.length+')':''}`;$('type-history').innerHTML=h.length?h.map(x=>`<div class="t-activity">${esc(x.by)} · <span class="t-muted">${esc(stamp(x.at))}</span><br>${esc(shortText(x.action))}</div>`).join(''):'<p class="t-muted">No changes yet.</p>';}
function renderDetail(){
 const t=current(),r=records[selected];
 $('type-heading').innerHTML=`<div class="t-kicker">${t.originalType===''?'Missing metadata group':'Document type'}</div><h2>${esc(t.name)}</h2><div class="t-muted" style="margin-top:6px">${t.corpusCount.toLocaleString('en-US')} documents · all titles and openings available</div>`;
 $('type-current').textContent=short(r.category)+' ('+code(r.category)+')';
 $('type-categories').innerHTML=cats.map(c=>`<button data-category="${c}" aria-label="Classify type as ${c}" data-tooltip="${c}" aria-pressed="${r.category===c}">${short(c)} (${code(c)})</button>`).join('');
 $('type-review-controls').innerHTML=r.status==='pending'?`<span class="t-flag">⚑ Needs review</span><button data-review-action="reviewed"${r.category===null?' disabled title="Choose a classification before completing review"':''}>✓ Mark reviewed</button>`:r.status==='reviewed'?'<span class="t-reviewed">✓ Reviewed</span><button data-review-action="pending">Reopen review</button>':'<span>No review needed</span><button data-review-action="pending">Request review</button>';
 $('type-reviewed-meta').textContent=r.status==='reviewed'&&r.reviewedBy?`Review completed by ${r.reviewedBy} · ${stamp(r.reviewedAt)}`:'';
 $('type-last').textContent=r.by?`Type last changed by ${r.by} · ${stamp(r.at)}`:'';
 const n=Object.values(exceptions).filter(x=>x.type===selected).length;$('type-current').textContent+=n?` · ${n} individual exception${n===1?'':'s'}`:'';
 $('type-person').value=person;renderDocuments();renderActivity();
}
function render(){renderStats();renderList();renderDetail();}
function change(action,at=new Date().toISOString()){records[selected].by=person;records[selected].at=at;events.push({type:selected,by:person,at,action});events=events.slice(-14);render();$('type-status').textContent=`Type-level change recorded as ${person}.`;save();}
function filters(){scope=$('type-filter').value;reviewScope=$('type-review-filter').value;const list=visible();if(list.length&&!list.some(t=>t.name===selected)){selected=list[0].name;$('type-doc-panel').open=false;$('type-status').textContent='';}render();}
root.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.type){selected=b.dataset.type;openedDocs.clear();$('type-doc-panel').open=true;$('type-comment-panel').open=false;$('type-status').textContent='';render();save();}
 if(b.dataset.category&&records[selected].category!==b.dataset.category){const r=records[selected],before=r.category;const reopened=r.status==='reviewed';r.category=b.dataset.category;if(reopened){r.status='pending';r.reviewedBy=null;r.reviewedAt=null;}change(before+' → '+r.category+(reopened?' · review reopened':''));}
 if(b.dataset.reviewAction){const status=b.dataset.reviewAction;if(!states.includes(status)||(status==='reviewed'&&records[selected].category===null))return;const r=records[selected],at=new Date().toISOString();r.status=status;r.reviewedBy=status==='reviewed'?person:null;r.reviewedAt=status==='reviewed'?at:null;change(status==='reviewed'?'Review completed; removed from review queue':'Review requested / reopened',at);}
 if(b.dataset.scope){if(b.dataset.scope==='review'){$('type-filter').value='all';$('type-review-filter').value=reviewScope==='pending'?'all':'pending';}else{$('type-filter').value=scope===b.dataset.scope?'all':b.dataset.scope;$('type-review-filter').value='all';}filters();}
 if(b.dataset.readReport){const d=docCache.get(selected)?.find(d=>d.id===b.dataset.readReport);if(d)openReader({...d,type:selected});}
 if(b.dataset.readExcluded){const d=excludedRows.find(d=>d.id===b.dataset.readExcluded);if(d)openReader(d);}
 if(b.id==='doc-prev'){docPage--;renderDocuments();}
 if(b.id==='doc-next'){docPage++;renderDocuments();}
 if(b.id==='doc-retry'){docErrors.delete(selected);renderDocuments();}
 if(b.dataset.assignDocument){const id=b.dataset.assignDocument;openedDocs.add(id);editingDocs.has(id)?editingDocs.delete(id):editingDocs.add(id);renderDocuments();}
 if(b.dataset.exceptionId||b.dataset.inheritDocument){const id=b.dataset.exceptionId||b.dataset.inheritDocument;openedDocs.add(id);window.wbSetException({id,type:selected,category:b.dataset.exceptionCategory||null,actor:person});}
 if(b.id==='type-post'){const text=$('type-note').value.trim();if(!text){$('type-status').textContent='Write a comment first.';return;}comments.push({type:selected,by:person,at:new Date().toISOString(),text:text.slice(0,350)});comments=comments.slice(-12);drafts[selected+'|'+person]='';renderActivity();$('type-status').textContent=`Comment on ${selected} recorded as ${person}.`;save();}
});
root.addEventListener('toggle',e=>{const id=e.target.dataset?.doc;if(id){if(e.target.open)openedDocs.add(id);else openedDocs.delete(id);}},true);
$('type-person').addEventListener('change',e=>{person=e.target.value;renderDetail();$('type-status').textContent=`Type edits, reviews and comments will be attributed to ${person}.`;save();});
$('type-note').addEventListener('input',e=>{drafts[selected+'|'+person]=e.target.value;});
$('type-search').addEventListener('input',filters);$('type-filter').addEventListener('change',filters);$('type-review-filter').addEventListener('change',filters);
$('doc-search').addEventListener('input',e=>{docQuery=e.target.value.toLowerCase();docPage=0;renderDocuments();});
window.addEventListener('openai:set_globals',e=>{const s=e.detail?.globals?.widgetState;if(!['types-v1','types-v2'].includes(s?.modelContent?.schema))return;restore(s);render();$('type-status').textContent='';});
$('type-doc-panel').open=true;render();
})();

