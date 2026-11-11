const PD='Production/Dissemination',OI='Operationalization/Implementation';
const code=value=>value===PD?'PD':value===OI?'OI':'Unassigned';
export function documentAssignment(state,doc){
 const m=state.modelContent,exception=m.exceptions?.[doc.id],earlier=m.earlierLabels?.[doc.id];
 return {category:code(exception?.category||earlier?.category||m.records[doc.type]?.category),source:exception?'Individual exception':earlier?'Earlier saved coding':'Type default'};
}
export function buildWorkbook(ExcelJS,{documents,types,state,exportedAt=new Date()}){
 const workbook=new ExcelJS.Workbook();workbook.creator='World Bank document review';workbook.created=exportedAt;
 workbook.subject='Current saved PD/OI coding';workbook.description='One row per retained document. Individual exceptions take priority over earlier saved labels and type defaults.';
 const sheet=workbook.addWorksheet('Documents');
 sheet.columns=[{header:'Document ID',key:'id',width:15},{header:'Title',key:'title',width:90},{header:'Year',key:'year',width:10},{header:'Document type',key:'type',width:54},{header:'PD/OI',key:'category',width:16},{header:'Assignment source',key:'source',width:25}];
 const seen=new Set();
 for(const doc of documents){if(seen.has(doc.id)||!doc.id)throw new Error('Duplicate or missing document ID in export');seen.add(doc.id);const assignment=documentAssignment(state,doc);const row=sheet.addRow({id:String(doc.id),title:doc.title,year:Number(doc.year)||null,type:doc.type==='Type not recorded'?'':doc.type,...assignment});row.height=Math.max(20,Math.min(75,Math.ceil(doc.title.length/85)*16));}
 const typeSheet=workbook.addWorksheet('Type decisions');
 typeSheet.columns=[{header:'Document type',key:'type',width:60},{header:'Documents',key:'count',width:14},{header:'Type default PD/OI',key:'category',width:22},{header:'Review status',key:'status',width:20},{header:'Last changed by',key:'by',width:20},{header:'Last changed at (UTC)',key:'at',width:28}];
 for(const t of types){const r=state.modelContent.records[t.name];typeSheet.addRow({type:t.name,count:t.corpusCount,category:code(r.category),status:r.status,by:r.by||'',at:r.at||''});}
 const history=workbook.addWorksheet('Change history');history.columns=[{header:'Time (UTC)',key:'at',width:28},{header:'Reviewer',key:'by',width:18},{header:'Document type',key:'type',width:55},{header:'Action or comment',key:'action',width:95}];
 const entries=[...(state.modelContent.events||[]),...(state.privateContent.comments||[]).map(c=>({...c,action:'Comment: '+c.text}))].sort((a,b)=>a.at.localeCompare(b.at));
 for(const e of entries)history.addRow({at:e.at,by:e.by,type:e.type,action:e.action});
 for(const ws of workbook.worksheets){ws.views=[{state:'frozen',ySplit:1}];ws.autoFilter={from:{row:1,column:1},to:{row:ws.rowCount,column:ws.columnCount}};ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'},name:'Calibri',size:11};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF254E3D'}};ws.getRow(1).height=24;for(const col of ws.columns)col.alignment={vertical:'top',wrapText:true};}
 sheet.getColumn('id').numFmt='@';sheet.getColumn('year').numFmt='0';typeSheet.getColumn('count').numFmt='0';
 return workbook;
}
