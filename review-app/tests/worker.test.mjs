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
