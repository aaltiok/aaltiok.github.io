import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {classifyType} from '../src/classification-rules.mjs';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const corpus=resolve(project,'.deploy/corpus');
const catalog=JSON.parse(await readFile(resolve(corpus,'catalog.json'),'utf8'));
const manifest=JSON.parse(await readFile(resolve(corpus,'manifest.json'),'utf8'));
if(catalog.length!==118||manifest.documents!==13271)throw new Error('Prepare the retained full corpus first.');
const types=catalog.map(t=>({...t,...classifyType(t.originalType,t.family)})).sort((a,b)=>a.order-b.order||b.corpusCount-a.corpusCount||a.name.localeCompare(b.name));
const ui=await readFile(resolve(project,'src/review.html'),'utf8');
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Private World Bank type review</title><style>body{font:14px/1.5 system-ui;margin:0 auto;padding:20px;max-width:1200px;color-scheme:light dark;background:light-dark(#f7f8f4,#181d19);color:light-dark(#26362e,#e6ede7)}.shared-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;font-size:12px}.shared-bar button,.shared-bar a{font:inherit;padding:6px 9px;color:inherit}.shared-bar form{margin:0}#connection-status{flex:1 1 240px}</style></head><body><div class="shared-bar"><span id="connection-status" role="status">Connecting to shared reviews…</span><span id="save-mode">Autosave on</span><button id="undo-change" disabled>Undo</button><button id="redo-change" disabled>Redo</button><button id="practice-mode" aria-pressed="false">Practice mode</button><button id="excluded-open">Excluded documents (28,015)</button><button id="reload-shared" title="Loads the latest saved coding. Keeps your decisions.">Refresh saved decisions</button><button id="export-excel" disabled>Export Excel</button><a href="/api/export">Export backup</a><form method="post" action="/logout"><button>Sign out</button></form></div>${ui}<script type="module" src="/client.mjs"></script></body></html>`;
const output=resolve(project,'.deploy/assets');await mkdir(resolve(output,'documents'),{recursive:true});
await Promise.all([writeFile(resolve(output,'index.html'),html),copyFile(resolve(project,'src/review.mjs'),resolve(output,'prototype.mjs')),writeFile(resolve(output,'types.json'),JSON.stringify(types)),copyFile(resolve(project,'src/client.mjs'),resolve(output,'client.mjs'))]);
const assets={};
assets['/earlier-labels.json']={body:await readFile(resolve(project,'.deploy/earlier-labels.json'),'utf8'),type:'application/json; charset=utf-8'};
for(const [path,file,type] of [['/export.mjs','src/export.mjs','application/javascript; charset=utf-8'],['/exceljs.min.js','vendor/exceljs.min.js','application/javascript; charset=utf-8'],['/exceljs.LICENSE','vendor/exceljs.LICENSE','text/plain; charset=utf-8']])assets[path]={body:await readFile(resolve(project,file),'utf8'),type};
assets['/evidence-manifest.json']={body:await readFile(resolve(project,'.deploy/evidence/manifest.json'),'utf8'),type:'application/json; charset=utf-8'};
assets['/maintenance.html']={body:await readFile(resolve(project,'src/maintenance.html'),'utf8'),type:'text/html; charset=utf-8'};
for(const [name,type] of [['index.html','text/html; charset=utf-8'],['client.mjs','application/javascript; charset=utf-8'],['prototype.mjs','application/javascript; charset=utf-8'],['types.json','application/json; charset=utf-8']])assets['/'+name]={body:await readFile(resolve(output,name),'utf8'),type};
const ids=new Set();let count=0;
for(const t of types){
 const name=t.asset+'.json.gz',data=await readFile(resolve(corpus,name)),docs=JSON.parse(gunzipSync(data));
 if(docs.length!==t.corpusCount)throw new Error('Type count mismatch');
 for(const d of docs){if(ids.has(d.id)||!d.title||!d.text||d.text.split(/\s+/).length>100)throw new Error('Invalid corpus document');ids.add(d.id);count++;}
 t.ids=','+docs.map(d=>d.id).join(',')+',';
 await copyFile(resolve(corpus,name),resolve(output,'documents',name));
 assets['/documents/'+name]={body:data.toString('base64'),type:'application/json; charset=utf-8',encoding:'gzip-base64'};
}
if(count!==13271)throw new Error('Corpus is incomplete');
await writeFile(resolve(output,'types.json'),JSON.stringify(types));
assets['/types.json'].body=JSON.stringify(types);
const dashboard=resolve(project,'.deploy/dashboard');await mkdir(dashboard,{recursive:true});
const worker=(await readFile(resolve(project,'src/worker.mjs'),'utf8')).replace('async fetch(request, env) {',`async fetch(request, env) {
    env = {...env, ASSETS: {async fetch(req) {
      const path=new URL(typeof req==='string'?req:req.url).pathname,a=assetMap[path];
      if(!a)return new Response('Not found',{status:404});
      const headers={'Content-Type':a.type};
      if(a.encoding==='gzip-base64'){
        headers['Content-Encoding']='gzip';
        return new Response(Uint8Array.from(atob(a.body),c=>c.charCodeAt(0)),{headers});
      }
      return new Response(a.body,{headers});
    }}};`);
const workerModule="import assetMap from './asset-map.js';\n"+worker;
const assetModule='export default '+JSON.stringify(assets)+';\n';
const compressedBytes=gzipSync(workerModule+assetModule).length;
if(compressedBytes>2_950_000)throw new Error('Build is too close to the Workers Free upload limit');
await writeFile(resolve(dashboard,'worker.js'),workerModule);
await writeFile(resolve(dashboard,'asset-map.js'),assetModule);
await writeFile(resolve(project,'.deploy/build-report.json'),JSON.stringify({...manifest,typeGroups:types.length,initialPD:types.filter(t=>t.category==='Production/Dissemination').length,initialOI:types.filter(t=>t.category==='Operationalization/Implementation').length,initialPending:types.filter(t=>t.review).length,compressedWorkerBytes:compressedBytes},null,2)+'\n');
console.log(`Prepared ${count} documents in ${types.length} groups; ${compressedBytes.toLocaleString()} compressed Worker bytes. Generated corpus assets remain ignored by Git.`);
