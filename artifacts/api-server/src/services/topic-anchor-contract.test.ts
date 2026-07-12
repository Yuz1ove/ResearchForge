import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  searchIntentSources,
  searchAcademicProviderGroupsForTesting,
  type SearchIntentPlan,
} from "./search-intent-planner";
import {
  buildContractAnchorQuery,
  buildTopicAnchorContract,
  containsAnchorTerm,
  isIdentifierLookupQuery,
  repairTopicTextWithAnchors,
  validateAndRepairTopicQuery,
  validateTopicTextAgainstContract,
  type TopicAnchorContract,
} from "./topic-anchor-contract";

const acceptanceCases = [
  {
    label: "basil photoperiod",
    topic: "不同光照週期對羅勒生長速度與葉片葉綠素含量的影響",
    invalid: [
      "biology ecology ecosystem geographic features spatial distribution land use change",
      "academic_evidence biology",
    ],
    valid: "basil photoperiod growth rate leaf chlorophyll content effect",
  },
  {
    label: "pavement heat island",
    topic: "不同道路鋪面材料對都市熱島效應與地表溫度的影響",
    invalid: [
      "urban heat island climate adaptation remote sensing environmental governance ecosystem monitoring data",
      "urban heat island remote sensing",
    ],
    valid: "road pavement materials urban heat island land surface temperature effect",
  },
  {
    label: "spaced learning vocabulary memory",
    topic: "間隔學習與集中學習對高中生英文單字長期記憶的影響",
    invalid: [
      "education student learning instructional intervention learning outcome revision quality student performance",
      "peer feedback second language writing revision quality",
    ],
    valid: "spaced learning massed learning high school students English vocabulary retention effect",
  },
  {
    label: "social abbreviations formal Chinese writing",
    topic: "社群媒體縮寫對青少年正式中文寫作表達的影響",
    invalid: [
      "peer feedback second language writing revision quality",
      "EFL writing revision quality adolescents",
    ],
    valid: "social media abbreviations adolescents formal Chinese writing effect",
  },
  {
    label: "wind turbine blade angle",
    topic: "風力發電機葉片角度對低風速環境發電效率的影響",
    invalid: [
      "power conversion efficiency photovoltaic performance solar cell efficiency environmental governance ecosystem monitoring data",
      "photovoltaic surface texture anti-reflection power output",
    ],
    valid: "wind turbine blade pitch low wind speed power generation efficiency effect",
  },
] as const;

function contractFor(topic: string, canonicalTopicEn?: string): TopicAnchorContract {
  return buildTopicAnchorContract({
    topic,
    originalTopic: topic,
    canonicalTopic: topic,
    canonicalTopicEn,
    language: "zh-TW",
  });
}

test("topic anchor contract rejects A-E normalized drift and accepts anchored queries", () => {
  for (const item of acceptanceCases) {
    const contract = contractFor(item.topic);
    assert.ok(contract.anchors.length >= 3, `${item.label} should extract anchors`);
    assert.equal(
      contract.originalTopicHash,
      createHash("sha256").update(item.topic).digest("hex").slice(0, 16),
      `${item.label} hash should be derived from original topic`,
    );

    for (const drift of item.invalid) {
      const validation = validateTopicTextAgainstContract(drift, contract);
      assert.equal(validation.valid, false, `${item.label} should reject ${drift}`);
      assert.ok(
        validation.reasonCodes.length > 0,
        `${item.label} should expose rejection reason codes`,
      );
    }

    const accepted = validateTopicTextAgainstContract(item.valid, contract);
    assert.equal(accepted.valid, true, `${item.label} should accept anchored query`);
    assert.equal(accepted.missingAnchorIds.length, 0);
  }
});

test("topic anchor matching normalizes unicode, case, hyphenation, punctuation, and boundaries", () => {
  assert.equal(containsAnchorTerm("LOW-WIND-SPEED wind turbine", "low wind speed"), true);
  assert.equal(containsAnchorTerm("social-media abbreviations", "social media abbreviations"), true);
  assert.equal(containsAnchorTerm("葉片角度，低風速。", "葉片角度"), true);
  assert.equal(containsAnchorTerm("Ocimum Basilicum photoperiod", "ocimum basilicum"), true);
  assert.equal(containsAnchorTerm("massing study", "mass"), false);
  assert.equal(containsAnchorTerm("wind", "wind turbine"), false);
  assert.equal(containsAnchorTerm("formal Chinese written expression", "write"), false);
  assert.equal(containsAnchorTerm("solar cell", "wind turbine"), false);
});

test("topic anchor contracts are immutable and do not share anchor arrays", () => {
  const topic = acceptanceCases[0].topic;
  const first = contractFor(topic);
  const second = contractFor(topic);

  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.anchors), true);
  assert.equal(Object.isFrozen(first.anchors[0]), true);
  assert.notEqual(first.anchors, second.anchors);
  assert.throws(() => {
    (first.anchors as unknown as unknown[]).push({ id: "mutated" });
  }, TypeError);
});

test("query repair is bounded to original anchors and generic drift fails closed", () => {
  const contract = contractFor(acceptanceCases[0].topic);
  const repaired = repairTopicTextWithAnchors("basil photoperiod chlorophyll content", contract);
  assert.ok(repaired);
  assert.equal(validateTopicTextAgainstContract(repaired ?? "", contract).valid, true);

  const generic = validateAndRepairTopicQuery("ecology", contract, {
    id: "generic:0",
    role: "primary",
    repair: true,
  });
  assert.equal(generic.status, "rejected");
  assert.ok(generic.reasonCodes.includes("REQUIRED_PHRASE_MISSING"));
});

test("identifier lookup exception only allows traceable identifiers", () => {
  const contract = contractFor(acceptanceCases[4].topic);
  assert.equal(isIdentifierLookupQuery("doi:10.1234/example.paper"), true);
  assert.equal(isIdentifierLookupQuery("photovoltaic surface texture"), false);

  const identifier = validateAndRepairTopicQuery("doi:10.1234/example.paper", contract, {
    id: "identifier:0",
    role: "identifier_lookup",
  });
  assert.equal(identifier.status, "valid");

  const freeText = validateAndRepairTopicQuery("photovoltaic surface texture", contract, {
    id: "identifier:1",
    role: "identifier_lookup",
  });
  assert.equal(freeText.status, "rejected");
  assert.deepEqual([...freeText.reasonCodes], ["IDENTIFIER_LOOKUP_TRACE_MISSING"]);
});

test("contract anchor query is deterministic and validates against its contract", () => {
  for (const item of acceptanceCases) {
    const contract = contractFor(item.topic);
    const query = buildContractAnchorQuery(contract, "en");
    assert.equal(validateTopicTextAgainstContract(query, contract).valid, true, item.label);
  }
});

test("provider boundary rejects invalid academic query before fetch", async () => {
  const topic = acceptanceCases[4].topic;
  const contract = contractFor(topic, "photovoltaic surface texture anti-reflection power output");
  const plan: SearchIntentPlan = {
    normalizedTopic: "photovoltaic surface texture anti-reflection power output",
    primaryConcepts: [],
    contextConcepts: [],
    outcomeConcepts: [],
    populationConcepts: [],
    lowWeightTerms: [],
    mustHaveTerms: [],
    shouldHaveTerms: [],
    penaltyTerms: [],
    negativeTerms: [],
    chineseQueries: [],
    englishQueries: [],
    reasoningNotes: [],
    plannerStatus: "rule_fallback",
    fallbackUsed: true,
    originalTopic: topic,
    activeResearchTopic: topic,
    canonicalTopicZh: topic,
    canonicalEnglishTopic: "photovoltaic surface texture anti-reflection power output",
    topicAnchorContract: contract,
    topicAnchorValidation: validateTopicTextAgainstContract(
      "photovoltaic surface texture anti-reflection power output",
      contract,
    ),
    topicAnchorRepairAttempted: false,
    topicAnchorFailureReason: null,
  };
  let fetchCalls = 0;
  const groups = await searchAcademicProviderGroupsForTesting({
    queries: ["photovoltaic surface texture anti-reflection power output"],
    plan,
    activeProviders: new Set(["OpenAlex"]),
    options: {
      sourceSearch: {
        providers: ["OpenAlex"],
        providerConfigs: {
          OpenAlex: {
            provider: "OpenAlex",
            endpoint: "https://example.test/openalex/works",
            timeoutMs: 50,
            queryLimit: 1,
            pageLimit: 1,
            headers: { Accept: "application/json" },
          },
        },
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response(JSON.stringify({ results: [] }));
        },
      },
    },
  });

  assert.equal(fetchCalls, 0);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.ok, false);
  assert.match(groups[0]?.error_message ?? "", /TOPIC_ANCHOR_CONTRACT_REJECTED/);
});

test("source search diagnostics preserve A-E original topic anchors after planner drift", async () => {
  for (const item of acceptanceCases) {
    const driftSeed = item.invalid[0];
    const contract = contractFor(item.topic, driftSeed);
    const result = await searchIntentSources(
      {
        topic: item.topic,
        originalTopic: item.topic,
        canonicalTopicZh: item.topic,
        canonicalTopicEn: driftSeed,
        querySeedEn: [driftSeed],
        reportType: "研究報告",
        audience: "高中",
        language: "zh-TW",
      },
      {
        llm: { apiKey: "" },
        queryLimit: 1,
        bypassCache: true,
        webFallback: { enabled: false },
        runtimeBudget: {
          overallSearchBudgetMs: 5000,
          perQueryTimeoutMs: 100,
          maxConcurrentProviderRequests: 1,
        },
        sourceSearch: {
          providers: ["OpenAlex"],
          providerConfigs: {
            OpenAlex: {
              provider: "OpenAlex",
              endpoint: "https://example.test/openalex/works",
              timeoutMs: 50,
              queryLimit: 1,
              pageLimit: 1,
              headers: { Accept: "application/json" },
            },
          },
          fetchImpl: async () => new Response(JSON.stringify({ results: [] })),
        },
      },
    );

    assert.equal(result.topicHash, contract.originalTopicHash, item.label);
    assert.equal(result.planner.topicAnchorValidation?.valid, true, item.label);
    assert.equal(result.diagnostics.topicAnchorValidation?.valid, true, item.label);
    assert.equal(result.diagnostics.topicAnchorRepairAttempted, true, item.label);
    assert.ok((result.diagnostics.plannedQueryCount ?? 0) > 0, item.label);
    assert.ok((result.diagnostics.repairedQueryCount ?? 0) >= 0, item.label);

    const providerQueries = result.diagnostics.providerQueries ?? [];
    assert.ok(providerQueries.length > 0, item.label);
    assert.ok(
      providerQueries.some((query) => validateTopicTextAgainstContract(query, contract).valid),
      `${item.label} should expose at least one provider-bound anchored query`,
    );
    for (const drift of item.invalid) {
      assert.equal(
        providerQueries.some((query) => query === drift),
        false,
        `${item.label} should not send drift seed verbatim to providers`,
      );
    }
  }
});
