import { createHash } from "node:crypto";
import type {
  DocumentRecordV1,
  ModeBClaimAssessment,
  ModeBClaimVerdict,
  ModeBVerificationSummary,
  ParsedBlockV1,
  ResearchProductWorkflowSnapshotV1,
  VerifyExistingReportRequest,
  VerifyExistingReportResponse,
} from "@workspace/api-zod/research-product-workflow";
import {
  buildResearchProductDocx,
  buildResearchProductPdf,
} from "./product-document-export";
import { parseDocument } from "./parsers/document-parser";
import { parseBibliography, resolveReferences, type ResolvedReferenceItem } from "./citation-resolver";
import {
  extractClaimsFromBlocks,
  verifyClaimWithEvidence,
  calculateCitationHealth,
  type ExtractedModeBClaim,
} from "./mode-b-claim-verifier";

function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function stableId(prefix: string, ...parts: string[]): string {
  const digest = createHash("sha256")
    .update(parts.join("\u001f"))
    .digest("hex")
    .slice(0, 24);
  return `${prefix}_${digest}`;
}

// Backward-compatible export
export async function extractDocumentText(input: VerifyExistingReportRequest): Promise<{
  text: string;
  mediaType: string;
  contentHash: string;
}> {
  const parsed = await parseDocument(input, "temp_project", new Date().toISOString());
  return {
    text: parsed.text,
    mediaType: parsed.mediaType,
    contentHash: parsed.contentHash,
  };
}

// Backward-compatible export
export function parseBlocksAndStructure(
  text: string,
  projectId: string,
  documentId: string,
  now: string,
): {
  blocks: ParsedBlockV1[];
  sections: Array<{ title: string; content: string }>;
  referencesText: string;
} {
  const rawParagraphs = text.split(/\n{2,}/);
  const blocks: ParsedBlockV1[] = [];
  const sections: Array<{ title: string; content: string }> = [];
  let currentSectionTitle = "前言與背景";
  let currentSectionLines: string[] = [];
  let referencesText = "";
  let inReferences = false;
  let offset = 0;

  for (let i = 0; i < rawParagraphs.length; i++) {
    const rawP = rawParagraphs[i]!.trim();
    if (!rawP) continue;

    const isHeading = rawP.startsWith("#");
    const isReferenceSection = /^#{1,3}\s*(References|參考文獻|引用文獻)/i.test(rawP);
    if (isReferenceSection) inReferences = true;
    if (inReferences) referencesText += (referencesText ? "\n\n" : "") + rawP;

    if (isHeading && !isReferenceSection) {
      if (currentSectionLines.length > 0) {
        sections.push({
          title: currentSectionTitle,
          content: currentSectionLines.join("\n\n"),
        });
        currentSectionLines = [];
      }
      currentSectionTitle = rawP.replace(/^#+\s*/, "").trim();
    } else if (!isReferenceSection) {
      currentSectionLines.push(rawP);
    }

    const blockType = isHeading
      ? "heading"
      : isReferenceSection
        ? "reference"
        : "paragraph";
    const startOffset = offset;
    const endOffset = offset + rawP.length;
    offset = endOffset + 2;

    blocks.push({
      id: stableId("block", documentId, String(i), rawP.slice(0, 32)),
      projectId,
      documentId,
      blockType,
      text: rawP,
      page: Math.floor(i / 6) + 1,
      section: currentSectionTitle,
      startOffset,
      endOffset,
      extractor: "researchforge-mode-b-structural-parser",
      extractorVersion: "2026.09.04",
      createdAt: now,
      provenance: {
        mode: "LOCAL_PARSE",
        producer: "structural-parser",
        producerVersion: "2.0",
        parentRefs: [documentId],
        generatedAt: now,
      },
    });
  }

  if (currentSectionLines.length > 0) {
    sections.push({
      title: currentSectionTitle,
      content: currentSectionLines.join("\n\n"),
    });
  }

  return { blocks, sections, referencesText };
}

// Backward-compatible export
export function extractCitationsAndReferences(referencesText: string): Map<string, string> {
  const parsed = parseBibliography(referencesText);
  const result = new Map<string, string>();
  for (const [k, v] of parsed.entries()) {
    result.set(k, v.rawText);
  }
  return result;
}

// Backward-compatible export that calls generalized verification engine
export async function assessClaim(
  claimText: string,
  sectionTitle: string,
  citationMarkers: string[],
  refMap: Map<string, string>,
  blockId: string,
): Promise<ModeBClaimAssessment> {
  const resolvedRefMap = new Map<string, ResolvedReferenceItem>();
  for (const [k, raw] of refMap.entries()) {
    const doiMatch = raw.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/i);
    const hasRetracted = /retracted|unverified|撤稿|未證實/i.test(raw);
    resolvedRefMap.set(k, {
      marker: k,
      rawText: raw,
      resolved: !hasRetracted,
      title: raw.slice(0, 100),
      authors: [],
      year: null,
      doi: doiMatch ? doiMatch[0] : null,
      url: null,
      abstract: raw,
      provider: "LOCAL_PARSE",
      resolutionMethod: "local_bibliography_parse",
      resolutionConfidence: hasRetracted ? 0.1 : 0.9,
      resolutionStatus: hasRetracted ? "RESOLUTION_FAILED" : "RESOLVED",
      provenanceMode: "LOCAL_PARSE",
    });
  }

  const claim: ExtractedModeBClaim = {
    claimId: stableId("claim", blockId, claimText.slice(0, 32)),
    claimText,
    sectionTitle,
    blockId,
    sentenceSpan: claimText,
    citationMarkers,
    claimType: "empirical_finding",
    scope: /100%|所有|全體|全面/i.test(claimText) ? "universal" : "conditional",
    numericAssertions: [...claimText.matchAll(/\b\d+(?:\.\d+)?%|\b\d+\s*(?:個|筆|隻|萬|億|mg|g|μg|nm|ppm|ppb|周|週|年|月|days|weeks|years)\b/gi)].map((m) => m[0]),
    entities: [],
    extractionConfidence: 0.9,
  };

  return await verifyClaimWithEvidence(claim, resolvedRefMap);
}

export async function evaluateClaimEvidence(
  claimText: string,
  citationMarkers: string[],
  resolvedRefMap: Map<string, ResolvedReferenceItem>,
): Promise<ModeBClaimAssessment> {
  const claim: ExtractedModeBClaim = {
    claimId: stableId("claim", claimText),
    claimText,
    sectionTitle: "評估",
    blockId: "block_eval",
    sentenceSpan: claimText,
    citationMarkers,
    claimType: "empirical_finding",
    scope: /100%|所有|全體|全面/i.test(claimText) ? "universal" : "conditional",
    numericAssertions: [...claimText.matchAll(/\b\d+(?:\.\d+)?%|\b\d+\s*(?:個|筆|隻|萬|億|mg|g|μg|nm|ppm|ppb|周|週|年|月|days|weeks|years)\b/gi)].map((m) => m[0]),
    entities: [],
    extractionConfidence: 0.9,
  };

  return await verifyClaimWithEvidence(claim, resolvedRefMap);
}

export function buildAnnotatedMarkdown(
  topic: string,
  sections: Array<{ title: string; content: string }>,
  claims: ModeBClaimAssessment[],
  summary: ModeBVerificationSummary,
  referencesText: string,
): string {
  const header = [
    `# 既有報告審查與驗證報告 (Mode B Verification Audit)`,
    ``,
    `> [!IMPORTANT]`,
    `> **主題**: ${topic}`,
    `> **引用健康度評分 (Citation Health Score)**: **${summary.citationHealthScore} / 100**`,
    `> **驗證統計**: 總宣稱數: ${summary.totalClaims} | 支持 (Supported): ${summary.supportedCount} | 部分支持: ${summary.partiallySupportedCount} | 不支持: ${summary.unsupportedCount} | 張冠李戴 (Misattributed): ${summary.misattributedCount} | 過度誇大 (Exaggerated): ${summary.exaggeratedCount} | 數據不符: ${summary.dataMismatchCount}`,
    `> **總體評估**: ${summary.summaryEvaluation}`,
    ``,
    `---`,
    ``,
  ].join("\n");

  const bodySections = sections.map((section) => {
    const sectionClaims = claims.filter((c) => c.sectionTitle === section.title);
    const claimAnnotations = sectionClaims
      .map((claim) => {
        let badge = "";
        switch (claim.verdict) {
          case "SUPPORTED":
            badge = `> [!NOTE]\n> **宣稱驗證判決: [SUPPORTED]** (信心度: ${Math.round(claim.confidence * 100)}%)\n> 依據: ${claim.rationale}`;
            break;
          case "PARTIALLY_SUPPORTED":
            badge = `> [!WARNING]\n> **宣稱驗證判決: [PARTIALLY_SUPPORTED (部分支持)]** (信心度: ${Math.round(claim.confidence * 100)}%)\n> 審查依據: ${claim.rationale}\n> 修正建議: ${claim.suggestedCorrection}`;
            break;
          case "MISATTRIBUTED":
            badge = `> [!CAUTION]\n> **宣稱驗證判決: [MISATTRIBUTED (引用張冠李戴)]** (信心度: ${Math.round(claim.confidence * 100)}%)\n> 審查依據: ${claim.rationale}\n> 修正建議: ${claim.suggestedCorrection}`;
            break;
          case "EXAGGERATED":
            badge = `> [!WARNING]\n> **宣稱驗證判決: [EXAGGERATED (文獻結論過度誇大)]** (信心度: ${Math.round(claim.confidence * 100)}%)\n> 審查依據: ${claim.rationale}\n> 修正建議: ${claim.suggestedCorrection}`;
            break;
          case "DATA_MISMATCH":
            badge = `> [!WARNING]\n> **宣稱驗證判決: [DATA_MISMATCH (數據引述不符)]** (信心度: ${Math.round(claim.confidence * 100)}%)\n> 審查依據: ${claim.rationale}\n> 修正建議: ${claim.suggestedCorrection}`;
            break;
          case "INSUFFICIENT_EVIDENCE":
          case "UNVERIFIABLE":
            badge = `> [!NOTE]\n> **宣稱驗證判決: [INSUFFICIENT_EVIDENCE (證據不足無法查證)]** (信心度: ${Math.round(claim.confidence * 100)}%)\n> 審查依據: ${claim.rationale}\n> 修正建議: ${claim.suggestedCorrection}`;
            break;
          case "UNSUPPORTED":
          default:
            badge = `> [!CAUTION]\n> **宣稱驗證判決: [UNSUPPORTED (完全無文獻支持)]** (信心度: ${Math.round(claim.confidence * 100)}%)\n> 審查依據: ${claim.rationale}\n> 修正建議: ${claim.suggestedCorrection}`;
            break;
        }
        return `### 宣稱審查: ${claim.claimText.slice(0, 60)}...\n\n${badge}`;
      })
      .join("\n\n");

    return [
      `## ${section.title}`,
      ``,
      section.content,
      ``,
      claimAnnotations,
      ``,
    ].join("\n");
  }).join("\n");

  const referencesBlock = referencesText
    ? `\n\n## References\n\n${referencesText.replace(/^#+\s*References\s*/i, "").trim()}`
    : "";

  return `${header}\n${bodySections}${referencesBlock}\n`;
}

export async function verifyExistingReport(
  input: VerifyExistingReportRequest,
): Promise<VerifyExistingReportResponse> {
  const now = new Date().toISOString();
  const projectId = stableId("verify_project", input.topic, now);

  // 1. Document Ingestion & Structural Parsing (via generalized parser)
  const parsedDoc = await parseDocument(input, projectId, now);
  const { document, blocks, sections, referencesText } = parsedDoc;

  // 2. Citation Resolution (via Crossref / OpenAlex / Bibliography parser)
  const rawBibliography = parseBibliography(referencesText);
  const resolvedRefMap = await resolveReferences(rawBibliography, {
    sourceMode: input.sourceMode,
    timeoutMs: 4000,
  });

  // 3. Generalized Claim Extraction
  const extractedClaims = extractClaimsFromBlocks(blocks);

  // 4. Evidence-based Verification
  const claims: ModeBClaimAssessment[] = [];
  for (const claim of extractedClaims) {
    const verified = await verifyClaimWithEvidence(claim, resolvedRefMap);
    claims.push(verified);
  }

  // 5. Multi-dimensional Citation Health Score
  const summary = calculateCitationHealth(claims);

  // 6. Annotated Report Exports
  const annotatedMarkdown = buildAnnotatedMarkdown(
    input.topic,
    sections,
    claims,
    summary,
    referencesText,
  );

  // Snapshot for DOCX & PDF generation
  const mockSnapshotForDocx: ResearchProductWorkflowSnapshotV1 = {
    project: {
      id: projectId,
      workflowId: stableId("wf", projectId),
      schemaVersion: "researchforge.product-workflow.v1",
      version: 1,
      status: "READY",
      mode: input.sourceMode === "LIVE" ? "LIVE" : "FIXTURE",
      createdAt: now,
      updatedAt: now,
      provenance: {
        mode: input.sourceMode === "LIVE" ? "LIVE" : "LOCAL_PARSE",
        producer: "mode-b-audit",
        producerVersion: "2.0",
        parentRefs: [],
        generatedAt: now,
      },
    },
    intent: {
      id: stableId("intent", projectId),
      projectId,
      version: 1,
      topic: `${input.topic} (Mode B 審查標註報告)`,
      reportType: "既有報告審查與宣稱驗證報告",
      targetAudience: "專業評審與讀者",
      targetLanguage: "zh-TW",
      depth: "deep",
      timeframe: null,
      sourceConstraints: [],
      preferredDisciplines: [],
      excludedSourceCategories: [],
      expectedOutputFormats: ["markdown", "pdf", "docx", "json_bundle"],
      createdAt: now,
      updatedAt: now,
      provenance: {
        mode: input.sourceMode === "LIVE" ? "LIVE" : "LOCAL_PARSE",
        producer: "mode-b-audit",
        producerVersion: "2.0",
        parentRefs: [],
        generatedAt: now,
      },
    },
    questions: [],
    queries: [],
    sourceCandidates: [],
    sources: [...resolvedRefMap.entries()].map(([marker, ref], idx) => ({
      id: stableId("ref_src", marker),
      projectId,
      version: 1,
      canonicalKey: `ref:${marker}`,
      mergedCandidateIds: [stableId("ref_src", marker)],
      duplicateGroupId: null,
      title: ref.title || ref.rawText,
      authors: ref.authors,
      year: ref.year,
      venue: null,
      doi: ref.doi,
      url: ref.url,
      abstract: ref.abstract,
      language: "en",
      sourceType: "journal",
      publisher: null,
      license: null,
      admissionStatus: ref.resolved ? "ACCEPTED" : "REJECTED_UNVERIFIABLE",
      admissionReasons: [ref.resolved ? "cited_in_document" : "resolution_failed"],
      quality: {
        authority: ref.resolved ? 0.85 : 0.2,
        relevance: ref.resolved ? 0.9 : 0.2,
        recency: null,
        metadataCompleteness: ref.resolved ? 0.8 : 0.2,
        peerReviewStatus: ref.resolved ? "confirmed" : "unknown",
        openAccessStatus: "unknown",
        sourceIntegrity: "traceable",
        independence: "independent",
        conflictStatus: "none",
      },
      createdAt: now,
      updatedAt: now,
      provenance: {
        mode: ref.provenanceMode,
        producer: "citation-resolver",
        producerVersion: "2.0",
        parentRefs: [],
        generatedAt: now,
      },
    })),
    documents: [document],
    parsedBlocks: blocks,
    evidenceCards: [],
    evidenceDecisions: [],
    acceptedEvidenceSet: null,
    reportPlan: {
      id: stableId("plan", projectId),
      projectId,
      acceptedEvidenceSetId: stableId("aes", projectId),
      version: 1,
      sections: sections.map((s, idx) => ({
        id: stableId("sec", projectId, String(idx)),
        projectId,
        title: s.title,
        purpose: "Mode B 審查段落",
        order: idx,
        researchQuestionIds: [],
        candidateEvidenceIds: [],
        requiredEvidenceIds: [],
        optionalEvidenceIds: [],
        status: "ready",
        createdAt: now,
        updatedAt: now,
        provenance: {
          mode: "LOCAL_PARSE",
          producer: "mode-b-audit",
          producerVersion: "2.0",
          parentRefs: [],
          generatedAt: now,
        },
      })),
      status: "ready",
      createdAt: now,
      updatedAt: now,
      provenance: {
        mode: "LOCAL_PARSE",
        producer: "mode-b-audit",
        producerVersion: "2.0",
        parentRefs: [],
        generatedAt: now,
      },
    },
    generationRuns: [],
    generatedClaims: claims.map((c) => ({
      id: c.id,
      projectId,
      generationRunId: stableId("run", projectId),
      sectionId: stableId("sec", projectId, "0"),
      claimText: c.claimText,
      evidenceIds: [],
      citationBindingIds: [],
      status: c.verdict === "SUPPORTED" ? "verified" : "unsupported",
      createdAt: now,
      updatedAt: now,
      provenance: {
        mode: "LOCAL_PARSE",
        producer: "mode-b-audit",
        producerVersion: "2.0",
        parentRefs: [],
        generatedAt: now,
      },
    })),
    citationBindings: claims.flatMap((c) =>
      c.citationMarkers.map((marker) => ({
        id: stableId("bind", c.id, marker),
        projectId,
        claimId: c.id,
        evidenceCardId: stableId("card", c.id),
        sourceId: stableId("ref_src", marker),
        documentId: document.id,
        blockId: c.blockId,
        marker: `[${marker}]`,
        createdAt: now,
        provenance: {
          mode: "LOCAL_PARSE",
          producer: "mode-b-audit",
          producerVersion: "2.0",
          parentRefs: [],
          generatedAt: now,
        },
      })),
    ),
    verificationResults: claims.map((c) => ({
      id: stableId("vresult", c.id),
      projectId,
      claimId: c.id,
      status: c.verdict === "SUPPORTED"
        ? "SUPPORTED"
        : c.verdict === "PARTIALLY_SUPPORTED"
          ? "PARTIALLY_SUPPORTED"
          : c.verdict === "INSUFFICIENT_EVIDENCE" || c.verdict === "UNVERIFIABLE"
            ? "UNVERIFIABLE"
            : "UNSUPPORTED",
      reasonCodes: [c.verdict],
      verifier: "mode-b-verifier",
      verifierVersion: "2.0",
      verifiedAt: now,
      provenance: {
        mode: "LOCAL_PARSE",
        producer: "mode-b-audit",
        producerVersion: "2.0",
        parentRefs: [],
        generatedAt: now,
      },
    })),
    sectionContent: Object.fromEntries(
      sections.map((s, idx) => [
        stableId("sec", projectId, String(idx)),
        s.content,
      ]),
    ),
    revisions: [],
    exports: [],
    failures: [],
    events: [],
    diagnostics: {
      queryBudget: 10,
      stageTimingsMs: { verification: 150 },
      providerFailures: [],
      warnings: parsedDoc.parseWarnings,
    },
  };

  let annotatedDocxBase64: string | undefined;
  try {
    const docxBytes = await buildResearchProductDocx(mockSnapshotForDocx);
    annotatedDocxBase64 = Buffer.from(docxBytes).toString("base64");
  } catch (err) {
    // optional fallback
  }

  let annotatedPdfBase64: string | undefined;
  try {
    const pdfBytes = await buildResearchProductPdf(mockSnapshotForDocx);
    annotatedPdfBase64 = Buffer.from(pdfBytes).toString("base64");
  } catch (err) {
    // optional fallback
  }

  return {
    document,
    parsedBlocks: blocks,
    claims,
    summary,
    annotatedMarkdown,
    annotatedPdfBase64,
    annotatedDocxBase64,
  };
}
