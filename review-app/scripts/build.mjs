import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=process.argv[2];
if(!source)throw new Error('Pass the absolute path to the approved genre-type-review-preview.html prototype.');
const fragment=await readFile(resolve(source),'utf8');
if(/<!doctype|<html\b/i.test(fragment.slice(0,500)))throw new Error('Use the editable prototype fragment, not an iframe export.');
const data=fragment.match(/<script type="application\/json" id="type-data">([\s\S]*?)<\/script>/);
const code=fragment.match(/<script>([\s\S]*?)<\/script>/);
if(!data||!code)throw new Error('The type-review prototype structure was not recognized.');
const sample=JSON.parse(data[1]);
if(sample.length!==7||sample.reduce((n,t)=>n+t.docs.length,0)!==45)throw new Error('Expected the approved 7-type, 45-document sample.');
let ui=fragment.replace(data[0],'<script type="application/json" id="type-data">[]</script>').replace(code[0],'');
ui=ui.replace(/<footer class="t-footer">[\s\S]*?<\/footer>/,'<footer class="t-footer">Private sample · one shared classification per type · name selector attributes edits; it does not verify identity · research corpus unchanged</footer>');
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Private World Bank type review</title><style>body{font:14px/1.5 system-ui;margin:0 auto;padding:20px;max-width:1200px;color-scheme:light dark;background:light-dark(#f7f8f4,#181d19);color:light-dark(#26362e,#e6ede7)}.shared-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;font-size:12px}.shared-bar button,.shared-bar a{font:inherit;padding:6px 9px;color:inherit}.shared-bar form{margin:0}#connection-status{flex:1 1 240px}</style></head><body><div class="shared-bar"><span id="connection-status" role="status">Connecting to shared reviews…</span><button id="reload-shared">Reload shared decisions</button><a href="/api/export">Export backup</a><form method="post" action="/logout"><button>Sign out</button></form></div>${ui}<script type="module" src="/client.mjs"></script></body></html>`;
const output=resolve(project,'.deploy/assets');await mkdir(output,{recursive:true});
await Promise.all([writeFile(resolve(output,'index.html'),html),writeFile(resolve(output,'prototype.mjs'),code[1]),writeFile(resolve(output,'sample.json'),JSON.stringify(sample)),copyFile(resolve(project,'src/client.mjs'),resolve(output,'client.mjs'))]);
// The dashboard editor accepts ES modules, so package the same protected assets
// as a private Worker module for deployment without granting CLI account access.
const dashboard=resolve(project,'.deploy/dashboard');await mkdir(dashboard,{recursive:true});
const assets={};
for(const [name,type] of [['index.html','text/html; charset=utf-8'],['client.mjs','application/javascript; charset=utf-8'],['prototype.mjs','application/javascript; charset=utf-8'],['sample.json','application/json; charset=utf-8']])assets['/'+name]={body:await readFile(resolve(output,name),'utf8'),type};
const worker=(await readFile(resolve(project,'src/worker.mjs'),'utf8')).replace('async fetch(request, env) {','async fetch(request, env) {\n    env = {...env, ASSETS: {async fetch(req) {const path=new URL(typeof req===\'string\'?req:req.url).pathname; const a=assetMap[path]; return a?new Response(a.body,{headers:{\'Content-Type\':a.type}}):new Response(\'Not found\',{status:404});}}};');
await writeFile(resolve(dashboard,'worker.js'),"import assetMap from './asset-map.js';\n"+worker);
await writeFile(resolve(dashboard,'asset-map.js'),'export default '+JSON.stringify(assets)+';\n');
console.log('Prepared protected sample: 7 types and 45 documents. Generated document data stays in the ignored .deploy directory.');
