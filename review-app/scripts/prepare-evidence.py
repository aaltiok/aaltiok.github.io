"""Prepare immutable reading evidence and excluded-record metadata; source files are read only."""
import csv,hashlib,json,sys
from pathlib import Path
source=Path(sys.argv[1]);out=Path(__file__).resolve().parents[1]/'.deploy/evidence';out.mkdir(parents=True,exist_ok=True)
audit={r['doc_id']:r for r in csv.DictReader((source/'corpus_audit.csv').open())}
retained={r['doc_id']:r for r in csv.DictReader((source/'corpus_2026.csv').open())}
assert len(audit)==41286 and len(retained)==13271
chunks=[];batch=[];size=2;seen=set();included=0
for r in csv.DictReader((source/'frame_2026.csv').open()):
 id=r['doc_id']
 if id not in audit or id in seen:continue
 seen.add(id);keep=id in retained;opening=''
 if keep:
  included+=1;text=''
  with (source/retained[id]['txt_file']).open(errors='replace') as f:
   while len(text.split())<=1000:
    piece=f.read(8192)
    if not piece:break
    text+=piece.replace('\ufeff',' ')
  opening=' '.join(text.split()[:1000])
 a=audit[id];details=dict(opening=opening,url=r['doc_url'].replace('http://','https://',1),pdf=r['pdf_url'].replace('http://','https://',1),text=r['txt_url'].replace('http://','https://',1))
 row=dict(id=id,included=int(keep),type=r['doc_type'] or 'Type not recorded',title=r['display_title'],year=r['year'],reason=a['exclusion_reason'] if not keep else '',details=details)
 raw=json.dumps(row,ensure_ascii=False,separators=(',',':'));n=len(raw.encode())
 if batch and (size+n>650000 or len(batch)>=250):chunks.append('['+','.join(batch)+']');batch=[];size=2
 batch.append(raw);size+=n+1
if batch:chunks.append('['+','.join(batch)+']')
assert len(seen)==41286 and included==13271
manifest=dict(records=len(seen),included=included,excluded=len(seen)-included,chunks=[hashlib.sha256(b.encode()).hexdigest() for b in chunks])
parts=[];part=[];length=0
for body in chunks:
 item=dict(body=body);n=len(body.encode())
 if part and length+n>6500000:parts.append(part);part=[];length=0
 part.append(item);length+=n
if part:parts.append(part)
for i,p in enumerate(parts):(out/f'part-{i:03}.json').write_text(json.dumps(p,ensure_ascii=False,separators=(',',':')))
(out/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
print(json.dumps(dict(records=len(seen),retained=included,excluded=len(seen)-included,chunks=len(chunks),parts=len(parts),bytes=sum(len(b.encode()) for b in chunks))))
