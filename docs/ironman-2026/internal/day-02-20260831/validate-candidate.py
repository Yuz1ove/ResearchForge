"""Publication-only checks; production tests and live requests are never run."""
from pathlib import Path
import hashlib,json,re,sys,subprocess,xml.etree.ElementTree as ET
from markdown_it import MarkdownIt
here=Path(__file__).resolve().parent;series=here.parent.parent
repo=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else series.parent.parent
article=series/'articles/day-02-20260831/article-public.md';assets=series/'assets/day-02/20260831'
s=article.read_text();tokens=MarkdownIt('commonmark').enable('table').parse(s);checks=[]
def check(name,ok,detail):checks.append({'check':name,'result':'PASS' if ok else 'FAIL','detail':detail})
subprocess.run(['node',str(here/'reuse-safety-scans.mjs')],check=True,stdout=subprocess.DEVNULL)
scan=json.loads((here/'safety-scan-results.json').read_text());check('reused_publication_scans',scan['verdict']=='PASS',scan['checks'])
heads=[x.tag for x in tokens if x.type=='heading_open'];check('markdown_structure',heads.count('h1')==1 and heads.count('h2')>=3 and not any(h in heads for h in ['h3','h4','h5','h6']) and s.count('```')%2==0,{'headings':heads,'fences':s.count('```')})
check('title_day_and_length',s.startswith('# Day 02｜') and 1800<=len(re.findall(r'[\u3400-\u9fff]',s))<=3000,{'unicode_characters':len(s),'cjk_characters':len(re.findall(r'[\u3400-\u9fff]',s))})
links=[]
for token in tokens:
 for child in token.children or []:
  for key in ('href','src'):
   ref=child.attrGet(key)
   if ref:links.append(ref)
check('internal_links',all((article.parent/ref).resolve().is_file() for ref in links),links)
check('public_references',set(re.findall(r'\[(\d+)\]',s))==set(re.findall(r'^(\d+)\. ',s,re.M)),{'citations':sorted(set(re.findall(r'\[(\d+)\]',s)))})
sv=(assets/'stop-condition-flow.svg').read_text();svg=ET.fromstring(sv)
check('svg_xml',svg.tag=='{http://www.w3.org/2000/svg}svg',{'viewBox':svg.get('viewBox')})
check('svg_public_resources',not re.search(r'<foreignObject|<image|<script|@import|@font-face|(?:href|src)=|url\((?!#)',sv,re.I),'No foreignObject, external font, raster image, script, or external resource; XML namespace is not a resource request')
ids={e.get('id') for e in svg.iter() if e.get('id')};check('svg_markers',all(x in ids for x in re.findall(r'url\(#([^)]*)\)',sv)),'All arrow marker references resolve')
mm=(assets/'stop-condition-flow.mmd').read_text();check('diagram_model_labels','flowchart TD' in mm and 'NOT_RUN' in mm and '簡化' in mm and '簡化' in sv,'Mermaid source is paired with a manually laid-out equivalent SVG; no claim of automated Mermaid rendering')
packet=json.loads((here/'claims.json').read_text());fail=[]
for c in packet['claims']:
 if c['article_anchor'] not in s or not c['evidence']:fail.append(c['id'])
 for e in c['evidence']:
  p=repo/e['path']
  if not p.is_file() or e['end_line']>len(p.read_text().splitlines()):fail.append(c['id']+':source')
for rel,expected in packet['sources'].items():
 if hashlib.sha256((repo/rel).read_bytes()).hexdigest()!=expected['sha256']:fail.append(rel+':drift')
check('evidence_map_completeness',len(packet['claims'])==16 and not fail,{'claims':len(packet['claims']),'sources':len(packet['sources']),'failures':fail})
check('article_hash_binding',hashlib.sha256(article.read_bytes()).hexdigest()==packet['article_sha256'],'Matches reviewed claims packet')
check('no_fabricated_test_totals',not re.search(r'\b\d+/\d+\b',re.sub(r'\]\([^)]*\)',']',s)),'Article publishes no test totals; historical suite PASS claims map to receipts')
check('conceptual_code_disclosure','簡化後的概念模型' in s and '不是實際 production code' in s,'All pseudocode and figure are conceptual; actual source is separately mapped')
check('whitespace',all(line==line.rstrip() for p in [article,assets/'stop-condition-flow.svg',assets/'stop-condition-flow.mmd'] for line in p.read_text().splitlines()),'No trailing whitespace')
visual=json.loads((here/'visual-qa.json').read_text());check('rendered_visual_review',all(v.startswith('PASS') for v in visual['manual_review'].values()),visual)
legacy=json.loads((here/'legacy-baseline-validation.json').read_text());check('legacy_scope_preserved',legacy['hard_failures']==[{'gate':'placeholder','detail':'day-02.md: 待補'}], 'Legacy full-series validator was already FAIL on old day-02.md; this check records the boundary, not a legacy PASS')
result={'scope':'DAY02_20260831_CANDIDATE_ONLY','verdict':'PASS' if all(c['result']=='PASS' for c in checks) else 'FAIL','checks':checks,'legacy_full_series_verdict':legacy['verdict'],'engineering_tests_this_task':'NOT_RUN','live_acquisition_this_task':'NOT_RUN','platform_preview':'NOT_RUN'}
(here/'validation-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'verdict':result['verdict'],'passed':sum(c['result']=='PASS' for c in checks),'total':len(checks),'failed':[c for c in checks if c['result']=='FAIL']},ensure_ascii=False));sys.exit(result['verdict']!='PASS')
