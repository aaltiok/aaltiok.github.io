
(()=>{
const root=document.getElementById('wb-type-review'),$=id=>root.querySelector('#'+id);
const types=JSON.parse($('type-data').textContent),cats=['Production/Dissemination','Operationalization/Implementation'];
const labels=['Prod./Diss.','Oper./Impl.'],codes=['PD','OI'],states=['pending','reviewed','not-required'];
const short=c=>labels[cats.indexOf(c)]||'Unassigned',code=c=>codes[cats.indexOf(c)]||'—';
const shortText=s=>cats.reduce((out,c)=>out.split(c).join(short(c)),String(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let records=Object.fromEntries(types.map(t=>[t.name,{category:t.category,status:t.review?'pending':'not-required',by:null,at:null,reviewedBy:null,reviewedAt:null}]));
let selected='Report',person='Ali',events=[],comments=[],scope='all',reviewScope='all',drafts={},openedDocs=new Set();
const docCache=new Map(),loadingDocs=new Set(),docErrors=new Map(),pageSize=25;
let docType='',docQuery='',docPage=0;
function restore(s){
 if(!['types-v1','types-v2'].includes(s?.modelContent?.schema))return;
 const m=s.modelContent,p=s.privateContent||{};
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
function save(){try{window.openai?.setWidgetState?.({modelContent:{schema:'types-v2',sampleOnly:false,records,events},privateContent:{selected,person,comments}})?.catch(()=>{});}catch{}}
function visible(){const q=$('type-search').value.toLowerCase();return types.filter(t=>t.name.toLowerCase().includes(q)&&(scope==='all'||(scope==='unassigned'?records[t.name].category===null:records[t.name].category===scope))&&(reviewScope==='all'||records[t.name].status===reviewScope));}
function renderStats(){
 $('type-stats').innerHTML=[...cats,'review'].map(c=>{const matching=types.filter(t=>c==='review'?records[t.name].status==='pending':records[t.name].category===c),n=matching.length,count=matching.reduce((a,t)=>a+t.corpusCount,0);return `<button class="t-stat" data-scope="${c}" aria-label="${c==='review'?'Show types needing review':'Show all '+c+' types'}" aria-pressed="${c==='review'?reviewScope==='pending':scope===c}"><span>${c==='review'?'⚑ Needs review':short(c)+' ('+code(c)+')'}<br><span>${count.toLocaleString('en-US')} documents${c==='review'&&n===0?' · Queue clear':''}</span></span><strong>${n} <span>types</span></strong></button>`;}).join('');
 $('type-review-progress').textContent=`${types.filter(t=>records[t.name].status==='pending').length} pending · ${types.filter(t=>records[t.name].status==='reviewed').length} reviewed · ${types.filter(t=>records[t.name].status==='not-required').length} no review needed`;
 const unassigned=types.filter(t=>records[t.name].category===null).reduce((n,t)=>n+t.corpusCount,0);$('type-unassigned-status').textContent=unassigned?`${unassigned.toLocaleString('en-US')} documents unassigned; see the review queue.`:'';
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
 $('type-doc-list').innerHTML=shown.map(d=>`<details class="t-doc" data-doc="${esc(d.id)}"${openedDocs.has(d.id)?' open':''}><summary><span>${esc(d.year)}</span><span>${esc(d.title)}</span></summary><div class="t-muted" style="margin-top:8px">${records[t.name].category?code(records[t.name].category)+' · inherited from type':'Unassigned · no document type recorded'}${d.earlier?' · earlier individual coding: '+esc(d.earlier):''}</div><p class="t-opening">${esc(d.text)} …</p><div class="t-muted">${Math.min(100,d.text.split(/\s+/).length)} words · original opening · document ${esc(d.id)}</div></details>`).join('');
}
function renderActivity(){const c=comments.filter(x=>x.type===selected),h=events.filter(x=>x.type===selected).reverse();$('type-comment-title').textContent=`Type-level comments${c.length?' ('+c.length+')':''}`;$('type-comments').innerHTML=c.map(x=>`<div class="t-activity">${esc(x.by)} · <span class="t-muted">${esc(stamp(x.at))}</span><p>${esc(x.text)}</p></div>`).join('');$('type-note-person').textContent=person;$('type-note').value=drafts[selected+'|'+person]||'';$('type-history-title').textContent=`Type-level change history${h.length?' ('+h.length+')':''}`;$('type-history').innerHTML=h.length?h.map(x=>`<div class="t-activity">${esc(x.by)} · <span class="t-muted">${esc(stamp(x.at))}</span><br>${esc(shortText(x.action))}</div>`).join(''):'<p class="t-muted">No type-level changes yet.</p>';}
function renderDetail(){
 const t=current(),r=records[selected];
 $('type-heading').innerHTML=`<div class="t-kicker">${t.originalType===''?'Missing metadata group':'Document type'}</div><h2>${esc(t.name)}</h2><div class="t-muted" style="margin-top:6px">${t.corpusCount.toLocaleString('en-US')} documents · all titles and openings available</div>`;
 $('type-current').textContent=short(r.category)+' ('+code(r.category)+')';
 $('type-categories').innerHTML=cats.map(c=>`<button data-category="${c}" aria-label="Classify type as ${c}" data-tooltip="${c}" aria-pressed="${r.category===c}">${short(c)} (${code(c)})</button>`).join('');
 $('type-review-controls').innerHTML=r.status==='pending'?`<span class="t-flag">⚑ Needs review</span><button data-review-action="reviewed"${r.category===null?' disabled title="Choose a classification before completing review"':''}>✓ Mark reviewed</button>`:r.status==='reviewed'?'<span class="t-reviewed">✓ Reviewed</span><button data-review-action="pending">Reopen review</button>':'<span>No review needed</span><button data-review-action="pending">Request review</button>';
 $('type-reviewed-meta').textContent=r.status==='reviewed'&&r.reviewedBy?`Review completed by ${r.reviewedBy} · ${stamp(r.reviewedAt)}`:'';
 $('type-last').textContent=r.by?`Type last changed by ${r.by} · ${stamp(r.at)}`:(t.reason||'Classification assigned to the whole type.')+(r.status==='pending'?' Review whether this label fits the whole group.':'');
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
 if(b.id==='doc-prev'){docPage--;renderDocuments();}
 if(b.id==='doc-next'){docPage++;renderDocuments();}
 if(b.id==='doc-retry'){docErrors.delete(selected);renderDocuments();}
 if(b.id==='type-post'){const text=$('type-note').value.trim();if(!text){$('type-status').textContent='Write a comment first.';return;}comments.push({type:selected,by:person,at:new Date().toISOString(),text:text.slice(0,350)});comments=comments.slice(-12);drafts[selected+'|'+person]='';renderActivity();$('type-status').textContent=`Comment on ${selected} recorded as ${person}.`;save();}
});
root.addEventListener('toggle',e=>{const id=e.target.dataset?.doc;if(id){if(e.target.open)openedDocs.add(id);else openedDocs.delete(id);}},true);
$('type-person').addEventListener('change',e=>{person=e.target.value;renderDetail();$('type-status').textContent=`Type edits, reviews and comments will be attributed to ${person}.`;save();});
$('type-note').addEventListener('input',e=>{drafts[selected+'|'+person]=e.target.value;});
$('type-search').addEventListener('input',filters);$('type-filter').addEventListener('change',filters);$('type-review-filter').addEventListener('change',filters);
$('doc-search').addEventListener('input',e=>{docQuery=e.target.value.toLowerCase();docPage=0;renderDocuments();});
window.addEventListener('openai:set_globals',e=>{const s=e.detail?.globals?.widgetState;if(!['types-v1','types-v2'].includes(s?.modelContent?.schema))return;restore(s);render();});
$('type-doc-panel').open=true;render();
})();

