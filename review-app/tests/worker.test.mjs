import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.mjs';

const origin='https://review.example.test';
const sample=[{name:'Report',category:'Production/Dissemination',review:true,corpusCount:865,docs:[{id:'test-only',title:'Private sample title',text:'private opening'}]},{name:'Project Appraisal Document',category:'Operationalization/Implementation',review:false,corpusCount:1050,docs:[]}];
function database(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 function prepared(sql,args=[]){
  const execute=()=>{const s=db.prepare(sql);if(s.columns().length)return {results:s.all(...args)};const r=s.run(...args);return {results:[],meta:{changes:Number(r.changes)}};};
  return {bind(...next){return prepared(sql,next);},async run(){return execute();},async all(){return execute();},async first(){return execute().results[0]||null;},execute};
 }
 return {prepare:prepared,async batch(statements){db.exec('BEGIN');try{const out=statements.map(s=>s.execute());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}},close(){db.close();}};
}
function setup(catalog=sample){
 const DB=database();let assetReads=0;
 const env={DB,REVIEW_PASSWORD:'test-password-not-for-production',SESSION_SECRET:'test-session-secret-not-for-production-123456789',ASSETS:{async fetch(request){assetReads++;const p=new URL(typeof request==='string'?request:request.url).pathname;return p==='/types.json'?Response.json(catalog):p.startsWith('/documents/')?Response.json([{id:'fixture',title:'A protected title',text:'Opening text'}]):new Response('private application content',{headers:{'Content-Type':'text/html'}});}}};
 const send=(path,options={})=>worker.fetch(new Request(origin+path,options),env);
 const login=async()=>{const r=await send('/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:env.REVIEW_PASSWORD}).toString()});assert.equal(r.status,303);return r.headers.get('Set-Cookie').split(';')[0];};
 const get=async(cookie,path='/api/state')=>{const r=await send(path,{headers:{Cookie:cookie}});assert.equal(r.status,200);return r.json();};
 const save=async(cookie,state,actor='Ali',comments=state.privateContent.comments)=>send('/api/state',{method:'PUT',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({revision:state.revision,actor,records:state.modelContent.records,comments})});
 return {env,send,login,get,save,get assetReads(){return assetReads;}};
}

test('unauthenticated requests cannot read page data, APIs or exports; indexing is disabled',async t=>{
 const s=setup();t.after(()=>s.env.DB.close());
 for(const path of ['/api/sample','/api/types','/api/documents?type=Report','/api/state','/api/export']){const r=await s.send(path);assert.equal(r.status,401);assert.equal(r.headers.get('X-Robots-Tag'),'noindex, nofollow, noarchive');assert(!JSON.stringify(await r.json()).includes('Private sample title'));}
 for(const path of ['/','/sample.json','/client.mjs']){const r=await s.send(path);assert.equal(r.status,200);assert((await r.text()).includes('Shared password'));assert.match(r.headers.get('Cache-Control'),/no-store/);}
 assert.equal(s.assetReads,0);assert.match(await (await s.send('/robots.txt')).text(),/Disallow: \//);
});
test('password sessions work, use secure cookies, reject tampering, and support sign-out',async t=>{
 const s=setup();t.after(()=>s.env.DB.close());
 const page=await s.send('/login');assert.equal(page.headers.get('Referrer-Policy'),'same-origin');
 for(const invalidOrigin of ['null','https://other.example','']){
  const blocked=await s.send('/login',{method:'POST',headers:{Origin:invalidOrigin},body:'password=incorrect'});assert.equal(blocked.status,403);
 }
 const bad=await s.send('/login',{method:'POST',headers:{Origin:origin},body:'password=incorrect'});assert.equal(bad.status,401);
 const cookie=await s.login();const initial=await s.get(cookie);assert.equal(initial.revision,0);
 const content=await s.send('/',{headers:{Cookie:cookie}});assert.equal(await content.text(),'private application content');
 const corrupt=cookie.replace(/=./,'=X');const denied=await s.send('/api/state',{headers:{Cookie:corrupt}});assert.equal(denied.status,401);
 const logout=await s.send('/logout',{method:'POST',headers:{Cookie:cookie,Origin:origin}});assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);assert.equal(logout.status,303);
});
test('shared type decisions record the selected reviewer and block stale overwrites',async t=>{
 const s=setup();t.after(()=>s.env.DB.close());const cookie=await s.login(),initial=await s.get(cookie),stale=structuredClone(initial);
 initial.modelContent.records.Report.status='reviewed';initial.modelContent.records.Report.reviewedBy='spoofed';
 const saved=await s.save(cookie,initial,'Caroline');assert.equal(saved.status,200);const state=await saved.json();
 assert.equal(state.modelContent.records.Report.reviewedBy,'Caroline');assert(state.modelContent.records.Report.reviewedAt);assert.equal(state.modelContent.events[0].by,'Caroline');
 stale.modelContent.records.Report.category='Operationalization/Implementation';const conflict=await s.save(cookie,stale);assert.equal(conflict.status,409);
 assert.equal((await s.get(cookie)).modelContent.records.Report.category,'Production/Dissemination');
 state.modelContent.records.Report.category='Operationalization/Implementation';const reopened=await (await s.save(cookie,state)).json();assert.equal(reopened.modelContent.records.Report.status,'pending');
});
test('cross-origin writes and unknown categories are rejected without changing data',async t=>{
 const s=setup();t.after(()=>s.env.DB.close());const cookie=await s.login(),state=await s.get(cookie);
 const rejected=await s.send('/api/state',{method:'PUT',headers:{Cookie:cookie,Origin:'https://other.example'},body:'{}'});assert.equal(rejected.status,403);
 state.modelContent.records.Report.category='invalid';assert.equal((await s.save(cookie,state)).status,400);assert.equal((await s.get(cookie)).revision,0);
});
test('comments persist once with server attribution and full history survives display limits',async t=>{
 const s=setup();t.after(()=>s.env.DB.close());const cookie=await s.login();let state=await s.get(cookie);
 const comment={type:'Report',by:'Ali',at:'2026-11-10T12:00:00.000Z',text:'Please inspect the mixed contents.'};
 state=await (await s.save(cookie,state,'Caroline',[comment])).json();assert.equal(state.privateContent.comments.length,1);assert.equal(state.privateContent.comments[0].by,'Caroline');
 state=await (await s.save(cookie,state,'Ali')).json();assert.equal(state.privateContent.comments.length,1);
 for(let i=0;i<16;i++){state.modelContent.records.Report.status=i%2?'pending':'reviewed';state=await (await s.save(cookie,state)).json();}
 assert.equal(state.modelContent.events.length,14);const exported=await s.get(cookie,'/api/export');assert.equal(exported.modelContent.events.length,16);assert.equal(exported.privateContent.comments.length,1);
});
test('repeated password guesses are rate limited and missing configuration fails closed',async t=>{
 const s=setup();t.after(()=>s.env.DB.close());let r;
 for(let i=0;i<11;i++)r=await s.send('/login',{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1'},body:'password=wrong'});
 assert.equal(r.status,429);delete s.env.SESSION_SECRET;assert.equal((await s.send('/')).status,503);
});

test('expanding the corpus preserves existing decisions, attribution, comments and history',async t=>{
 const catalog=structuredClone(sample),s=setup(catalog);t.after(()=>s.env.DB.close());
 const cookie=await s.login();let state=await s.get(cookie);
 state.modelContent.records.Report.status='reviewed';
 state=await (await s.save(cookie,state,'Caroline',[{type:'Report',by:'Caroline',at:'2026-11-10T12:00:00.000Z',text:'A saved prototype note.'}])).json();
 const before=structuredClone(state);
 for(let i=0;i<115;i++)catalog.push({name:'Additional type '+i,category:'Production/Dissemination',review:false,corpusCount:1,asset:'type-'+String(i).padStart(3,'0')});
 catalog.push({name:'Type not recorded',originalType:'',category:null,review:true,corpusCount:184,asset:'type-117'});
 state=await s.get(cookie);
 assert.equal(Object.keys(state.modelContent.records).length,118);
 assert.deepEqual(state.modelContent.records.Report,before.modelContent.records.Report);
 assert.deepEqual(state.modelContent.events,before.modelContent.events);
 assert.deepEqual(state.privateContent.comments,before.privateContent.comments);
 assert.equal(state.revision,before.revision+1);
 assert.equal((await s.get(cookie)).revision,state.revision);
 assert.equal(state.modelContent.records['Type not recorded'].category,null);
 state.modelContent.records['Additional type 0'].status='reviewed';
 const largeSave=await s.save(cookie,state);assert.equal(largeSave.status,200);
 state=await largeSave.json();state.modelContent.records['Type not recorded'].status='reviewed';
 assert.equal((await s.save(cookie,state)).status,400);
 const outdated=await s.save(cookie,before);assert.equal(outdated.status,409);
 const docs=await s.send('/api/documents?type='+encodeURIComponent('Additional type 0'),{headers:{Cookie:cookie}});assert.equal(docs.status,200);assert.equal((await docs.json())[0].title,'A protected title');
 assert.equal((await s.send('/api/documents?type=../../sample.json',{headers:{Cookie:cookie}})).status,404);
});

function post(s,cookie,path,body){return s.send(path,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});}
async function replay(s,cookie,state,direction,actor='Ali'){const r=await post(s,cookie,'/api/history',{revision:state.revision,direction,actor});assert.equal(r.status,200,JSON.stringify(await r.clone().json()));return r.json();}
test('individual exceptions persist separately, validate membership, and support undo/redo',async t=>{
 const catalog=structuredClone(sample);catalog[0].ids=',111,112,';catalog[1].ids=',222,';
 const s=setup(catalog);t.after(()=>s.env.DB.close());const cookie=await s.login();let state=await s.get(cookie);
 const assign=(id,type,category,revision=state.revision)=>post(s,cookie,'/api/document',{id,type,category,revision,actor:'Ali'});
 assert.equal((await assign('111','Project Appraisal Document','Operationalization/Implementation')).status,400);
 state=await (await assign('111','Report','Operationalization/Implementation')).json();
 assert.equal(state.modelContent.exceptions['111'].category,'Operationalization/Implementation');
 assert.equal(state.modelContent.records.Report.category,'Production/Dissemination');
 assert.equal(state.modelContent.exceptions['112'],undefined);
 state=await replay(s,cookie,state,'undo');assert.equal(state.modelContent.exceptions['111'],undefined);
 state=await replay(s,cookie,state,'redo');assert.equal(state.modelContent.exceptions['111'].by,'Ali');
 state=await (await assign('111','Report',null)).json();assert.equal(state.modelContent.exceptions['111'],undefined);
 state=await replay(s,cookie,state,'undo');assert(state.modelContent.exceptions['111']);
 state.modelContent.records.Report.category='Operationalization/Implementation';state=await (await s.save(cookie,state)).json();
 assert.equal(state.modelContent.exceptions['111'].category,'Operationalization/Implementation');
 assert.equal(state.history.Ali.redo,null);
 assert.equal((await assign('112','Report','Production/Dissemination',0)).status,409);
 assert.equal((await s.get(cookie)).modelContent.exceptions['111'].category,'Operationalization/Implementation');
 const poll=await s.get(cookie,'/api/state?revision='+state.revision);assert.equal(poll.unchanged,true);assert.equal(poll.modelContent,undefined);
});
test('undo restores a completed review and blocks overwriting another reviewer',async t=>{
 const s=setup();t.after(()=>s.env.DB.close());const cookie=await s.login();let state=await s.get(cookie);
 state.modelContent.records.Report.status='reviewed';state=await (await s.save(cookie,state,'Caroline')).json();const reviewed=structuredClone(state.modelContent.records.Report);
 state.modelContent.records.Report.category='Operationalization/Implementation';state=await (await s.save(cookie,state,'Caroline')).json();assert.equal(state.modelContent.records.Report.status,'pending');
 state=await replay(s,cookie,state,'undo','Caroline');assert.deepEqual(state.modelContent.records.Report,reviewed);
 state=await replay(s,cookie,state,'redo','Caroline');assert.equal(state.modelContent.records.Report.status,'pending');
 state.modelContent.records.Report.status='reviewed';state=await (await s.save(cookie,state,'Ali')).json();
 const denied=await post(s,cookie,'/api/history',{revision:state.revision,actor:'Caroline',direction:'undo'});assert.equal(denied.status,409);
 assert.equal((await s.get(cookie)).modelContent.records.Report.by,'Ali');
});
test('earlier readable history becomes undoable and comment undo is recoverable',async t=>{
 const s=setup();t.after(()=>s.env.DB.close());const cookie=await s.login();let state=await s.get(cookie);
 state.modelContent.records.Report.category='Operationalization/Implementation';state=await (await s.save(cookie,state)).json();
 await s.env.DB.prepare('DELETE FROM review_changes').run();s.env.DB={...s.env.DB};
 state=await s.get(cookie);assert(state.history.Ali.undo);
 state=await replay(s,cookie,state,'undo');assert.equal(state.modelContent.records.Report.category,'Production/Dissemination');
 state=await (await s.save(cookie,state,'Ali',[{type:'Report',by:'Ali',at:'2026-11-10T12:00:00.000Z',text:'A reversible comment'}])).json();
 assert.equal(state.privateContent.comments.length,1);
 state=await replay(s,cookie,state,'undo');assert.equal(state.privateContent.comments.length,0);
 state=await replay(s,cookie,state,'redo');assert.equal(state.privateContent.comments[0].text,'A reversible comment');
 const exported=await s.get(cookie,'/api/export');assert(exported.changeHistory.some(c=>c.target_kind==='comment'));
});

test('verified evidence supplies excluded titles and report links without changing review state',async t=>{
 const s=setup();t.after(()=>s.env.DB.close());const cookie=await s.login(),before=await s.get(cookie);
 const data=[{id:'111',included:1,type:'Report',title:'Retained reading',year:'2000',reason:'',details:{opening:'A longer original reading.',url:'https://documents.worldbank.org/curated/en/123456789012345678',pdf:'https://documents.worldbank.org/curated/en/123456789012345678/pdf/report.pdf',text:'https://documents.worldbank.org/curated/en/123456789012345678/text/report.txt'}},{id:'222',included:0,type:'Brief',title:'Excluded report title',year:'2001',reason:'No violence term',details:{opening:'',url:'https://documents.worldbank.org/curated/en/234567890123456789',pdf:'',text:''}}];
 const raw=JSON.stringify(data),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
 const assets=s.env.ASSETS.fetch;s.env.ASSETS.fetch=async req=>new URL(req.url).pathname==='/evidence-manifest.json'?Response.json({chunks:[digest]}):assets(req);
 const upload=()=>s.send('/api/evidence-import',{method:'POST',headers:{Cookie:cookie,Origin:origin},body:raw});
 assert.equal((await upload()).status,200);assert.equal((await upload()).status,200);
 const count=await s.get(cookie,'/api/evidence-status');assert.deepEqual(count,{total:2,included:1,excluded:1});
 const list=await s.get(cookie,'/api/excluded?q=Excluded');assert.equal(list.total,1);assert.equal(list.rows[0].title,'Excluded report title');assert.equal(list.rows[0].type,'Brief');
 assert.equal((await s.get(cookie,'/api/excluded?q=NotPresent')).total,0);
 const reading=await s.get(cookie,'/api/reading?id=111');assert.equal(reading.opening,'A longer original reading.');assert.match(reading.pdf,/worldbank/);
 const bad=await post(s,cookie,'/api/evidence-import',[{...data[0],title:'Changed'}]);assert.equal(bad.status,400);
 const after=await s.get(cookie);assert.equal(after.revision,before.revision);assert.deepEqual(after.modelContent.records,before.modelContent.records);
 for(const path of ['/api/excluded','/api/reading?id=111','/api/full-text?id=111'])assert.equal((await s.send(path)).status,401);
 const realFetch=globalThis.fetch;globalThis.fetch=async url=>new Response('The complete source report.',{headers:{'Content-Type':'text/plain'}});t.after(()=>{globalThis.fetch=realFetch;});
 const text=await s.send('/api/full-text?id=111',{headers:{Cookie:cookie}});assert.equal(text.status,200);assert.equal(await text.text(),'The complete source report.');
});

test('earlier untyped labels remain separate from type defaults and newer exceptions',async t=>{
 const PD='Production/Dissemination',OI='Operationalization/Implementation';
 const catalog=[...structuredClone(sample),{name:'Type not recorded',originalType:'',category:null,review:true,corpusCount:2,ids:',111,112,'}];
 const s=setup(catalog);t.after(()=>s.env.DB.close());const old=s.env.ASSETS.fetch;
 const earlier={'111':{type:'Type not recorded',category:PD,earlier:'Script'},'112':{type:'Type not recorded',category:OI,earlier:'Practice'}};
 s.env.ASSETS.fetch=async req=>new URL(req.url).pathname==='/earlier-labels.json'?Response.json(earlier):old(req);
 const cookie=await s.login();let state=await s.get(cookie);assert.equal(state.modelContent.records['Type not recorded'].category,null);assert.deepEqual(state.modelContent.earlierLabels,earlier);assert.equal(state.revision,0);
 state.modelContent.records['Type not recorded'].status='reviewed';state=await(await s.save(cookie,state)).json();assert.equal(state.modelContent.records['Type not recorded'].category,null);assert.equal(state.modelContent.records['Type not recorded'].status,'reviewed');
 const response=await post(s,cookie,'/api/document',{revision:state.revision,id:'111',type:'Type not recorded',category:OI,actor:'Caroline'});assert.equal(response.status,200);state=await response.json();assert.equal(state.modelContent.exceptions['111'].category,OI);assert.equal(state.modelContent.earlierLabels['111'].category,PD);
 state=await replay(s,cookie,state,'undo','Caroline');assert.equal(state.modelContent.exceptions['111'],undefined);assert.equal(state.modelContent.earlierLabels['111'].category,PD);
});
