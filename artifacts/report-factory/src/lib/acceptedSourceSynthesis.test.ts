import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "./sourceRecords.ts";
import { buildAcceptedSourceSynthesis } from "./acceptedSourceSynthesis.ts";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "accepted-synthesis-source",
    title: "Climate change evidence review",
    authors: ["Ada Lovelace"],
    year: 2025,
    abstract:
      "Anthropogenic greenhouse gas emissions and observed warming provide evidence for climate change causes and current status.",
    doi: "10.1000/synthesis",
    url: "https://doi.org/10.1000/synthesis",
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    sourceCategory: "journal_article",
    evidenceGrounding: "abstract_grounded",
    ...overrides,
  };
}

test("accepted source synthesis aggregates climate sources into causes and current status", () => {
  const synthesis = buildAcceptedSourceSynthesis([
    source({
      id: "climate-causes",
      title: "Greenhouse gas emissions and fossil fuel combustion",
      mainEvidenceFacet: "成因分析",
      evidenceSnippets: [
        {
          originalSnippet: "Anthropogenic greenhouse gas emissions from fossil fuel combustion drive climate change.",
          snippetZhTw: "人為溫室氣體排放與化石燃料燃燒是氣候變遷的重要成因。",
          matchedFacet: "成因分析",
          matchedTerms: ["greenhouse gas", "fossil fuel"],
          supportLevel: "direct",
          reasoningZhTw: "此片段直接支撐成因分析。",
          score: 18,
        },
      ],
      evidenceChain: [
        {
          facetLabelZhTw: "成因分析",
          matchedTerms: ["greenhouse gas", "fossil fuel"],
          supportLevel: "direct",
          reasoningZhTw: "溫室氣體與化石燃料燃燒共同支撐成因分析。",
        },
      ],
    }),
    source({
      id: "climate-status",
      title: "Observed warming and climate indicators",
      mainEvidenceFacet: "現況分析",
      evidenceSnippets: [
        {
          originalSnippet: "Observed warming, CO2 concentration, and sea level indicators show the current status of climate change.",
          snippetZhTw: "觀測升溫、二氧化碳濃度與海平面指標呈現氣候變遷現況。",
          matchedFacet: "現況分析",
          matchedTerms: ["observed warming", "CO2 concentration", "sea level"],
          supportLevel: "direct",
          reasoningZhTw: "此片段直接支撐現況分析。",
          score: 17,
        },
      ],
      evidenceChain: [
        {
          facetLabelZhTw: "現況分析",
          matchedTerms: ["observed warming", "sea level"],
          supportLevel: "direct",
          reasoningZhTw: "觀測升溫與海平面資料共同支撐現況分析。",
        },
      ],
    }),
  ]);

  assert.equal(synthesis.sourceCount, 2);
  assert.ok(synthesis.evidenceByFacet.causes.some((item) => item.includes("溫室氣體")));
  assert.ok(synthesis.evidenceByFacet.currentStatus.some((item) => item.includes("觀測升溫")));
  assert.ok(synthesis.mainClaimsZhTw.length >= 2);
});

test("accepted source synthesis does not create main claims without evidence snippets", () => {
  const synthesis = buildAcceptedSourceSynthesis([
    source({
      id: "metadata-only",
      title: "Climate change causes and observed warming",
      abstract: null,
      evidenceGrounding: "metadata_only",
      evidenceSummaryZhTw: "此來源標題可能相關，但沒有可驗證摘要片段。",
      evidenceSnippets: null,
      evidenceChain: [
        {
          facetLabelZhTw: "成因分析",
          matchedTerms: ["climate change"],
          supportLevel: "weak",
          reasoningZhTw: "只有題名線索，不能作為主要結論。",
        },
      ],
    }),
  ]);

  assert.deepEqual(synthesis.mainClaimsZhTw, []);
  assert.ok(synthesis.limitationsZhTw.some((item) => item.includes("缺少可驗證 evidence snippet")));
});

test("accepted source synthesis records limitations for insufficient evidence", () => {
  const synthesis = buildAcceptedSourceSynthesis([
    source({
      id: "one-weak-source",
      title: "Limited climate policy note",
      mainEvidenceFacet: "政策治理",
      evidenceSnippets: [
        {
          originalSnippet: "The note mentions climate policy but provides limited evidence.",
          snippetZhTw: "此資料提到氣候政策，但可用證據有限。",
          matchedFacet: "政策治理",
          matchedTerms: ["policy"],
          supportLevel: "weak",
          reasoningZhTw: "此片段只提供政策面向的弱線索。",
          score: 5,
        },
      ],
      evidenceGrounding: "insufficient",
    }),
  ]);

  assert.equal(synthesis.mainClaimsZhTw.length, 0);
  assert.ok(synthesis.evidenceByFacet.limitations.some((item) => item.includes("弱證據")));
  assert.ok(synthesis.limitationsZhTw.some((item) => item.includes("grounding 不足")));
  assert.ok(synthesis.recommendedReportFocusZhTw.length > 0);
});
