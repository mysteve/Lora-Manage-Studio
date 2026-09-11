"""Download and merge public prompt vocabulary snapshots. Run from repository root."""
import csv, hashlib, io, json, pathlib, urllib.request, datetime
OUT = pathlib.Path('src/features/prompts/data')
SOURCES = [
 ('danbooru', 'DominikDoom/a1111-sd-webui-tagcomplete', 'tags/danbooru.csv'),
 ('e621', 'DominikDoom/a1111-sd-webui-tagcomplete', 'tags/e621.csv'),
 ('quality', 'DominikDoom/a1111-sd-webui-tagcomplete', 'tags/extra-quality-tags.csv'),
 ('chinese', 'Physton/sd-webui-prompt-all-in-one-assets', 'tags/danbooru.zh_CN.csv'),
]
def normal(text):
 return ' '.join(text.lower().replace('_', ' ').replace('-', ' ').split())
def download(repo, path):
 url=f'https://raw.githubusercontent.com/{repo}/main/{path}'
 return url, urllib.request.urlopen(url, timeout=60).read()
def build():
 OUT.mkdir(parents=True, exist_ok=True)
 manifest={'retrieved':datetime.date.today().isoformat(), 'sources':[]}
 tables={}
 for name, repo, path in SOURCES:
  url, raw=download(repo,path)
  rows=list(csv.reader(io.StringIO(raw.decode('utf-8-sig'))))
  tables[name]=rows
  manifest['sources'].append({'name':name,'url':url,'sha256':hashlib.sha256(raw).hexdigest(),'rows':len(rows)})
 translations={normal(row[0]):row[1].strip() for row in tables['chinese'] if len(row)>1 and row[0].strip()}
 merged={}
 categories={'danbooru':{'0':'通用标签','1':'画师','3':'作品','4':'角色','5':'元标签'}, 'e621':{'0':'通用标签','1':'画师','3':'作品','4':'角色','5':'物种','7':'元标签','8':'设定'}}
 for name in ['danbooru','e621','quality']:
  for row in tables[name]:
   if len(row)<3 or not row[0].strip(): continue
   raw=row[0].strip(); key=normal(raw)
   aliases=[a.strip() for a in (row[3] if len(row)>3 else '').split(',') if a.strip()]
   translation=translations.get(key,'')
   count=int(row[2]) if row[2].isdigit() else 0
   category='画质' if name=='quality' else categories[name].get(row[1],'其他标签')
   if key in merged:
    old=merged[key]
    old[3]=' '.join(dict.fromkeys((old[3]+' '+' '.join(aliases)).split()))
    old[4]=max(old[4],count)
    old[5]+=' / '+name
   else:
    merged[key]=[raw.replace('_',' '),translation,category,' '.join(aliases),count,name]
 for row in tables['chinese']:
  if len(row)<2 or not row[0].strip(): continue
  key=normal(row[0])
  if key not in merged:
   merged[key]=[row[0].strip().replace('_',' '),row[1].strip(),'通用标签','',0,'chinese']
 records=sorted(merged.values(),key=lambda row:-row[4])
 (OUT/'external-terms.json').write_text(json.dumps(records,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 manifest.update({'uniqueTerms':len(records),'translatedTerms':sum(bool(row[1]) for row in records)})
 (OUT/'sources.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 for repo,filename in [('DominikDoom/a1111-sd-webui-tagcomplete','tagcomplete-LICENSE.txt'),('Physton/sd-webui-prompt-all-in-one-assets','prompt-all-in-one-LICENSE.txt')]:
  _,raw=download(repo,'LICENSE'); (OUT/filename).write_bytes(raw)
 print(json.dumps(manifest,ensure_ascii=True,indent=2))
if __name__=='__main__': build()
