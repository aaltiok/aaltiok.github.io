"""Fetch the pinned, integrity-verified browser export library; no install scripts run."""
import base64,hashlib,io,json,tarfile,urllib.request
from pathlib import Path
project=Path(__file__).resolve().parents[1]
meta=json.loads((project/'vendor/exceljs-source.json').read_text())
assert meta['version']=='4.4.0' and meta['source']=='https://registry.npmjs.org/exceljs/-/exceljs-4.4.0.tgz'
raw=urllib.request.urlopen(meta['source'],timeout=60).read()
assert base64.b64encode(hashlib.sha512(raw).digest()).decode()==meta['integrity'].removeprefix('sha512-')
with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as archive:
 for source,target in [('package/dist/exceljs.min.js','exceljs.min.js'),('package/LICENSE','exceljs.LICENSE')]:
  (project/'vendor'/target).write_bytes(archive.extractfile(source).read())
print('Verified ExcelJS 4.4.0 browser bundle and license.')
