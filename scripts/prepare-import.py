#!/usr/bin/env python3
"""Convert an owner-provided AppDeploy NDJSON export to id-preserving D1 SQL.
Input: one {"collection": "...", "id": "...", "record": {...}} per line.
Run only against a stopped destination collector; never publish the export or SQL.
"""
import argparse,json,hashlib
from pathlib import Path
from collections import Counter
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
seen=set();counts=Counter();statements=[]
def literal(v):return "'"+v.replace("'","''")+"'"
for line in a.source.read_text().splitlines():
 if not line.strip():continue
 row=json.loads(line);c=row['collection'];i=row['id'];record=row['record']
 if not isinstance(c,str) or not c or not isinstance(i,str) or not i or not isinstance(record,dict):raise ValueError('Invalid export row')
 if (c,i) in seen:raise ValueError('Duplicate collection/id in export')
 seen.add((c,i));counts[c]+=1
 # AppDeploy pagination tokens cannot be reused by D1. Restart bounded closing scans.
 if c.startswith('sharp_closing_progress'):
  record.pop('migrationToken',None);record.pop('queueToken',None)
 data=json.dumps(record,separators=(',',':'),ensure_ascii=False)
 statements.append('INSERT INTO documents(collection,id,data) VALUES('+','.join(map(literal,[c,i,data]))+') ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data;')
a.output.parent.mkdir(parents=True,exist_ok=True)
a.output.write_text('\n'.join(statements)+'\n');a.output.chmod(0o600)
manifest={'source_sha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'records':len(seen),'collections':dict(counts)}
a.output.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'records':len(seen),'collections':len(counts),'sql':str(a.output)}))
