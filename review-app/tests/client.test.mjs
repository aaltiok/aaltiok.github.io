import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('a conflicting save cancels queued edits and still allows a manual reload',async()=>{
 const nodes=Object.fromEntries(['connection-status','reload-shared','type-data','undo-change','redo-change','practice-mode','save-mode'].map(id=>[id,{textContent:'',listeners:{},setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;}}]));
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

test('practice mode keeps type changes and document exceptions local, with undo and redo',async()=>{
 const ids=['connection-status','reload-shared','type-data','undo-change','redo-change','practice-mode','save-mode'];
 const nodes=Object.fromEntries(ids.map(id=>[id,{textContent:'',listeners:{},setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;}}]));
 const saved={revision:7,history:{Ali:{undo:null,redo:null}},modelContent:{schema:'types-v2',records:{Report:{category:'Production/Dissemination',status:'pending'}},exceptions:{},events:[]},privateContent:{comments:[]}};
 let writes=0;const window={addEventListener(){},dispatchEvent(){}};
 const context={window,document:{getElementById:id=>nodes[id],visibilityState:'visible'},localStorage:{getItem(){return null;},setItem(){}},structuredClone,CustomEvent:class{constructor(type,o){this.type=type;Object.assign(this,o);}},setInterval(){},location:{assign(){}},fetch:async(path,options)=>{if(options?.method){writes++;throw Error('Practice must not write');}return Response.json(path==='/api/types'?[]:saved);}};
 const code=readFileSync(new URL('../src/client.mjs',import.meta.url),'utf8').replace("await import('/prototype.mjs');",'');new vm.Script(code).runInNewContext(context);
 for(let i=0;i<8&&!window.openai;i++)await new Promise(setImmediate);
 await nodes['practice-mode'].listeners.click();
 const next=structuredClone(window.openai.widgetState);next.privateContent.person='Ali';next.privateContent.selected='Report';next.modelContent.records.Report.category='Operationalization/Implementation';
 await window.openai.setWidgetState(next);await window.wbSetException({id:'111',type:'Report',category:'Production/Dissemination',actor:'Ali'});
 assert(window.openai.widgetState.modelContent.exceptions['111']);
 nodes['undo-change'].listeners.click();assert.equal(window.openai.widgetState.modelContent.exceptions['111'],undefined);
 nodes['undo-change'].listeners.click();assert.equal(window.openai.widgetState.modelContent.records.Report.category,'Production/Dissemination');
 nodes['redo-change'].listeners.click();nodes['redo-change'].listeners.click();assert(window.openai.widgetState.modelContent.exceptions['111']);
 await nodes['practice-mode'].listeners.click();assert.equal(writes,0);assert.equal(window.openai.widgetState.modelContent.records.Report.category,'Production/Dissemination');assert.equal(window.openai.widgetState.modelContent.exceptions['111'],undefined);assert.equal(nodes['save-mode'].textContent,'Autosave on');
});
