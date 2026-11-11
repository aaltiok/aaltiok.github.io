import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkbook,documentAssignment} from '../src/export.mjs';
import '../vendor/exceljs.min.js';
const PD='Production/Dissemination',OI='Operationalization/Implementation';
test('Excel export resolves current overrides and earlier labels, with plain document IDs',async()=>{
 const state={modelContent:{records:{Report:{category:PD,status:'pending'},'Type not recorded':{category:null,status:'pending'}},earlierLabels:{'0002':{category:PD,type:'Type not recorded'},'0003':{category:OI,type:'Type not recorded'}},exceptions:{'0002':{category:OI,type:'Type not recorded'}},events:[{at:'2026-11-11T12:00:00.000Z',by:'Ali',type:'Report',action:'A change'}]},privateContent:{comments:[]}};
 const docs=[{id:'0001',title:'An ordinary report',year:'2020',type:'Report'},{id:'0002',title:'An overridden earlier label',year:'2021',type:'Type not recorded'},{id:'0003',title:'An earlier practice label',year:'2022',type:'Type not recorded'}];
 assert.deepEqual(documentAssignment(state,docs[1]),{category:'OI',source:'Individual exception'});
 const types=[{name:'Report',corpusCount:1},{name:'Type not recorded',corpusCount:2}];
 const workbook=buildWorkbook(globalThis.ExcelJS,{documents:docs,types,state});
 const buffer=await workbook.xlsx.writeBuffer();const read=new globalThis.ExcelJS.Workbook();await read.xlsx.load(buffer);
 assert.deepEqual(read.worksheets.map(s=>s.name),['Documents','Type decisions','Change history']);
 const data=read.getWorksheet('Documents');assert.equal(data.rowCount,4);assert.equal(data.getCell('A2').value,'0001');assert.equal(data.getCell('C2').value,2020);assert.equal(data.getCell('E2').value,'PD');assert.equal(data.getCell('E3').value,'OI');assert.equal(data.getCell('E4').value,'OI');assert.equal(data.getCell('F3').value,'Individual exception');assert.equal(data.getCell('F4').value,'Earlier saved coding');assert.equal(data.getCell('D3').value,'');
 assert.equal(read.getWorksheet('Type decisions').getCell('C3').value,'Unassigned');
 assert.throws(()=>buildWorkbook(globalThis.ExcelJS,{documents:[docs[0],docs[0]],types,state}),/Duplicate/);
});
