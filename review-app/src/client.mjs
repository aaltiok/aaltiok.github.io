const banner=document.getElementById('connection-status'),reloadButton=document.getElementById('reload-shared');
const undoButton=document.getElementById('undo-change'),redoButton=document.getElementById('redo-change'),practiceButton=document.getElementById('practice-mode'),modeLabel=document.getElementById('save-mode');
const exportButton=document.getElementById('export-excel');
let remote,pending=0,queue=Promise.resolve(),blocked=false,lastJob=0,practice=false,practiceUndo=[],practiceRedo=[],exporting=false;
let preferences={person:'Ali',selected:'Report'};
try{preferences={...preferences,...JSON.parse(localStorage.getItem('wb-review-ui')||'{}')};}catch{}
const describe=(text,error=false)=>{banner.textContent=text;banner.setAttribute('role',error?'alert':'status');};
const signature=records=>JSON.stringify(Object.entries(records).map(([type,r])=>[type,r.category,r.status]));
const commentKey=c=>JSON.stringify([c.type,c.at,c.by,c.text]);
let lastSubmittedSignature,lastSubmittedComments;
function controls(){
 const h=remote?.history?.[preferences.person]||{},busy=pending>0||(!practice&&blocked);
 undoButton.disabled=busy||!(practice?practiceUndo.length:h.undo);redoButton.disabled=busy||!(practice?practiceRedo.length:h.redo);
 undoButton.title=practice?'Undo the last practice change':h.undo?`Undo ${preferences.person}’s last change: ${h.undo.type}`:'Nothing to undo';
 redoButton.title=practice?'Redo the last practice change':h.redo?`Redo ${preferences.person}’s last change: ${h.redo.type}`:'Nothing to redo';
 practiceButton.disabled=pending>0;practiceButton.setAttribute('aria-pressed',String(practice));practiceButton.textContent=practice?'Leave practice · discard tests':'Practice mode';
 modeLabel.textContent=practice?'Practice · not saved':'Autosave on';
 if(exportButton){exportButton.disabled=!remote||pending>0||practice||exporting;exportButton.title=practice?'Leave practice to export saved decisions.':'Download all retained documents with the current saved coding.';}
}
async function api(path,options){
 const response=await fetch(path,{cache:'no-store',credentials:'same-origin',...options});
 if(response.status===401){describe('Your password session expired. Sign in again to continue.',true);location.assign('/');throw new Error('Sign-in required');}
 const body=await response.json();if(!response.ok){const e=new Error(body.error||'The change could not be saved.');e.status=response.status;throw e;}return body;
}
function snapshot(){return {modelContent:remote.modelContent,privateContent:{...remote.privateContent,...preferences}};}
function deliver(){window.openai.widgetState=snapshot();window.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:window.openai.widgetState}}}));controls();}
function resetSubmitted(){lastSubmittedSignature=signature(remote.modelContent.records);lastSubmittedComments=JSON.stringify((remote.privateContent.comments||[]).map(commentKey));}
function localChange(next){practiceUndo.push({before:structuredClone(remote),after:structuredClone(next)});practiceRedo=[];remote=next;resetSubmitted();deliver();describe('Practice mode · nothing is saved. Leave practice to discard these tests.');return Promise.resolve();}
async function reload(){if(practice){describe('Leave practice to discard tests and refresh the saved decisions.');return;}if(pending){describe('Wait for the current save to finish before refreshing.');return;}remote=await api('/api/state');blocked=false;resetSubmitted();deliver();describe('Shared decisions are up to date. Your saved choices are kept.');}
reloadButton.addEventListener('click',()=>reload().catch(e=>describe(e.message,true)));
function enqueue(operation,message='Saving shared decision…'){
 if(blocked){deliver();describe('Your edit was not saved. Reload shared decisions, then retry it.',true);return Promise.resolve();}
 pending++;const job=++lastJob;describe(message);controls();
 queue=queue.then(async()=>{
  if(blocked){pending--;controls();return;}
  try{remote=await operation();if(job===lastJob){resetSubmitted();deliver();describe('Saved automatically · visible to both reviewers.');}}
  catch(e){blocked=true;if(e.status===409){try{remote=await api('/api/state');}catch{}}deliver();describe(e.status===409?'Your action was not applied. '+e.message+' Reload shared decisions before continuing.':'Your edit was not saved. '+e.message+' Reload shared decisions before trying again.',true);}
  finally{pending--;controls();}
 }).catch(e=>{blocked=true;pending=0;controls();describe('Could not save: '+e.message,true);});return queue;
}
async function initialize(){
 const [sample,state]=await Promise.all([api('/api/types'),api('/api/state')]);remote=state;resetSubmitted();document.getElementById('type-data').textContent=JSON.stringify(sample);
 window.wbDocuments=type=>api('/api/documents?type='+encodeURIComponent(type));
 window.wbGet=path=>api(path);
 exportButton?.addEventListener('click',async()=>{
  if(practice||pending||exporting)return;exporting=true;controls();
  try{
   describe('Preparing Excel export…');await import('/exceljs.min.js');const {buildWorkbook}=await import('/export.mjs');
   const documents=[];let offset=0;
   while(offset!==null){
    let page;
    for(let attempt=0;attempt<3;attempt++){
     try{page=await api('/api/export-documents?offset='+offset);break;}
     catch(e){if(attempt===2||e.status!==503)throw e;await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));}
    }
    documents.push(...page.rows);offset=page.nextOffset;describe('Preparing Excel: '+documents.length.toLocaleString('en-US')+' documents…');
   }
   const expected=sample.reduce((n,t)=>n+t.corpusCount,0);if(documents.length!==expected)throw new Error('The document list is incomplete. Please try again.');
   const saved=await api('/api/export'),workbook=buildWorkbook(window.ExcelJS,{documents,types:sample,state:saved});
   const bytes=await workbook.xlsx.writeBuffer(),blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='world-bank-review-'+new Date().toISOString().slice(0,10)+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
   describe('Excel downloaded · '+documents.length.toLocaleString('en-US')+' documents with the saved coding.');
  }catch(e){describe('Excel export failed: '+e.message,true);}finally{exporting=false;controls();}
 });
 window.wbFullText=async(id,signal)=>{
  const r=await fetch('/api/full-text?id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',signal});
  if(!r.ok){const b=await r.json();throw new Error(b.error||'The source text is unavailable.');}
  const reader=r.body.getReader(),decoder=new TextDecoder();let text='',size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024){await reader.cancel();text+='\n\n[Large report: open the original PDF to continue.]';break;}text+=decoder.decode(value,{stream:true});}
  return text+decoder.decode();
 };
 window.wbSetException=({id,type,category,actor})=>{
  if(practice){const next=structuredClone(remote);next.modelContent.exceptions||={};if(category===null)delete next.modelContent.exceptions[id];else next.modelContent.exceptions[id]={type,category,by:actor,at:new Date().toISOString()};return localChange(next);}
  return enqueue(()=>api('/api/document',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:remote.revision,id,type,category,actor})}),'Saving individual document assignment…');
 };
 window.openai={widgetState:snapshot(),setWidgetState(next){
  preferences={person:next.privateContent.person,selected:next.privateContent.selected};try{localStorage.setItem('wb-review-ui',JSON.stringify(preferences));}catch{}controls();
  const proposed=structuredClone(next),sig=signature(proposed.modelContent.records),cm=JSON.stringify((proposed.privateContent.comments||[]).map(commentKey));
  if(sig===lastSubmittedSignature&&cm===lastSubmittedComments)return Promise.resolve();
  if(practice)return localChange({...remote,modelContent:proposed.modelContent,privateContent:{comments:proposed.privateContent.comments||[]}});
  lastSubmittedSignature=sig;lastSubmittedComments=cm;
  return enqueue(()=>api('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:remote.revision,actor:proposed.privateContent.person,records:proposed.modelContent.records,comments:proposed.privateContent.comments||[]})}));
 }};
 for(const [button,direction] of [[undoButton,'undo'],[redoButton,'redo']])button.addEventListener('click',()=>{
  if(practice){const from=direction==='undo'?practiceUndo:practiceRedo,to=direction==='undo'?practiceRedo:practiceUndo,item=from.pop();if(!item)return;to.push(item);remote=structuredClone(direction==='undo'?item.before:item.after);resetSubmitted();deliver();describe('Practice change '+(direction==='undo'?'undone':'redone')+' · nothing saved.');return;}
  const actor=preferences.person;enqueue(()=>api('/api/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:remote.revision,actor,direction})}),(direction==='undo'?'Undoing':'Redoing')+' the last change…');
 });
 practiceButton.addEventListener('click',async()=>{
  if(pending)return;
  if(!practice){practice=true;remote=structuredClone(remote);practiceUndo=[];practiceRedo=[];controls();describe('Practice mode · nothing is saved. Leave practice to discard these tests.');}
  else{try{const saved=await api('/api/state');practice=false;practiceUndo=[];practiceRedo=[];remote=saved;blocked=false;resetSubmitted();deliver();describe('Practice tests discarded. Saved decisions restored. Autosave is on.');}catch(e){describe('Could not leave practice: '+e.message,true);}}
 });
 await import('/prototype.mjs');controls();describe('Connected · autosave is on. Use Practice mode to test without saving.');
 setInterval(async()=>{
  if(pending||blocked||practice||document.visibilityState==='hidden')return;
  try{const latest=await api('/api/state?revision='+remote.revision);if(pending||blocked||practice||latest.unchanged)return;if(latest.revision!==remote.revision){remote=latest;resetSubmitted();deliver();describe('Updated with the latest shared decisions. Autosave is on.');}}
  catch{describe('Connection interrupted. Existing decisions remain on screen; reconnect before saving.',true);}
 },8000);
}
initialize().catch(e=>describe('Could not load the workspace: '+e.message,true));
window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue='';}});
