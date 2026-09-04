// Reuse the unchanged series validator's scan definitions; this adapter does
// not claim the fixed 30-article/10-visual manifest validator covers candidates.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const series=path.resolve(here,'../..');
const original=fs.readFileSync(path.join(series,'internal/validate-publication-v1.mjs'),'utf8');
const start=original.indexOf('const scans = [');
const end=original.indexOf('\n];',start)+3;
if(start<0||end<start)throw new Error('Cannot locate existing scan definitions');
const scans=vm.runInNewContext(original.slice(start,end)+'\nscans;');
const publicFiles=['articles/day-02-20260831/article-public.md','assets/day-02/20260831/stop-condition-flow.svg','assets/day-02/20260831/stop-condition-flow.mmd'];
const findings=[];
for(const file of publicFiles){const body=fs.readFileSync(path.join(series,file),'utf8');for(const [gate,pattern] of scans){if([...body.matchAll(pattern)].length)findings.push({file,gate});}}
const result={scope:'DAY02_CANDIDATE_ONLY',method:'Exact scan definitions reused from unmodified validate-publication-v1.mjs',checks:scans.map(s=>s[0]),files:publicFiles,findings,verdict:findings.length?'FAIL':'PASS'};
fs.writeFileSync(path.join(here,'safety-scan-results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(findings.length)process.exitCode=1;
