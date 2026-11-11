"""Read the retained corpus; write only ignored deployment data in this app."""
import argparse, collections, csv, gzip, hashlib, json
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('source',type=Path)
args=parser.parse_args()
project=Path(__file__).resolve().parents[1]
output=project/'.deploy/corpus'
output.mkdir(parents=True,exist_ok=True)
source=args.source.resolve()
rows=list(csv.DictReader((source/'corpus_2026.csv').open()))
assert len(rows)==13271 and len({r['doc_id'] for r in rows})==13271, 'Unexpected retained corpus'
old={r['doc_id']:r['genre'] for r in csv.DictReader((source/'document_genre.csv').open())}
groups=collections.defaultdict(list)
for r in rows:groups[r['doc_type']].append(r)
assert len(groups)==118 and len(groups[''])==184, 'Unexpected document types'
catalog=[]
for index,(name,docs) in enumerate(sorted(groups.items())):
    key=f'type-{index:03}'
    families={d['genre_group'] for d in docs}
    assert len(families)==1
    catalog.append(dict(name=name or 'Type not recorded',originalType=name,
        family=next(iter(families)),corpusCount=len(docs),asset=key,
        earlierCoding=dict(collections.Counter(old.get(d['doc_id'],'Unrecorded') for d in docs))))
    records=[]
    for r in sorted(docs,key=lambda d:(d['year'],d['display_title'],d['doc_id'])):
        # Read just enough of the ORIGINAL text for an exact 100-word opening.
        text=''
        with (source/r['txt_file']).open(errors='replace') as f:
            while len(text.split())<=100:
                chunk=f.read(8192)
                if not chunk:break
                text+=chunk.replace('\ufeff',' ')
        opening=' '.join(text.split()[:100])
        assert opening, f"Empty opening: {r['doc_id']}"
        records.append(dict(id=r['doc_id'],title=r['display_title'],year=r['year'],text=opening,
            earlier=old[r['doc_id']] if not name else None))
    raw=json.dumps(records,ensure_ascii=False,separators=(',',':')).encode()
    (output/f'{key}.json.gz').write_bytes(gzip.compress(raw,compresslevel=9,mtime=0))
(output/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')))
manifest=dict(documents=len(rows),recordedTypes=117,missingTypeDocuments=184,openingWords=100,
    sourceSHA256=hashlib.sha256((source/'corpus_2026.csv').read_bytes()).hexdigest(),
    genreSHA256=hashlib.sha256((source/'document_genre.csv').read_bytes()).hexdigest(),
    description='Retained corpus only. Original text openings; no generated summaries. Starting PD/OI labels are project recoding.')
(output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(dict(**manifest,compressedDocumentBytes=sum(p.stat().st_size for p in output.glob('type-*.json.gz')))))
