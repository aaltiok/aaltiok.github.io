const banner = document.getElementById('connection-status');
const reloadButton = document.getElementById('reload-shared');
let remote, pending = 0, queue = Promise.resolve(), blocked = false, lastJob = 0;
let preferences = { person: 'Ali', selected: 'Report' };
try { preferences = { ...preferences, ...JSON.parse(localStorage.getItem('wb-review-ui') || '{}') }; } catch {}
const describe = (text, error = false) => { banner.textContent = text; banner.setAttribute('role', error ? 'alert' : 'status'); };
const signature = records => JSON.stringify(Object.entries(records).map(([type,r]) => [type,r.category,r.status]));
const commentKey = c => JSON.stringify([c.type,c.at,c.by,c.text]);
let lastSubmittedSignature, lastSubmittedComments;

async function api(path, options) {
  const response = await fetch(path, { cache:'no-store', credentials:'same-origin', ...options });
  if (response.status === 401) { describe('Your password session expired. Sign in again to continue.',true); location.assign('/'); throw new Error('Sign-in required'); }
  const body = await response.json();
  if (!response.ok) { const e = new Error(body.error || 'The change could not be saved.'); e.status = response.status; throw e; }
  return body;
}
function snapshot() { return { modelContent:remote.modelContent, privateContent:{...remote.privateContent,...preferences} }; }
function deliver() {
  window.openai.widgetState = snapshot();
  window.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:window.openai.widgetState}}}));
}
function resetSubmitted() {
  lastSubmittedSignature = signature(remote.modelContent.records);
  lastSubmittedComments = JSON.stringify((remote.privateContent.comments||[]).map(commentKey));
}
async function reload() {
  if (pending) { describe('Wait for the current save to finish before reloading.'); return; }
  remote = await api('/api/state'); blocked=false;resetSubmitted();deliver();describe('Shared decisions are up to date.');
}
reloadButton.addEventListener('click',()=>reload().catch(e=>describe(e.message,true)));

async function initialize() {
  const [sample,state] = await Promise.all([api('/api/types'),api('/api/state')]);
  remote=state;resetSubmitted();
  document.getElementById('type-data').textContent=JSON.stringify(sample);
  window.wbDocuments=type=>api('/api/documents?type='+encodeURIComponent(type));
  window.openai = {
    widgetState:snapshot(),
    setWidgetState(next) {
      preferences={person:next.privateContent.person,selected:next.privateContent.selected};
      try {localStorage.setItem('wb-review-ui',JSON.stringify(preferences));}catch{}
      const proposed=structuredClone(next),sig=signature(proposed.modelContent.records),cm=JSON.stringify((proposed.privateContent.comments||[]).map(commentKey));
      if(sig===lastSubmittedSignature&&cm===lastSubmittedComments)return Promise.resolve();
      if(blocked){deliver();describe('Your edit was not saved. Reload shared decisions, then retry it.',true);return Promise.resolve();}
      lastSubmittedSignature=sig;lastSubmittedComments=cm;pending++;const job=++lastJob;describe('Saving shared decision…');
      queue=queue.then(async()=>{
        if(blocked){pending--;return;}
        try {
          remote=await api('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:remote.revision,actor:proposed.privateContent.person,records:proposed.modelContent.records,comments:proposed.privateContent.comments||[]})});
          if(job===lastJob){resetSubmitted();deliver();describe('Saved · visible to both reviewers.');}
        }catch(e){
          blocked=true;
          if(e.status===409){try{remote=await api('/api/state');deliver();}catch{}}
          else deliver();
          describe(e.status===409?'Another reviewer saved a newer version. Your edit was not applied. Review their changes, click Reload shared decisions, then retry.':'Your edit was not saved. '+e.message+' Click Reload shared decisions before trying again.',true);
        }finally{pending--;}
      }).catch(e=>{blocked=true;pending=0;describe('Could not save: '+e.message,true);});
      return queue;
    }
  };
  await import('/prototype.mjs');
  describe('Connected · decisions and comments are shared.');
  setInterval(async()=>{
    if(pending||blocked||document.visibilityState==='hidden')return;
    try{const latest=await api('/api/state');if(pending||blocked)return;if(latest.revision!==remote.revision){remote=latest;resetSubmitted();deliver();describe('Updated with the latest shared decisions.');}}
    catch{describe('Connection interrupted. Existing decisions remain on screen; reconnect before saving.',true);}
  },8000);
}
initialize().catch(e=>describe('Could not load the workspace: '+e.message,true));
window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue='';}});
