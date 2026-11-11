"""Preserve earlier Script/Practice coding for records without document type."""
import csv,json,sys,collections
from pathlib import Path
source=Path(sys.argv[1]);out=Path(__file__).resolve().parents[1]/'.deploy/earlier-labels.json'
ids={r['doc_id'] for r in csv.DictReader((source/'corpus_2026.csv').open()) if not r['doc_type'].strip()}
labels={r['doc_id']:r['genre'] for r in csv.DictReader((source/'document_genre.csv').open()) if r['doc_id'] in ids}
assert len(ids)==len(labels)==184 and collections.Counter(labels.values())=={'Script':80,'Practice':104}
category={'Script':'Production/Dissemination','Practice':'Operationalization/Implementation'}
data={id:{'type':'Type not recorded','category':category[label],'source':'Earlier saved coding','earlier':label} for id,label in labels.items()}
out.write_text(json.dumps(data,separators=(',',':'))+'\n')
print('Prepared 184 earlier labels: 80 PD and 104 OI. Original document types remain missing.')
