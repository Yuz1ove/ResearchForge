import assert from "node:assert/strict";
import test from "node:test";
import {
  assessSourceTopicIntegrity,
  buildTopicIntegrityContract,
  evidenceRoleForText,
  reconcilePotentialDirectEvidence,
  validateTopicIsolation,
} from "@workspace/api-zod/topic-integrity";

const bloodPressureContract = buildTopicIntegrityContract({
  canonicalTopic: "規律有氧運動對成人收縮壓與舒張壓的影響",
  researchQuestion: "規律有氧運動對成人收縮壓與舒張壓的影響",
  domain: "medicine",
});

test("topic integrity contract captures the required population, exposure, and outcomes", () => {
  assert.equal(bloodPressureContract.targetPopulation.label, "adults");
  assert.equal(bloodPressureContract.interventionExposure.label, "exercise_training");
  assert.deepEqual(bloodPressureContract.primaryOutcomes.map((item) => item.label), ["blood_pressure"]);
  assert.equal(bloodPressureContract.requiredEvidenceRelationship.semanticSimilarityPolicy, "CANDIDATE_SIGNAL_ONLY");
});

test("multi-stage relevance accepts a direct adult exercise blood-pressure result", () => {
  const assessment = assessSourceTopicIntegrity({ sourceId: "direct-bp", title: "Aerobic exercise reduces systolic and diastolic blood pressure in adults", abstract: "Randomized trials in adults reported reductions in systolic and diastolic blood pressure after aerobic training.", relevanceScore: 0.91 }, bloodPressureContract);
  assert.equal(assessment.metadataRelevance.primaryOutcomeProminent, true);
  assert.equal(assessment.evidenceEntailment.relationship, "direct");
  assert.equal(assessment.sourceRole, "DIRECT_FINDING");
});

test("exercise or health lexical similarity cannot substitute for the primary outcome", () => {
  const assessment = assessSourceTopicIntegrity({ sourceId: "exercise-other-outcome", title: "Exercise training and cellular aging in older adults", abstract: "The study examined telomere length and oxidative stress after resistance training.", relevanceScore: 0.97 }, bloodPressureContract);
  assert.equal(assessment.semanticRelevance.score, 0.97);
  assert.equal(assessment.evidenceEntailment.outcomeMatch, false);
  assert.equal(assessment.sourceRole, "REJECTED_OFF_TOPIC");
  assert.ok(assessment.hardExclusion.reasons.includes("outcome_mismatch"));
});

test("an incidentally measured outcome is restricted from principal findings", () => {
  const assessment = assessSourceTopicIntegrity({ sourceId: "incidental-bp", title: "Aerobic exercise and pulmonary function in older adults", abstract: "Blood pressure was measured with heart rate and oxygen saturation. Results showed significant improvements in inspiratory pressure and peak expiratory flow; conclusions concerned pulmonary function.", relevanceScore: 0.89 }, bloodPressureContract);
  assert.equal(assessment.metadataRelevance.primaryOutcomeProminent, false);
  assert.equal(assessment.sourceRole, "CONTEXTUAL_BACKGROUND");
  assert.equal(assessment.allowedSections.includes("findings"), false);
});

test("evidence-span entailment prevents secondary outcomes from leaking out of a direct paper", () => {
  const sourceAssessment = assessSourceTopicIntegrity({ sourceId: "mixed-outcome-paper", title: "Aerobic training effects on blood pressure and postural control in older adults", abstract: "Aerobic training did not significantly change blood pressure, while postural control improved after training." }, bloodPressureContract);
  assert.equal(sourceAssessment.sourceRole, "DIRECT_FINDING");
  const bloodPressureSpan = evidenceRoleForText({ text: "Resting systolic and diastolic blood pressure did not change significantly.", sourceAssessment, contract: bloodPressureContract });
  const balanceSpan = evidenceRoleForText({ text: "Postural control scores improved after training.", sourceAssessment, contract: bloodPressureContract });
  assert.equal(bloodPressureSpan.role, "DIRECT_FINDING");
  assert.equal(balanceSpan.role, "CONTEXTUAL_BACKGROUND");
});

test("direct sources expose formal summary and evidence-overview aliases", () => {
  const assessment = assessSourceTopicIntegrity({
    sourceId: "direct-section-aliases",
    title: "Aerobic exercise reduces systolic and diastolic blood pressure in adults",
    abstract: "Adults receiving aerobic training reported lower systolic and diastolic blood pressure.",
  }, bloodPressureContract);
  assert.equal(assessment.sourceRole, "DIRECT_FINDING");
  assert.ok(assessment.allowedSections.includes("executive_summary"));
  assert.ok(assessment.allowedSections.includes("evidence_overview"));
});

test("span roles separate methods and limitations inside a direct paper", () => {
  const sourceAssessment = assessSourceTopicIntegrity({
    sourceId: "direct-mixed-spans",
    title: "Aerobic exercise and blood pressure in adults",
    abstract: "A randomized trial in adults measured systolic and diastolic blood pressure after aerobic training.",
  }, bloodPressureContract);
  const method = evidenceRoleForText({
    text: "Methods: participants were randomized after eligibility screening.",
    sourceAssessment,
    contract: bloodPressureContract,
  });
  const limitation = evidenceRoleForText({
    text: "A limitation is the small sample and uncertain generalizability.",
    sourceAssessment,
    contract: bloodPressureContract,
  });
  assert.deepEqual(method.allowedSections, ["methods"]);
  assert.equal(method.role, "METHOD_CONTEXT");
  assert.deepEqual(limitation.allowedSections, ["limitations"]);
  assert.equal(limitation.role, "LIMITATION_CONTEXT");
});

test("the same policy generalizes to adolescent screen exposure and sleep outcomes", () => {
  const contract = buildTopicIntegrityContract({ canonicalTopic: "青少年螢幕使用時間與睡眠時長及睡眠品質的關聯", researchQuestion: "青少年螢幕使用時間與睡眠時長及睡眠品質的關聯", domain: "social_science" });
  const direct = assessSourceTopicIntegrity({ sourceId: "screen-sleep", title: "Screen time and sleep quality among adolescents", abstract: "Greater screen time was associated with shorter sleep duration and poorer sleep quality in high school students." }, contract);
  const outcomeOnly = assessSourceTopicIntegrity({ sourceId: "sleep-only", title: "Sleep duration and dietary quality among high school students", abstract: "The study assessed sleep quality, diet, and adolescent health without measuring screen exposure." }, contract);
  assert.equal(direct.sourceRole, "DIRECT_FINDING");
  assert.notEqual(outcomeOnly.sourceRole, "DIRECT_FINDING");
  assert.equal(outcomeOnly.allowedSections.includes("findings"), false);
});

test("the policy recognizes generative AI exposure and writing-learning outcomes for secondary students", () => {
  const contract = buildTopicIntegrityContract({
    canonicalTopic: "生成式人工智慧對高中生寫作學習的效益、限制與風險",
    researchQuestion: "生成式人工智慧對高中生寫作學習的效益、限制與風險",
    domain: "education",
  });
  assert.equal(contract.targetPopulation.label, "adolescents");
  assert.equal(contract.interventionExposure.label, "generative_ai");
  assert.deepEqual(contract.primaryOutcomes.map((item) => item.label), ["writing_learning"]);

  const direct = assessSourceTopicIntegrity({
    sourceId: "genai-writing-direct",
    title: "Impact of generative AI tools on essay writing achievement among secondary school students",
    abstract: "The study found that high school students using ChatGPT improved writing skills, while authorship risks remained.",
  }, contract);
  const wrongOutcome = assessSourceTopicIntegrity({
    sourceId: "genai-math",
    title: "Generative AI and self-regulated mathematics learning among high school students",
    abstract: "The study reported improved mathematics achievement after ChatGPT use.",
  }, contract);
  assert.equal(direct.sourceRole, "DIRECT_FINDING");
  assert.notEqual(wrongOutcome.sourceRole, "DIRECT_FINDING");
  assert.ok(wrongOutcome.hardExclusion.reasons.includes("outcome_mismatch"));
});

test("a higher-education writing study cannot satisfy the high-school direct-evidence population gate", () => {
  const contract = buildTopicIntegrityContract({
    canonicalTopic: "生成式人工智慧對高中生寫作學習的效益、限制與風險",
    researchQuestion: "生成式人工智慧對高中生寫作學習的效益、限制與風險",
    domain: "education",
  });
  const assessment = assessSourceTopicIntegrity({
    sourceId: "doi:10.31949/jell.v9i2.16302",
    title: "Exploring the Impact of Generative AI Tools on English Writing Skills among English Education Students",
    abstract: "This study explores how English Education students at a university use ChatGPT and other generative AI tools in higher education to improve grammar, organization, and writing competence.",
  }, contract);
  assert.notEqual(assessment.sourceRole, "DIRECT_FINDING");
  assert.equal(assessment.evidenceEntailment.populationMatch, "mismatch");
  assert.ok(assessment.hardExclusion.reasons.includes("population_mismatch"));
});

test("secondary students are an explicit adolescent population match", () => {
  const contract = buildTopicIntegrityContract({
    canonicalTopic: "生成式人工智慧對高中生寫作學習的效益、限制與風險",
  });
  const assessment = assessSourceTopicIntegrity({
    sourceId: "secondary-writing",
    title: "Using Generative AI Tools in Human-AI Collaborative Writing Among Secondary Students",
    abstract: "Secondary students used generative AI in collaborative writing and improved their writing skills.",
  }, contract);
  assert.equal(assessment.evidenceEntailment.populationMatch, "match");
  assert.equal(assessment.sourceRole, "DIRECT_FINDING");
});

test("an unspecified student population cannot satisfy an explicit adolescent direct-evidence contract", () => {
  const contract = buildTopicIntegrityContract({
    canonicalTopic: "生成式人工智慧對高中生寫作學習的效益、限制與風險",
  });
  const assessment = assessSourceTopicIntegrity({
    sourceId: "unspecified-students",
    title: "Generative AI and student writing skills",
    abstract: "Students using ChatGPT improved writing skills, but the educational level and age were not reported.",
  }, contract);
  assert.equal(assessment.evidenceEntailment.populationMatch, "unspecified");
  assert.notEqual(assessment.sourceRole, "DIRECT_FINDING");
  assert.ok(assessment.hardExclusion.reasons.includes("required_population_not_established"));
});

test("upper-secondary chatbot writing risks qualify as direct authorship and integrity evidence", () => {
  const contract = buildTopicIntegrityContract({
    canonicalTopic: "生成式人工智慧對高中生寫作學習的效益、限制與風險",
  });
  const assessment = assessSourceTopicIntegrity({
    sourceId: "upper-secondary-integrity-risk",
    title: "Exploring upper secondary students' chatbot-mediated writing practices",
    abstract: "Findings reveal that chatbot-mediated writing ranged from deliberate integration to outsourcing the writing to generative AI tools. These practices challenge authorship and academic integrity.",
  }, contract);
  assert.equal(assessment.sourceRole, "DIRECT_FINDING");
  const riskSpan = evidenceRoleForText({
    text: "Chatbot-mediated writing included outsourcing the writing work and challenged authorship and academic integrity.",
    sourceAssessment: assessment,
    contract,
  });
  assert.equal(riskSpan.role, "DIRECT_FINDING");
});

test("co-mentioned topic facets do not pass when their reported relationship targets another outcome", () => {
  const contract = buildTopicIntegrityContract({
    canonicalTopic: "青少年螢幕使用時間與睡眠時長及睡眠品質的關聯",
  });
  const assessment = assessSourceTopicIntegrity(
    {
      id: "co-exposure-study",
      title: "Combination of sugar-sweetened beverage consumption, screen-based sedentary time, and sleep duration and their association with adolescent mental health",
      abstract: "Results showed that the combined lifestyle risk score was associated with depression.",
    },
    contract,
  );
  assert.notEqual(assessment.sourceRole, "DIRECT_FINDING");
  assert.equal(assessment.metadataRelevance.primaryOutcomeProminent, false);
});

test("an aerobic-specific contract does not promote unrelated exercise modalities to findings", () => {
  const contract = buildTopicIntegrityContract({
    canonicalTopic: "規律有氧運動對成人收縮壓與舒張壓的影響",
  });
  const assessment = assessSourceTopicIntegrity(
    {
      id: "balance-study",
      title: "Effects of Balance-based Training on Blood Pressure and Postural Control Capacity in Older Elderly",
      abstract: "Balance training did not significantly change systolic or diastolic blood pressure.",
    },
    contract,
  );
  assert.notEqual(assessment.sourceRole, "DIRECT_FINDING");
  assert.equal(assessment.evidenceEntailment.interventionExposureMatch, false);
});

test("PM2.5 child lung-function directness rejects wrong pollutant, population, and metric", () => {
  const contract = buildTopicIntegrityContract({
    canonicalTopic: "Long-term PM2.5 exposure and lung function in children and adolescents",
  });
  const assess = (sourceId: string, title: string, abstract: string) =>
    assessSourceTopicIntegrity({ sourceId, title, abstract }, contract);
  const direct = assess(
    "pm25-direct",
    "Long-Term Exposure to Ambient Fine Particulate Matter (PM2.5) and Lung Function in Children and Adolescents",
    "Results showed that long-term PM2.5 exposure was associated with lower FEV1 and FVC among children and adolescents.",
  );
  const pm1 = assess(
    "pm1-wrong-exposure",
    "Long-term PM1 exposure and lung function in children",
    "Results showed that PM1 was associated with lower FEV1 in children.",
  );
  const adultCopd = assess(
    "adult-copd",
    "Ambient pollution and COPD risk factors in older adults",
    "This study of older adults reported COPD risk factors without lung-function measures.",
  );
  const inflammation = assess(
    "airway-inflammation",
    "PM2.5 and acute airway inflammation among children",
    "Results associated PM2.5 with airway inflammation but did not measure FEV1, FVC, or lung function.",
  );
  assert.equal(direct.sourceRole, "DIRECT_FINDING");
  assert.notEqual(pm1.sourceRole, "DIRECT_FINDING");
  assert.ok(pm1.hardExclusion.reasons.some((reason) => /exposure/u.test(reason)));
  assert.notEqual(adultCopd.sourceRole, "DIRECT_FINDING");
  assert.equal(adultCopd.evidenceEntailment.populationMatch, "mismatch");
  assert.notEqual(inflammation.sourceRole, "DIRECT_FINDING");
  assert.ok(inflammation.hardExclusion.reasons.some((reason) => /outcome|metric/u.test(reason)));
});

test("protocols are methods-only while an observed intermittent-fasting head-to-head RCT is direct", () => {
  const contract = buildTopicIntegrityContract({
    canonicalTopic: "Intermittent fasting versus continuous calorie restriction: weight loss in adults",
  });
  const protocol = assessSourceTopicIntegrity({
    sourceId: "if-protocol",
    title: "Protocol for a randomized controlled trial of intermittent fasting versus continuous calorie restriction in adults",
    abstract: "This trial protocol describes planned body-weight outcomes and the randomization procedure.",
  }, contract);
  const observed = assessSourceTopicIntegrity({
    sourceId: "if-rct-results",
    title: "Intermittent fasting versus continuous calorie restriction for weight loss in adults",
    abstract: "Results from the randomized trial showed weight loss in both groups and reported the between-group difference.",
  }, contract);
  assert.equal(protocol.sourceRole, "METHOD_CONTEXT");
  assert.ok(protocol.hardExclusion.reasons.includes("PROTOCOL_CANNOT_SUPPORT_OBSERVED_OUTCOME"));
  assert.equal(evidenceRoleForText({
    text: "Protocol methods planned to measure weight loss after randomization.",
    sourceAssessment: protocol,
    contract,
  }).reason, "PROTOCOL_CANNOT_SUPPORT_OBSERVED_OUTCOME");
  assert.equal(observed.sourceRole, "DIRECT_FINDING");
});

test("microplastic human-health evidence rejects lead and keeps animal evidence contextual", () => {
  const contract = buildTopicIntegrityContract({
    canonicalTopic: "Microplastic exposure and human health outcomes",
  });
  const lead = assessSourceTopicIntegrity({
    sourceId: "lead",
    title: "Maternal lead exposure and human health outcomes",
    abstract: "Maternal lead exposure was associated with clinical outcomes in children.",
  }, contract);
  const mouse = assessSourceTopicIntegrity({
    sourceId: "mouse",
    title: "Polystyrene microplastic exposure and adverse health outcomes in mice",
    abstract: "Microplastic exposure caused disease-related toxicological changes in mice.",
  }, contract);
  const human = assessSourceTopicIntegrity({
    sourceId: "human",
    title: "Microplastic exposure and clinical health outcomes in human participants",
    abstract: "Results associated measured microplastic exposure with clinical health outcomes in human participants.",
  }, contract);
  assert.notEqual(lead.sourceRole, "DIRECT_FINDING");
  assert.ok(lead.hardExclusion.reasons.some((reason) => /exposure/u.test(reason)));
  assert.equal(mouse.sourceRole, "CONTEXTUAL_BACKGROUND");
  assert.ok(mouse.hardExclusion.reasons.includes("ANIMAL_CANNOT_OWN_HUMAN_OUTCOME_CLAIM"));
  assert.equal(human.sourceRole, "DIRECT_FINDING");
});

test("multilingual reasoning and RAG comparisons require the requested task and comparator", () => {
  const multilingual = buildTopicIntegrityContract({
    canonicalTopic: "Low-resource multilingual LLM cross-lingual understanding and reasoning",
  });
  const reasoning = assessSourceTopicIntegrity({
    sourceId: "reasoning",
    title: "Cross-lingual reasoning in low-resource languages with multilingual LLMs",
    abstract: "Results showed improved cross-lingual reasoning and language understanding for low-resource languages.",
  }, multilingual);
  const ner = assessSourceTopicIntegrity({
    sourceId: "ner",
    title: "Cross-lingual named entity recognition with multilingual LLMs",
    abstract: "Results improved NER, relation extraction, and safety refusal classification in low-resource languages.",
  }, multilingual);
  assert.equal(reasoning.sourceRole, "DIRECT_FINDING");
  assert.notEqual(ner.sourceRole, "DIRECT_FINDING");

  const rag = buildTopicIntegrityContract({
    canonicalTopic: "RAG versus fine-tuning: accuracy, cost, and latency",
  });
  const assessRag = (sourceId: string, title: string, abstract: string) =>
    assessSourceTopicIntegrity({ sourceId, title, abstract }, rag);
  assert.equal(assessRag(
    "rag-head-to-head",
    "Retrieval-augmented generation versus fine-tuning for question answering",
    "Results directly compared RAG and fine-tuning for accuracy, inference latency, and cost.",
  ).sourceRole, "DIRECT_FINDING");
  for (const candidate of [
    assessRag("rag-only", "Retrieval-augmented generation accuracy benchmark", "Results reported RAG accuracy and latency without a fine-tuning comparator."),
    assessRag("ft-only", "Fine-tuning accuracy and cost benchmark", "Results reported fine-tuning accuracy and cost without RAG."),
    assessRag("adapter", "QLoRA versus AdaLoRA", "Results compared adapter methods for classification accuracy and latency."),
  ]) {
    assert.notEqual(candidate.sourceRole, "DIRECT_FINDING");
  }
});

test("direct-evidence reconciliation blocks false insufficient for retrieval, green space, and youth minimum wage", () => {
  const cases = [
    {
      topic: "Retrieval practice versus rereading: long-term memory retention",
      source: {
        sourceId: "retrieval",
        title: "Retrieval practice versus rereading for long-term memory retention",
        abstract: "Results showed retrieval practice improved long-term retention compared with rereading.",
      },
    },
    {
      topic: "Green space exposure and adolescent mental health",
      source: {
        sourceId: "green",
        title: "Green space exposure and mental health among adolescents",
        abstract: "Results associated greater urban green-space exposure with better mental health among adolescents.",
      },
    },
    {
      topic: "Minimum wage increases and youth employment",
      source: {
        sourceId: "wage",
        title: "Impacts of minimum wage increases on teenage employment",
        abstract: "Results estimated changes in teenage employment after a minimum-wage increase.",
      },
    },
  ];
  for (const fixture of cases) {
    const result = reconcilePotentialDirectEvidence({
      sources: [fixture.source],
      contract: buildTopicIntegrityContract({ canonicalTopic: fixture.topic }),
    });
    assert.equal(result.code, "BLOCK_EXPORT_FALSE_INSUFFICIENT", fixture.topic);
    assert.deepEqual(result.directSourceIds, [fixture.source.sourceId]);
    assert.ok(result.items[0].whyDirect.length >= 3);
    assert.equal(result.items[0].whyNotDirect.length, 0);
  }
});

test("V3 relevance recovery recognizes comparative vehicle lifecycle emissions", () => {
  const contract = buildTopicIntegrityContract({
    canonicalTopic: "Electric vehicles versus gasoline vehicles: lifecycle greenhouse gas emissions",
  });
  const assessment = assessSourceTopicIntegrity({
    sourceId: "ev-lca",
    title: "Life Cycle Assessment of Battery Electric and Internal Combustion Engine Vehicles",
    abstract: "Results from the comparative life cycle assessment showed lower greenhouse gas emissions and global warming potential for battery electric vehicles than gasoline internal combustion engine vehicles.",
  }, contract);
  assert.equal(contract.interventionExposure.label, "electric_vehicle");
  assert.equal(contract.comparator?.label, "combustion_vehicle");
  assert.equal(assessment.sourceRole, "DIRECT_FINDING");
});

test("V3 relevance recovery recognizes RAG hallucination-reduction evaluations", () => {
  const contract = buildTopicIntegrityContract({
    canonicalTopic: "effect of Retrieval-Augmented Generation on large language model hallucination",
  });
  const assessment = assessSourceTopicIntegrity({
    sourceId: "rag-eval",
    title: "Retrieval-augmented generation reduces hallucinations in large language models",
    abstract: "An empirical benchmark found that RAG improved factuality and reduced the hallucination rate across question-answering datasets.",
  }, contract);
  assert.equal(contract.interventionExposure.label, "rag");
  assert.deepEqual(contract.primaryOutcomes.map((outcome) => outcome.label), ["hallucination_reduction"]);
  assert.equal(assessment.sourceRole, "DIRECT_FINDING");
});

test("topic-isolation gate catches semantic key-phrase and lineage leakage across sequential cases", () => {
  const cases = [
    {
      workflowId: "wf-a",
      reportId: "report-a",
      topicHash: "hash-a",
      researchQuestion: "screen time and sleep quality among adolescents",
      searchQueries: ["adolescent screen use sleep duration sleep quality"],
      queryTerms: ["adolescents", "screen use", "sleep duration", "sleep quality"],
      methodText: "Key concepts included adolescents, screen use, sleep duration, and sleep quality.",
    },
    {
      workflowId: "wf-b",
      reportId: "report-b",
      topicHash: "hash-b",
      researchQuestion: "HIIT versus MICT effects on VO2max",
      searchQueries: ["HIIT MICT VO2max"],
      queryTerms: ["HIIT", "MICT", "VO2max"],
      methodText: "Key concepts included HIIT, MICT, and VO2max.",
    },
    {
      workflowId: "wf-c",
      reportId: "report-c",
      topicHash: "hash-c",
      researchQuestion: "PM2.5 exposure and child lung function",
      searchQueries: ["PM2.5 children FEV1 FVC lung function"],
      queryTerms: ["PM2.5", "children", "FEV1", "FVC", "lung function"],
      methodText: "Key concepts included PM2.5, children, FEV1, FVC, and lung function.",
    },
  ];
  for (const fixture of cases) {
    assert.equal(validateTopicIsolation({ ...fixture, stage: "pre_writer", records: [{
      workflowId: fixture.workflowId,
      reportId: fixture.reportId,
      topicHash: fixture.topicHash,
      topic: fixture.researchQuestion,
    }] }).pass, true);
  }
  const leakedIntoB = validateTopicIsolation({
    ...cases[1],
    stage: "pre_writer",
    methodText: cases[0].methodText,
    records: [{ workflowId: cases[1].workflowId, reportId: cases[1].reportId, topicHash: cases[1].topicHash, topic: cases[1].researchQuestion }],
  });
  const leakedIntoC = validateTopicIsolation({
    ...cases[2],
    stage: "pre_export",
    methodText: cases[1].methodText,
    records: [{ workflowId: cases[0].workflowId, reportId: cases[0].reportId, topicHash: cases[0].topicHash, topic: cases[0].researchQuestion }],
  });
  assert.equal(leakedIntoB.code, "TOPIC_ISOLATION_FAILED");
  assert.ok(leakedIntoB.foreignMethodConcepts.some((term) => /screen|sleep/iu.test(term)));
  assert.equal(leakedIntoC.code, "TOPIC_ISOLATION_FAILED");
  assert.ok(leakedIntoC.foreignWorkflowIds.includes("wf-a"));
  assert.ok(leakedIntoC.foreignMethodConcepts.some((term) => /HIIT|MICT|VO2/iu.test(term)));
});

test("directness structure generalizes across six unseen domains", () => {
  const unseen = [
    {
      topic: "Omega-3 supplementation and depressive symptoms in adults: systematic evidence on symptom reduction",
      title: "Omega-3 supplementation reduces depressive symptoms in adults",
      abstract: "A systematic review of adults reported reduced depressive symptoms after Omega-3 supplementation.",
    },
    {
      topic: "Remote work versus office work: effects on productivity and employee well-being",
      title: "Remote work versus office work: productivity and employee well-being",
      abstract: "Results compared remote work with office work and reported productivity and employee well-being outcomes.",
    },
    {
      topic: "Electric vehicles versus internal-combustion vehicles: life-cycle greenhouse gas emissions",
      title: "Electric vehicles versus internal-combustion vehicles: life-cycle greenhouse gas emissions",
      abstract: "Results compared life-cycle greenhouse gas emissions for electric vehicles and internal-combustion vehicles.",
    },
    {
      topic: "Spacing effect versus massed practice: long-term vocabulary retention",
      title: "Spacing effect versus massed practice for long-term vocabulary retention",
      abstract: "Results showed better long-term vocabulary retention with the spacing effect than massed practice.",
    },
    {
      topic: "Urban heat islands and cardiovascular mortality among older adults",
      title: "Urban heat islands and cardiovascular mortality among older adults",
      abstract: "Results associated urban heat islands with higher cardiovascular mortality among older adults.",
    },
    {
      topic: "Large language model agents versus single-pass LLM prompting: task completion accuracy, latency, and token cost",
      title: "Large language model agents versus single-pass LLM prompting",
      abstract: "Results compared task completion accuracy, latency, and token cost for large language model agents and single-pass LLM prompting.",
    },
  ];
  for (const [index, fixture] of unseen.entries()) {
    const assessment = assessSourceTopicIntegrity({
      sourceId: `unseen-${index + 1}`,
      title: fixture.title,
      abstract: fixture.abstract,
    }, buildTopicIntegrityContract({ canonicalTopic: fixture.topic }));
    assert.equal(assessment.sourceRole, "DIRECT_FINDING", `${fixture.topic}: ${assessment.topicIntegrityReason}`);
  }
});
