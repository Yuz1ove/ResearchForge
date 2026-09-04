import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deriveCanonicalIdentitySeed, identityHash, verifyIndependentCanonicalResponse,
  type CanonicalIdentityBase, type CanonicalIdentitySnapshot, type CanonicalIdentitySeed,
} from "./canonicalIdentityRestoration";
import { resolveIndependentCanonicalIdentity } from "./acceptedSourceEnrichment";
import { persistCanonicalIdentitySnapshot } from "./groundingJobRepository";
import { verifyPayloadArticleIdentity } from "./studyManifestation";

// All provider data in this suite is CONTROLLED / MOCKED, never LIVE.
const bibliography = {
  paperId:"a".repeat(40),title:"Controlled sleep study and attention",
  authors:[{name:"Alice Example"}],year:2024,venue:"Controlled Journal",
  externalIds:{DOI:"10.5555/controlled.identity",PubMed:"123",PubMedCentral:"PMC900001"},
};
function snapshot(patch: Partial<CanonicalIdentityBase> = {}): CanonicalIdentitySnapshot {
  const canonical: CanonicalIdentityBase = {sourceId:"CONTROLLED-01",canonicalStudyId:"canonical:CONTROLLED-01",revision:3,
    title:"Controlled sleep study ...",pmcid:"PMC900001",...patch};
  return {canonical,sourceHash:identityHash("CONTROLLED original source snapshot"),sourceVersion:"CONTROLLED-v1",
    observedAt:"2026-08-01T00:00:00Z",payloadMaterializedAt:"2026-08-02T00:00:00Z",canonicalHash:identityHash(canonical)};
}
function transport(data: unknown = bibliography) {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push(String(input));
    assert.equal(init?.redirect,"error");
    assert.equal(new Headers(init?.headers).get("Accept"),"application/json");
    assert.match(String(input),/^https:\/\/api\.semanticscholar\.org\/graph\/v1\/paper\//u);
    return new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json"}});
  };
  return {fetchImpl,calls};
}
async function restored(base=snapshot(), data: unknown=bibliography) {
  const mock=transport(data);
  const result=await resolveIndependentCanonicalIdentity(base,{fetchImpl:mock.fetchImpl});
  assert.equal(result.resolution.ok,true,JSON.stringify(result));
  if(!result.resolution.ok) throw Error("Expected CONTROLLED success");
  return {value:result.resolution.value,mock,result,base};
}
async function failure(base:CanonicalIdentitySnapshot,data:unknown,expected:string) {
  const mock=transport(data);
  const result=await resolveIndependentCanonicalIdentity(base,{fetchImpl:mock.fetchImpl});
  assert.equal(result.resolution.ok,false);
  if(result.resolution.ok) throw Error("Expected fail closed");
  assert.equal(result.resolution.reason,expected);
  return result;
}

test("V6C C01 CONTROLLED canonical-origin PMCID resolves full bibliography",async()=>{
  const {value,mock}=await restored();
  assert.match(mock.calls[0]!,/paper\/PMCID:900001\?/u);
  assert.equal(value.canonical.doi,bibliography.externalIds.DOI);
  assert.deepEqual(value.canonical.authors,["Alice Example"]);
  assert.equal(value.canonical.year,2024);
  assert.equal(value.canonical.pmid,"123");
  assert.equal(value.canonical.pmcid,"PMC900001");
});
test("V6C C02 CONTROLLED URL identifier requires pre-payload canonical provenance",async()=>{
  const base=snapshot({pmcid:undefined,url:"https://pmc.ncbi.nlm.nih.gov/articles/PMC900001/"});
  assert.equal(deriveCanonicalIdentitySeed(base).fieldType,"source_url");
  await restored(base);
  base.observedAt="2026-08-03T00:00:00Z";
  const mock=transport();
  const result=await resolveIndependentCanonicalIdentity(base,{fetchImpl:mock.fetchImpl});
  assert.equal(result.resolution.ok,false);
  assert.equal(mock.calls.length,0);
});
for(const [id,origin] of [["C03","payload-derived"],["C04","parser-derived"],["C05","redirect-derived"],["C06","reference-derived"],["C23","manifestation-derived"]] as const) {
  test("V6C "+id+" CONTROLLED "+origin+" seed rejected before owner",async()=>{
    const base=snapshot();
    const seed:CanonicalIdentitySeed={...deriveCanonicalIdentitySeed(base),origin,fieldType:"doi",value:"10.5555/rejected"};
    const mock=transport();
    const result=await resolveIndependentCanonicalIdentity(base,{seed,fetchImpl:mock.fetchImpl});
    assert.equal(result.resolution.ok,false);
    if(!result.resolution.ok) assert.equal(result.resolution.reason,"IDENTITY_SEED_PROVENANCE_VIOLATION");
    assert.equal(mock.calls.length,0);
  });
}
test("V6C C07 CONTROLLED title-only input cannot call owner",async()=>{
  const mock=transport();
  const result=await resolveIndependentCanonicalIdentity(snapshot({pmcid:undefined}),{fetchImpl:mock.fetchImpl});
  assert.equal(result.resolution.ok,false);
  if(!result.resolution.ok) assert.equal(result.resolution.reason,"CANONICAL_IDENTITY_INSUFFICIENT");
  assert.equal(mock.calls.length,0);
});
test("V6C C08 CONTROLLED two title candidates remain ambiguous",async()=>{
  const {value}=await restored();
  const base=snapshot({pmcid:undefined});
  const response=structuredClone(value.evidence.response);
  response.candidates.push({...response.candidates[0],title:"Controlled sleep study second work"});
  const result=verifyIndependentCanonicalResponse(base,deriveCanonicalIdentitySeed(base),response);
  assert.equal(result.ok,false);
  if(!result.ok) assert.equal(result.reason,"CANONICAL_IDENTITY_AMBIGUOUS");
});
test("V6C C09 CONTROLLED identifier conflict fails closed",async()=>{
  await failure(snapshot(),{...bibliography,externalIds:{...bibliography.externalIds,PubMedCentral:"PMC900002"}},"CANONICAL_IDENTITY_CONFLICT");
});
test("V6C C10 CONTROLLED author conflict fails closed",async()=>{
  await failure(snapshot({authors:["Another Person"]}),bibliography,"CANONICAL_IDENTITY_CONFLICT");
});
test("V6C C11 CONTROLLED year conflict fails closed",async()=>{
  await failure(snapshot({year:2023}),bibliography,"CANONICAL_IDENTITY_CONFLICT");
});
test("V6C C12 CONTROLLED venue conflict is retained as conflict evidence",async()=>{
  const base=snapshot({venue:"Other Journal"});
  const before=structuredClone(base);
  const result=await failure(base,bibliography,"CANONICAL_IDENTITY_CONFLICT");
  if(!result.resolution.ok) assert.ok(result.resolution.conflicts.includes("venue"));
  assert.deepEqual(base,before);
});
test("V6C C13 CONTROLLED stronger PID is not overwritten",async()=>{
  const base=snapshot({doi:"10.5555/strong"});
  const before=structuredClone(base);
  const mock:typeof fetch=async()=>new Response(JSON.stringify({message:{
    DOI:"10.5555/conflict",title:[bibliography.title],author:[{given:"Alice",family:"Example"}],
    issued:{"date-parts":[[2024]]},"container-title":["Controlled Journal"],
  }}),{headers:{"content-type":"application/json"}});
  const result=await resolveIndependentCanonicalIdentity(base,{fetchImpl:mock});
  assert.equal(result.resolution.ok,false);
  if(!result.resolution.ok) assert.equal(result.resolution.reason,"CANONICAL_IDENTITY_CONFLICT");
  assert.deepEqual(base,before);
});
test("V6C C14 CONTROLLED owner provenance and exact response hash persist",async()=>{
  const {base,value}=await restored();
  const dir=await mkdtemp(join(tmpdir(),"v6c-provenance-"));
  const destination=join(dir,"canonical.json");
  await persistCanonicalIdentitySnapshot(destination,base,value);
  const persisted=JSON.parse(await readFile(destination,"utf8"));
  assert.equal(persisted.evidence.response.responseHash,identityHash(persisted.evidence.response.rawResponseBody));
  assert.equal(persisted.evidence.owner,"acceptedSourceEnrichment");
  assert.equal(persisted.evidence.canonicalRevisionBinding.previousRevision,3);
  assert.equal(persisted.canonical.revision,4);
});
test("V6C C15 CONTROLLED persistence failure preserves previous record exactly",async()=>{
  const {base,value}=await restored();
  const dir=await mkdtemp(join(tmpdir(),"v6c-failure-"));
  const destination=join(dir,"canonical.json");
  const previous=JSON.stringify({original:"must not overwrite"});
  await writeFile(destination,previous,{flag:"wx"});
  await assert.rejects(persistCanonicalIdentitySnapshot(destination,base,value),/snapshot_conflict/u);
  assert.equal(await readFile(destination,"utf8"),previous);
  await assert.rejects(persistCanonicalIdentitySnapshot(join(dir,"missing","canonical.json"),base,value));
  assert.deepEqual(await readdir(dir),["canonical.json"]);
});
test("V6C C16 CONTROLLED same owner snapshot is idempotent with no extra network",async()=>{
  const {base,value,mock}=await restored();
  const second=await resolveIndependentCanonicalIdentity(base,{fetchImpl:mock.fetchImpl});
  assert.equal(second.cacheHit,true);
  assert.equal(mock.calls.length,1);
  assert.equal(second.resolution.ok,true);
  if(!second.resolution.ok) throw Error("Missing result");
  assert.deepEqual(second.resolution.value,value);
  const dir=await mkdtemp(join(tmpdir(),"v6c-idempotent-"));
  const destination=join(dir,"canonical.json");
  const first=await persistCanonicalIdentitySnapshot(destination,base,value);
  const repeated=await persistCanonicalIdentitySnapshot(destination,base,second.resolution.value);
  assert.equal(first.reused,false);
  assert.equal(repeated.reused,true);
  assert.deepEqual(first.value,repeated.value);
  assert.deepEqual(await readdir(dir),["canonical.json"]);
});
for(const [id,field] of [["C17","extractedChunks"],["C18","fullTextDocument"],["C19","writer"]] as const) {
  test("V6C "+id+" CONTROLLED restoration cannot create "+field,async()=>{
    const {base,value,mock}=await restored();
    const dir=await mkdtemp(join(tmpdir(),"v6c-isolation-"));
    await persistCanonicalIdentitySnapshot(join(dir,"canonical.json"),base,value);
    assert.equal(JSON.stringify(value).includes('"'+field+'"'),false);
    assert.deepEqual(Object.keys(value).sort(),["canonical","evidence","status"]);
    assert.equal(mock.calls.length,1);
    assert.deepEqual(await readdir(dir),["canonical.json"]);
  });
}
test("V6C C20 CONTROLLED rejected-payload oracle is only compared after persistence",async()=>{
  const {base,value,mock}=await restored();
  const dir=await mkdtemp(join(tmpdir(),"v6c-oracle-"));
  await persistCanonicalIdentitySnapshot(join(dir,"canonical.json"),base,value);
  const original=await readFile(join(dir,"canonical.json"),"utf8");
  const postResolutionOracle="10.3390/brainsci5040441";
  assert.equal(JSON.parse(original).canonical.doi===postResolutionOracle,false);
  assert.ok(mock.calls.every(url=>!decodeURIComponent(url).includes(postResolutionOracle)));
  assert.equal(await readFile(join(dir,"canonical.json"),"utf8"),original);
});
test("V6C C21 CONTROLLED owner unavailable is typed, bounded, no retries",async()=>{
  let calls=0;
  const result=await resolveIndependentCanonicalIdentity(snapshot(),{fetchImpl:async()=>{calls++;throw Error("CONTROLLED network unavailable");}});
  assert.equal(result.resolution.ok,false);
  if(!result.resolution.ok) assert.equal(result.resolution.reason,"CANONICAL_IDENTITY_OWNER_UNAVAILABLE");
  assert.equal(calls,1);
  assert.equal(result.attempts.length,1);
});
test("V6C C22 CONTROLLED V6B title-only payload qualification remains closed",()=>{
  const result=verifyPayloadArticleIdentity({canonicalStudyId:"CONTROLLED",title:"Controlled study ..."},
    {title:"Controlled study and more",doi:"10.5555/untrusted"});
  assert.equal(result.decision,"UNKNOWN");
  assert.equal(result.reason,"CANONICAL_IDENTITY_INSUFFICIENT");
});
test("V6C C24 CONTROLLED source hash/version/field binding cannot be relabeled",async()=>{
  const base=snapshot();
  for(const patch of [{sourceHash:"0".repeat(64)},{sourceVersion:"forged"},{originRecordId:"wrong"},{value:"PMC999"},{origin:"approved-metadata-owner" as const}]) {
    const mock=transport();
    const result=await resolveIndependentCanonicalIdentity(base,{seed:{...deriveCanonicalIdentitySeed(base),...patch},fetchImpl:mock.fetchImpl});
    assert.equal(result.resolution.ok,false);
    if(!result.resolution.ok) assert.equal(result.resolution.reason,"IDENTITY_SEED_PROVENANCE_VIOLATION");
    assert.equal(mock.calls.length,0);
  }
});
test("V6C C25 CONTROLLED incomplete owner records cannot verify",async()=>{
  for(const data of [{...bibliography,authors:[]},{...bibliography,year:null},{...bibliography,venue:""},
    {...bibliography,paperId:""},{...bibliography,externalIds:{DOI:"10.5555/controlled.identity"}}]) {
    await failure(snapshot(),data,"CANONICAL_IDENTITY_INSUFFICIENT");
  }
});
test("V6C C26 CONTROLLED cache cannot leak between injected transports",async()=>{
  await restored();
  const result=await resolveIndependentCanonicalIdentity(snapshot(),{fetchImpl:async()=>{throw Error("CONTROLLED second transport");}});
  assert.equal(result.cacheHit,false);
  assert.equal(result.resolution.ok,false);
});
test("V6C C27 CONTROLLED non-JSON and redirect response cannot materialize",async()=>{
  for(const response of [new Response("<html>Not metadata</html>",{headers:{"content-type":"text/html"}}),
    new Response(null,{status:302,headers:{location:"https://example.org/fulltext.pdf"}})]) {
    const result=await resolveIndependentCanonicalIdentity(snapshot(),{fetchImpl:async()=>response});
    assert.equal(result.resolution.ok,false);
    assert.equal(result.attempts.length,1);
  }
});
test("V6C C28 CONTROLLED multiple detail records are never first-selected",async()=>{
  await failure(snapshot(),[bibliography,bibliography],"CANONICAL_IDENTITY_AMBIGUOUS");
});
test("V6C C29 CONTROLLED stale canonical hash rejected before network",async()=>{
  const base=snapshot();
  base.canonical.title="Changed after capture";
  const mock=transport();
  const result=await resolveIndependentCanonicalIdentity(base,{fetchImpl:mock.fetchImpl});
  assert.equal(result.resolution.ok,false);
  assert.equal(mock.calls.length,0);
});
test("V6C C30 CONTROLLED corrupted response hash cannot persist",async()=>{
  const {base,value}=await restored();
  value.evidence.response.rawResponseBody="corrupted";
  const dir=await mkdtemp(join(tmpdir(),"v6c-corrupt-"));
  await assert.rejects(persistCanonicalIdentitySnapshot(join(dir,"canonical.json"),base,value),/invalid_evidence/u);
  assert.deepEqual(await readdir(dir),[]);
});
test("V6C C31 CONTROLLED parallel same-evidence persistence publishes one revision",async()=>{
  const {base,value}=await restored();
  const dir=await mkdtemp(join(tmpdir(),"v6c-race-"));
  const results=await Promise.all([1,2,3].map(()=>persistCanonicalIdentitySnapshot(join(dir,"canonical.json"),base,value)));
  assert.equal(results.filter(r=>!r.reused).length,1);
  assert.deepEqual(await readdir(dir),["canonical.json"]);
});
test("V6C C32 CONTROLLED source URL host spoofing and URL fragments cannot seed",async()=>{
  for(const url of ["https://pmc.ncbi.nlm.nih.gov.evil.test/articles/PMC900001/",
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC900001/#doi","https://pmc.ncbi.nlm.nih.gov/articles/PMC900001/?doi=10.5555/rejected"]) {
    const mock=transport();
    const result=await resolveIndependentCanonicalIdentity(snapshot({pmcid:undefined,url}),{fetchImpl:mock.fetchImpl});
    assert.equal(result.resolution.ok,false);
    assert.equal(mock.calls.length,0);
  }
});
test("V6C C33 CONTROLLED unallowlisted payload fields are rejected before owner",async()=>{
  const base=snapshot();
  Object.assign(base.canonical,{rawProviderPayload:{doi:"10.5555/payload"}});
  base.canonicalHash=identityHash(base.canonical);
  const mock=transport();
  const result=await resolveIndependentCanonicalIdentity(base,{fetchImpl:mock.fetchImpl});
  assert.equal(result.resolution.ok,false);
  if(!result.resolution.ok) assert.equal(result.resolution.reason,"IDENTITY_SEED_PROVENANCE_VIOLATION");
  assert.equal(mock.calls.length,0);
});
test("V6C C34 CONTROLLED one shared author cannot hide another canonical author conflict",async()=>{
  await failure(snapshot({authors:["Alice Example","Other Author"]}),bibliography,"CANONICAL_IDENTITY_CONFLICT");
});
test("V6C C35 CONTROLLED candidate edits cannot masquerade as hashed owner bytes",async()=>{
  const {base,value}=await restored();
  value.evidence.response.candidates[0]!.authors=["Forged Person"];
  const edited=verifyIndependentCanonicalResponse(base,value.evidence.seed,value.evidence.response);
  assert.equal(edited.ok,true); // Generic comparison is not the owner persistence authority.
  if(!edited.ok) throw Error("Expected candidate checks");
  const dir=await mkdtemp(join(tmpdir(),"v6c-candidate-forgery-"));
  await assert.rejects(persistCanonicalIdentitySnapshot(join(dir,"canonical.json"),base,edited.value),/invalid_evidence/u);
  assert.deepEqual(await readdir(dir),[]);
});
test("V6C C36 CONTROLLED response from a different request cannot bind identity",async()=>{
  const {base,value}=await restored();
  value.evidence.response.requestUrl="https://example.org/other";
  const result=verifyIndependentCanonicalResponse(base,value.evidence.seed,value.evidence.response);
  assert.equal(result.ok,false);
  if(!result.ok) assert.equal(result.reason,"IDENTITY_SEED_PROVENANCE_VIOLATION");
});
