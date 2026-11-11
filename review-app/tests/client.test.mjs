import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('a conflicting save cancels queued edits and still allows a manual reload',async()=>{
 const nodes=Object.fromEntries(['connection-status','reload-shared','type-data'].map(id=>[id,{textContent:'',listeners:{},setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;}}]));
 const state={revision:0,modelContent:{schema:'types-v2',records:{Report:{category:'Production/Dissemination',status:'pending'}},events:[]},privateContent:{comments:[]}};
 let puts=0,gets=0;
 const window={addEventListener(){},dispatchEvent(){}};
 const context={window,document:{getElementById:id=>nodes[id],visibilityState:'visible'},localStorage:{getItem(){return null;},setItem(){}},structuredClone,CustomEvent:class {constructor(type,options){this.type=type;Object.assign(this,options);}},setInterval(){},location:{assign(){}},fetch:async(path,options)=>{
  if(path==='/api/types')return Response.json([]);
  if(options?.method==='PUT'){puts++;return Response.json({error:'A newer save arrived.'},{status:409});}
  gets++;return Response.json(state);
 }};
 const code=readFileSync(new URL('../src/client.mjs',import.meta.url),'utf8').replace("await import('/prototype.mjs');",'');
 new vm.Script(code).runInNewContext(context);
 for(let i=0;i<8&&!window.openai;i++)await new Promise(setImmediate);
 assert(window.openai);
 const first=structuredClone(window.openai.widgetState);first.privateContent.person='Ali';first.privateContent.selected='Report';first.modelContent.records.Report.status='reviewed';
 const second=structuredClone(first);second.modelContent.records.Report.category='Operationalization/Implementation';
 const p=window.openai.setWidgetState(first),q=window.openai.setWidgetState(second);await Promise.all([p,q]);
 assert.equal(puts,1);assert.match(nodes['connection-status'].textContent,/not applied/);
 const before=gets;nodes['reload-shared'].listeners.click();for(let i=0;i<8&&!nodes['connection-status'].textContent.includes('up to date');i++)await new Promise(setImmediate);
 assert(gets>before);assert.match(nodes['connection-status'].textContent,/up to date/);
});
