import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import JSZip from "jszip";
import {
  ResearchProductExportResponseSchema,
  ResearchProductWorkflowSnapshotV1Schema,
  type ResearchProductWorkflowSnapshotV1,
} from "@workspace/api-zod/research-product-workflow";

const API_BASE_URL = process.env.R24_API_BASE_URL?.trim();
const ARTIFACT_DIR = process.env.R24_ARTIFACT_DIR?.trim();
if (!API_BASE_URL || !ARTIFACT_DIR) {
  throw new Error("R24_API_BASE_URL and R24_ARTIFACT_DIR are required.");
}

async function request(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", connection: "close" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${path}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function snapshot(value: unknown): ResearchProductWorkflowSnapshotV1 {
  return ResearchProductWorkflowSnapshotV1Schema.parse(value);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const created = snapshot(
  await request("/research-product/projects", "POST", {
    topic: "塑膠微粒對海洋生物的影響",
    reportType: "研究報告",
    targetAudience: "高中生",
    targetLanguage: "zh-TW",
    depth: "deep",
    timeframe: null,
    sourceConstraints: ["live_academic_providers", "traceable_metadata", "abstract_evidence_only"],
    preferredDisciplines: ["marine ecology", "environmental science"],
    excludedSourceCategories: ["fixture", "synthetic"],
    expectedOutputFormats: ["markdown", "pdf", "docx", "json_bundle"],
    mode: "LIVE",
  }),
);
const projectPath = `/research-product/projects/${encodeURIComponent(created.project.id)}`;
let current = snapshot(await request(`${projectPath}/research-runs`, "POST", {}));
const academicProviders = [...new Set(
  current.sourceCandidates
    .map((candidate) => candidate.provider)
    .filter((provider) => provider === "OpenAlex" || provider === "Crossref"),
)].sort();
assert.deepEqual(academicProviders, ["Crossref", "OpenAlex"]);
assert.ok(current.sourceCandidates.every((candidate) => candidate.providerRawRef.startsWith("live-search-record:")));
assert.ok(current.sources.length >= 4);
assert.ok(current.evidenceCards.length >= 6);
assert.ok(current.sourceCandidates.every((candidate) => !/fixture|synthetic/iu.test(candidate.provider)));

const decisions = current.evidenceCards.slice(0, 12).map((card) => ({
  evidenceCardId: card.id,
  decision: "accepted" as const,
  reason: "R24 manual acceptance confirmed the provider abstract span and lineage.",
  note: "Abstract-only evidence; full text is not qualified.",
  tags: ["r24", "live-provider", "abstract-only", "traceable"],
  decidedBy: "human" as const,
}));
current = snapshot(await request(`${projectPath}/evidence-decisions`, "POST", { decisions }));
assert.equal(current.acceptedEvidenceSet?.evidenceCardIds.length, decisions.length);
current = snapshot(await request(`${projectPath}/report-plan`, "PUT", {}));
assert.equal(current.project.status, "PLAN_READY");
assert.ok(current.reportPlan?.sections.every((section) => section.status === "ready"));

current = snapshot(await request(`${projectPath}/generation-runs`, "POST", {}));
assert.equal(current.project.status, "VERIFYING");
assert.ok(current.generationRuns.every((run) => run.provider === "school-openai-compatible"));
assert.ok(current.generationRuns.every((run) => run.model === "gpt-5.6-luna"));
assert.ok(current.generationRuns.every((run) => run.provenance.parentRefs.some((ref) => ref.startsWith("llm_request_"))));
current = snapshot(await request(`${projectPath}/verifications`, "POST", {}));
assert.equal(current.project.status, "READY");
assert.ok(current.verificationResults.every((result) => result.status === "SUPPORTED"));

const editedSection = current.reportPlan!.sections[0]!;
const verifiedContent = current.sectionContent[editedSection.id]!;
current = snapshot(
  await request(`${projectPath}/sections/${encodeURIComponent(editedSection.id)}`, "PUT", {
    content: `${verifiedContent}\n\n人工修改：這句尚未重新驗證。`,
    editedBy: "human",
  }),
);
assert.equal(current.project.status, "REVISION_REQUIRED");
assert.ok(current.generatedClaims.some((claim) => claim.status === "needs_reverification"));
current = snapshot(await request(`${projectPath}/verifications`, "POST", {}));
assert.ok(current.verificationResults.some((result) => result.status === "NEEDS_REVERIFICATION"));
current = snapshot(await request(`${projectPath}/generation-runs`, "POST", {}));
assert.equal(current.sectionContent[editedSection.id], verifiedContent);
current = snapshot(await request(`${projectPath}/verifications`, "POST", {}));
assert.equal(current.project.status, "READY");
assert.ok(current.verificationResults.every((result) => result.status === "SUPPORTED"));

const markdown = ResearchProductExportResponseSchema.parse(
  await request(`${projectPath}/exports`, "POST", { format: "markdown", allowDraft: false }),
);
assert.match(markdown.content, /^# 塑膠微粒對海洋生物的影響/mu);
assert.match(markdown.content, /^## References/mu);
await writeFile(`${ARTIFACT_DIR}/researchforge-r24-live-report.md`, markdown.content, "utf8");

const pdf = ResearchProductExportResponseSchema.parse(
  await request(`${projectPath}/exports`, "POST", { format: "pdf", allowDraft: false }),
);
const pdfBytes = Uint8Array.from(Buffer.from(pdf.content, "base64"));
assert.equal(Buffer.from(pdfBytes.slice(0, 5)).toString("ascii"), "%PDF-");
assert.equal(sha256(pdfBytes), pdf.artifact.contentHash);
await writeFile(`${ARTIFACT_DIR}/researchforge-r24-live-report.pdf`, pdfBytes);

const docx = ResearchProductExportResponseSchema.parse(
  await request(`${projectPath}/exports`, "POST", { format: "docx", allowDraft: false }),
);
const docxBytes = Uint8Array.from(Buffer.from(docx.content, "base64"));
assert.deepEqual(Array.from(docxBytes.slice(0, 2)), [0x50, 0x4b]);
assert.equal(sha256(docxBytes), docx.artifact.contentHash);
const zip = await JSZip.loadAsync(docxBytes);
const documentXml = await zip.file("word/document.xml")!.async("string");
assert.match(documentXml, /塑膠微粒對海洋生物的影響/u);
assert.match(documentXml, /References/u);
await writeFile(`${ARTIFACT_DIR}/researchforge-r24-live-report.docx`, docxBytes);

const replay = ResearchProductExportResponseSchema.parse(
  await request(`${projectPath}/exports`, "POST", { format: "json_bundle", allowDraft: false }),
);
await writeFile(`${ARTIFACT_DIR}/researchforge-r24-live-replay.json`, replay.content, "utf8");
const finalSnapshot = snapshot(await request(projectPath));
await writeFile(
  `${ARTIFACT_DIR}/researchforge-r24-live-final-snapshot.json`,
  `${JSON.stringify(finalSnapshot, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify({
  projectId: finalSnapshot.project.id,
  workflowId: finalSnapshot.project.workflowId,
  mode: finalSnapshot.project.mode,
  status: finalSnapshot.project.status,
  version: finalSnapshot.project.version,
  academicProviders,
  candidates: finalSnapshot.sourceCandidates.length,
  canonicalSources: finalSnapshot.sources.length,
  acceptedEvidence: finalSnapshot.acceptedEvidenceSet?.evidenceCardIds.length ?? 0,
  generationProvider: finalSnapshot.generationRuns[0]?.provider,
  generationModel: finalSnapshot.generationRuns[0]?.model,
  claims: finalSnapshot.generatedClaims.length,
  supported: finalSnapshot.verificationResults.filter((result) => result.status === "SUPPORTED").length,
  editInvalidationAndRepair: true,
  exports: finalSnapshot.exports.map((artifact) => ({
    format: artifact.format,
    hash: artifact.contentHash,
    reportStatus: artifact.reportStatus,
  })),
}, null, 2));
