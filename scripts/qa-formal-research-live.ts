import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { EvidenceCard, GroundingJob, SourceCandidate } from "@workspace/api-zod/research-grounding";
import type { ReportInput } from "../artifacts/report-factory/src/lib/generateReport.ts";
import { requestLlmReportDraft } from "../artifacts/report-factory/src/lib/llmReportWriter.ts";
import { sourceCandidateToSourceRecord } from "../artifacts/report-factory/src/lib/researchGrounding.ts";
import type { SourceRecord } from "../artifacts/report-factory/src/lib/sourceRecords.ts";

type Json = Record<string, unknown>;

const apiOrigin = process.env.RESEARCHFORGE_QA_API_ORIGIN ?? "http://127.0.0.1:3110";
const apiBase = `${apiOrigin.replace(/\/+$/u, "")}/api`;
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const timestamp = new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "");
const outputDir = path.resolve(
  repositoryRoot,
  process.env.RESEARCHFORGE_QA_OUTPUT_DIR ??
    path.join("artifacts", "qa", `researchforge-formal-research-ready-${timestamp}`),
);
const protectedFixture = path.join(
  repositoryRoot,
  "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json",
);
const expectedProtectedSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const nativeFetch = globalThis.fetch;

const topics = [
  {
    slug: "exercise-blood-pressure",
    topic: "規律有氧運動對成人收縮壓與舒張壓的影響",
    normalizedTopic: "規律有氧運動對成人收縮壓與舒張壓的影響",
    domain: "醫療／長照／社工／心理",
    queries: {
      zh: ["有氧運動 成人 收縮壓 舒張壓 隨機試驗", "規律運動 成人 血壓 系統性回顧"],
      en: ["aerobic exercise adults systolic diastolic blood pressure randomized trial", "exercise training adult blood pressure systematic review"],
    },
  },
  {
    slug: "adolescent-screen-sleep",
    topic: "青少年螢幕使用時間與睡眠時長及睡眠品質的關聯",
    normalizedTopic: "Associations of screen time with sleep duration and sleep quality in adolescents",
    domain: "社會議題",
    queries: {
      zh: ["青少年 螢幕時間 睡眠時長 睡眠品質", "高中生 數位媒體使用 睡眠 系統性回顧"],
      en: ["adolescent screen time sleep duration sleep quality", "digital media use adolescent sleep systematic review"],
    },
  },
  {
    slug: "case-b",
    topic: "生成式人工智慧對高中生寫作學習的效益、限制與風險",
    normalizedTopic: "Benefits, limitations, and risks of generative artificial intelligence for high school students' writing learning",
    domain: "教育研究／人工智慧",
    queries: {
      zh: [
        "生成式人工智慧 高中生 寫作學習 效益 限制 風險",
        "ChatGPT 中學生 寫作 學習成效 學術誠信 研究",
      ],
      en: [
        "generative AI high school students writing learning benefits risks empirical study",
        "ChatGPT secondary education student writing achievement limitations academic integrity",
      ],
    },
  },
  {
    slug: "gen-ai-high-school-learning",
    topic: "生成式人工智慧輔助高中生學習對學習成效、認知負荷與學術誠信的影響",
    normalizedTopic: "Effects of generative AI assisted learning on learning outcomes, cognitive load, and academic integrity among high school students",
    domain: "教育研究／人工智慧",
    queries: {
      zh: [
        "生成式人工智慧 高中生 學習成效 認知負荷 學術誠信 實證研究",
        "ChatGPT 中學生 學習成效 認知負荷 學術誠信 研究",
      ],
      en: [
        "generative AI high school students learning outcomes cognitive load academic integrity empirical study",
        "ChatGPT secondary school learning achievement cognitive load academic integrity study",
      ],
    },
  },
  {
    slug: "rag-vs-llm-knowledge-qa",
    topic: "檢索增強生成（RAG）與純大型語言模型在知識密集型問答中的正確性、引用可靠性與成本差異",
    normalizedTopic: "Differences between retrieval-augmented generation and standalone large language models in accuracy, citation reliability, and cost for knowledge-intensive question answering",
    domain: "資訊工程／人工智慧",
    queries: {
      zh: [
        "檢索增強生成 純大型語言模型 知識密集問答 正確性 引用可靠性 成本",
        "RAG LLM 問答 引用忠實度 成本 實證比較",
      ],
      en: [
        "retrieval augmented generation versus standalone large language model knowledge intensive question answering accuracy citation reliability cost",
        "RAG LLM factuality citation faithfulness cost empirical comparison",
      ],
    },
  },
  {
    slug: "urban-green-adolescent-mental-health",
    topic: "都市綠地暴露與青少年心理健康之間的關聯：憂鬱、焦慮與幸福感的證據綜合",
    normalizedTopic: "Association between urban green-space exposure and adolescent mental health including depression, anxiety, and well-being",
    domain: "公共衛生／環境健康",
    queries: {
      zh: [
        "都市綠地 青少年 心理健康 憂鬱 焦慮 幸福感",
        "綠地暴露 青少年 憂鬱 焦慮 系統性回顧",
      ],
      en: [
        "urban green space exposure adolescent mental health depression anxiety wellbeing",
        "greenspace adolescents depression anxiety systematic review cohort",
      ],
    },
  },
  {
    slug: "sleep-academic-performance",
    topic: "睡眠不足與高中生學業表現之間的關聯",
    normalizedTopic: "Association between insufficient sleep and academic performance among high school students",
    domain: "教育研究／公共衛生",
    queries: {
      zh: ["睡眠不足 高中生 學業表現 觀察研究", "青少年 睡眠時長 學業成就 混雜因素"],
      en: ["insufficient sleep high school students academic performance observational study", "adolescent sleep duration academic achievement confounding"],
    },
  },
  {
    slug: "retrieval-practice-vs-rereading",
    topic: "檢索練習（retrieval practice）相較於重讀對長期記憶保留效果的影響",
    normalizedTopic: "Effects of retrieval practice versus rereading on long-term memory retention",
    domain: "教育心理",
    queries: {
      zh: ["檢索練習 重讀 長期記憶保留 實驗", "測驗效應 重讀 延宕記憶 效果量"],
      en: ["retrieval practice versus rereading long term retention experiment", "testing effect rereading delayed memory retention effect size"],
    },
  },
  {
    slug: "hiit-vs-mict",
    topic: "高強度間歇訓練（HIIT）與中等強度持續訓練（MICT）對心肺適能改善效果的比較",
    normalizedTopic: "Comparison of HIIT and MICT effects on cardiorespiratory fitness improvement",
    domain: "運動科學／健康",
    queries: {
      zh: ["HIIT MICT 心肺適能 VO2max 隨機試驗", "高強度間歇訓練 中等強度持續訓練 VO2peak 統合分析"],
      en: ["HIIT versus MICT cardiorespiratory fitness VO2max randomized trial", "high intensity interval training moderate continuous training VO2peak meta analysis"],
    },
  },
  {
    slug: "intermittent-fasting-vs-calorie-restriction",
    topic: "間歇性斷食與持續熱量限制對成年人減重效果的比較",
    normalizedTopic: "Comparison of intermittent fasting and continuous calorie restriction for weight loss in adults",
    domain: "營養／臨床醫學",
    queries: {
      zh: ["間歇性斷食 持續熱量限制 成人 減重 隨機試驗", "間歇性斷食 熱量限制 體重 BMI 統合分析"],
      en: ["intermittent fasting versus continuous calorie restriction adults weight loss randomized trial", "intermittent energy restriction continuous restriction body weight BMI meta analysis"],
    },
  },
  {
    slug: "pm25-lung-function",
    topic: "長期 PM2.5 暴露與兒童及青少年肺功能的關聯",
    normalizedTopic: "Association between long-term PM2.5 exposure and lung function in children and adolescents",
    domain: "環境健康／公共衛生",
    queries: {
      zh: ["長期 PM2.5 暴露 兒童 青少年 肺功能 世代研究", "PM2.5 FEV1 FVC 兒童 劑量反應"],
      en: ["long term PM2.5 exposure children adolescents lung function cohort", "PM2.5 FEV1 FVC children dose response"],
    },
  },
  {
    slug: "green-space-mental-health",
    topic: "都市綠地暴露與青少年心理健康之間的關聯",
    normalizedTopic: "Association between urban green space exposure and adolescent mental health",
    domain: "都市研究／公共衛生",
    queries: {
      zh: ["都市綠地暴露 青少年 心理健康 NDVI 距離 可及性", "綠地 青少年 憂鬱 焦慮 幸福感 觀察研究"],
      en: ["urban green space exposure adolescent mental health NDVI distance accessibility", "greenspace adolescents depression anxiety wellbeing observational study"],
    },
  },
  {
    slug: "genai-writing-education",
    topic: "生成式人工智慧輔助寫作對學生學習成果、寫作品質與原創性的影響",
    normalizedTopic: "Effects of generative AI assisted writing on student learning outcomes writing quality and originality",
    domain: "教育研究／人工智慧",
    queries: {
      zh: ["生成式人工智慧 輔助寫作 學生 學習成果 寫作品質 原創性", "ChatGPT 學生寫作 實驗 原創性 學習成效"],
      en: ["generative AI assisted writing students learning outcomes writing quality originality empirical study", "ChatGPT student writing experiment originality learning achievement"],
    },
  },
  {
    slug: "rag-vs-finetuning",
    topic: "Retrieval-Augmented Generation（RAG）與 Fine-Tuning 在領域問答任務中的準確率、成本與延遲比較",
    normalizedTopic: "Comparison of RAG and fine-tuning for domain question answering accuracy cost and latency",
    domain: "資訊工程／人工智慧",
    queries: {
      zh: [
        "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks RAG 微調 領域問答 實證比較",
        "Fine-Tuning or Retrieval Comparing Knowledge Injection in LLMs 問答 benchmark 成本 延遲",
      ],
      en: [
        "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks Lewis 2020 empirical question answering",
        "Fine-Tuning or Retrieval Comparing Knowledge Injection in LLMs domain question answering benchmark",
      ],
    },
  },
  {
    slug: "low-resource-multilingual-llm",
    topic: "大型語言模型在低資源語言上的跨語言理解與推理表現",
    normalizedTopic: "Cross-lingual understanding and reasoning performance of large language models in low-resource languages",
    domain: "自然語言處理／人工智慧",
    queries: {
      zh: ["大型語言模型 低資源語言 跨語言理解 推理 benchmark", "多語言 LLM 低資源語言 評測 模型版本"],
      en: ["large language models low resource languages cross lingual understanding reasoning benchmark", "multilingual LLM low-resource language evaluation model version"],
    },
  },
  {
    slug: "lfp-vs-nmc-battery",
    topic: "LFP 與 NMC 鋰離子電池在能量密度、循環壽命與熱安全上的比較",
    normalizedTopic: "Comparison of LFP and NMC lithium-ion batteries in energy density cycle life and thermal safety",
    domain: "電池工程／材料科學",
    queries: {
      zh: ["LFP NMC 鋰離子電池 能量密度 循環壽命 熱安全 比較", "磷酸鐵鋰 三元鋰 電池 熱失控 cycle life energy density"],
      en: ["LFP versus NMC lithium ion battery energy density cycle life thermal safety comparison", "lithium iron phosphate nickel manganese cobalt thermal runaway cycle life energy density"],
    },
  },
  {
    slug: "minimum-wage-youth-employment",
    topic: "最低工資調升對青年就業的影響",
    normalizedTopic: "Effects of minimum wage increases on youth employment",
    domain: "經濟政策／公共政策",
    queries: {
      zh: ["最低工資 調升 青年就業 差異中的差異", "最低工資 青少年 青年 就業 準實驗 衝突證據"],
      en: ["minimum wage increase youth employment difference in differences", "minimum wage teenage young adult employment quasi experimental conflicting evidence"],
    },
  },
  {
    slug: "microplastics-human-health",
    topic: "微塑膠暴露對人類健康結果的現有證據",
    normalizedTopic: "Current evidence on microplastic exposure and human health outcomes",
    domain: "環境健康／毒理學",
    queries: {
      zh: ["微塑膠暴露 人類健康結果 人體研究", "微塑膠 人體健康 流行病學 生物標誌 系統性回顧"],
      en: ["microplastic exposure human health outcomes human study", "microplastics human epidemiology biomarkers systematic review"],
    },
  },
] as const;

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function shaFile(filename: string): string {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function writeJson(directory: string, name: string, value: unknown): void {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(directory: string, name: string, value: string): void {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

async function api(endpoint: string, init?: RequestInit, timeoutMs = 600_000): Promise<{ status: number; body: unknown; durationMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await nativeFetch(`${apiBase}${endpoint}`, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 2_000) }; }
    return { status: response.status, body, durationMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

function reportInput(topic: typeof topics[number], sources: SourceRecord[]): ReportInput {
  return {
    topic: topic.topic,
    researchReportMode: "formal_research_report",
    citationDisplayMode: "academic",
    reportType: "正式二手研究報告",
    academicLevel: "專業",
    targetAudience: "評審",
    researchDepth: "deep",
    purpose: "依可追溯研究證據回答研究問題，呈現跨研究一致性、差異、數值結果與限制",
    domainOverride: topic.domain,
    mode: "直接生成完整報告",
    sourceRequirement: "所有事實與數值主張必須綁定 evidence span",
    citationFormat: "APA",
    chartRequirement: "僅輸出通過 CHART_EVIDENCE_GATE 的圖表",
    style: "正式學術繁體中文；theme-first 與 claim-first，不逐篇摘要",
    length: "證據支持範圍內的正式報告",
    wordCount: "2600",
    formalTone: "需要",
    conversationalTone: "不需要",
    specifiedStructure: "FORMAL_RESEARCH_REPORT canonical schema",
    rubric: "單一 claim owner；禁止跨章逐句重複；Methods 只寫實際流程；結論不得新增主張；數值需有來源 span。",
    personalStyle: "",
    supplementalMaterials: "",
    outputLanguage: "繁體中文",
    rewriteSection: "",
    additionalInfo: "摘要與部分全文必須清楚標示取得範圍；不得暗示已進行 meta-analysis。",
    acceptedSources: sources,
  };
}

function sourceRecords(job: GroundingJob, topic: typeof topics[number]): SourceRecord[] {
  const candidates = list<SourceCandidate>(job.acceptedSources);
  return candidates.map((candidate) => sourceCandidateToSourceRecord({
    candidate,
    workflowId: job.workflowId,
    topicHash: job.topicHash,
    queryPlanHash: String(record(job.queryPlan).queryPlanHash ?? job.topicHash),
    originalTopic: topic.topic,
  }));
}

function markdownReport(topic: string, sections: Json[], architecture: Json): string {
  const studies = list<Json>(architecture.studies);
  const quantitative = list<Json>(architecture.quantitativeFindings);
  const visuals = list<Json>(architecture.visualizationPlan);
  return [
    `# ${topic}`,
    "",
    ...sections.flatMap((section) => [
      `## ${String(section.title ?? section.sectionId ?? "未命名章節")}`,
      "",
      String(section.prose ?? ""),
      "",
    ]),
    "## Appendix — Evidence access",
    "",
    ...studies.map((study) => `- ${String(study.title ?? study.sourceId)} — ${String(study.contentAccessState ?? study.evidenceAvailability ?? "unknown")}`),
    "",
    "## Appendix — Quantitative findings",
    "",
    ...(quantitative.length ? quantitative.map((finding) => `- ${String(finding.narrativeText ?? finding.quantitativeFindingId)}`) : ["- 本次沒有可安全整合的定量 finding。"]),
    "",
    "## Appendix — Visualization decisions",
    "",
    ...visuals.map((visual) => `- ${String(visual.title ?? visual.kind)}: ${String(visual.status)}; ${String(visual.sourceNote ?? list(visual.rejectionReasons).join("；"))}`),
  ].join("\n");
}

async function runTopic(topic: typeof topics[number]): Promise<Json> {
  const directory = path.join(outputDir, topic.slug);
  const savedGroundingPath = path.join(directory, "grounding-job.json");
  let job: GroundingJob;
  let jobId: string;
  let workflowId: string;
  if (process.env.RESEARCHFORGE_QA_REUSE_GROUNDING_JOB === "1") {
    job = JSON.parse(fs.readFileSync(savedGroundingPath, "utf8")) as GroundingJob;
    jobId = job.jobId;
    workflowId = job.workflowId;
  } else {
    workflowId = `qa-formal-${topic.slug}-${Date.now()}`;
    const create = await api("/research-grounding-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflowId,
        requestId: `${workflowId}-request`,
        attemptId: `${workflowId}-attempt-1`,
        topic: topic.topic,
        rawUserTopic: topic.topic,
        originalTopic: topic.topic,
        normalizedTopic: topic.normalizedTopic,
        selectedDomain: topic.domain,
        researchQuestion: topic.topic,
        bilingualQueries: topic.queries,
        querySeedZh: topic.queries.zh,
        querySeedEn: topic.queries.en,
        reportType: "正式二手研究報告",
        audience: "專業",
        searchProfile: "deep",
        debugTrace: true,
      }),
    });
    writeJson(directory, "grounding-create-response.json", create);
    const createBody = record(create.body);
    jobId = String(createBody.jobId ?? "");
    if (!jobId) {
      return { topic: topic.topic, verdict: "FORMAL_RESEARCH_REPORT_BLOCKED_PROVIDER", reason: "GROUNDING_JOB_NOT_CREATED", create };
    }
    const fetched = await api(`/research-grounding-jobs/${encodeURIComponent(jobId)}`);
    writeJson(directory, "grounding-job.json", fetched.body);
    job = fetched.body as GroundingJob;
  }
  const sources = sourceRecords(job, topic);
  const evidenceCards = list<EvidenceCard>(job.evidenceCards);
  writeJson(directory, "accepted-sources.json", sources);
  writeJson(directory, "grounding-evidence-cards.json", evidenceCards);
  if (job.status === "failed" || sources.length < 3 || evidenceCards.length === 0) {
    return {
      topic: topic.topic,
      verdict: "FORMAL_RESEARCH_REPORT_BLOCKED_PROVIDER",
      reason: job.status === "failed" ? "GROUNDING_PIPELINE_FAILED" : "INSUFFICIENT_ACCEPTED_EVIDENCE",
      groundingStatus: job.status,
      acceptedSources: sources.length,
      evidenceCards: evidenceCards.length,
      providerErrors: job.providerErrors ?? [],
      warnings: job.warnings,
    };
  }
  if (process.env.RESEARCHFORGE_QA_GROUNDING_ONLY === "1") {
    return {
      topic: topic.topic,
      verdict: "FORMAL_RESEARCH_GROUNDING_READY",
      groundingStatus: job.status,
      searchedCandidates: list(job.sourceCandidates).length,
      acceptedSources: sources.length,
      evidenceCards: evidenceCards.length,
      writerAttempted: false,
    };
  }

  const apiTrace: Json[] = [];
  let writerRequests = 0;
  let evidenceSetRequests = 0;
  globalThis.fetch = (async (request, init) => {
    const rawUrl = String(request);
    const resolved = rawUrl.startsWith("/api/") ? `${apiOrigin}${rawUrl}` : rawUrl;
    if (/\/api\/report-drafts(?:\?|$)/u.test(rawUrl)) writerRequests += 1;
    if (/\/api\/report-evidence-sets(?:\?|$)/u.test(rawUrl)) evidenceSetRequests += 1;
    const started = performance.now();
    const response = await nativeFetch(resolved, init);
    if (/\/api\/(?:report-evidence-sets|report-drafts)/u.test(rawUrl)) {
      let requestBody: unknown = null;
      let responseBody: unknown = null;
      try { requestBody = JSON.parse(String(init?.body ?? "null")); } catch { requestBody = null; }
      try { responseBody = await response.clone().json(); } catch { responseBody = null; }
      apiTrace.push({ endpoint: rawUrl, status: response.status, durationMs: Math.round(performance.now() - started), request: requestBody, response: responseBody });
    }
    return response;
  }) as typeof fetch;

  let writer;
  try {
    writer = await requestLlmReportDraft({
      reportInput: reportInput(topic, sources),
      workflowId,
      jobId,
      topicHash: job.topicHash,
      originalTopic: topic.topic,
      displayTitle: topic.topic,
      acceptedSources: sources,
      evidenceCards: evidenceCards as unknown as import("../artifacts/report-factory/src/lib/evidenceCards.ts").EvidenceCard[],
      reportPlan: job.reportPlan,
      generationMode: "complete_research_report",
      timeoutMs: 720_000,
    });
  } finally {
    globalThis.fetch = nativeFetch;
  }
  writeJson(directory, "production-api-trace.json", apiTrace);
  writeJson(directory, "live-call-counts.json", {
    contentBearingReportDraftRequests: writerRequests,
    evidenceSetPreflightRequests: evidenceSetRequests,
    transportRetries: 0,
    contentReruns: 0,
  });
  writeJson(directory, "writer-response.json", writer);
  const architecture = record(writer.formalResearchArchitecture);
  const validation = record(writer.formalResearchValidation);
  const duplicateValidation = record(validation.duplicateValidation);
  const quantitativeValidation = record(validation.quantitativeValidation);
  const integrationValidation = record(validation.quantitativeIntegrationValidation);
  const synthesisValidation = record(validation.synthesisValidation);
  const diagnostics = record(architecture.diagnostics);
  const sections = list<Json>(writer.sections);
  const attempts = list<Json>(record(writer.writerDiagnostics).writerAttempts);
  const providerFailures = attempts.map((attempt) => String(attempt.failureCategory ?? "")).filter(Boolean);
  const quotaBlocked = providerFailures.some((category) => /PROVIDER_(?:QUOTA|AUTH|RATE_LIMIT)/u.test(category)) || writer.reportGenerationStatus === "quota_exceeded";
  const visualizationPlan = list<Json>(architecture.visualizationPlan);
  const visualizationPass = visualizationPlan.every((visual) => {
    const status = String(visual.status ?? "");
    if (status === "APPROVED") {
      return list(visual.sourceIds).length > 0 && Boolean(visual.type) && Boolean(visual.derivationRule) && Boolean(visual.caption) && Boolean(visual.provenance);
    }
    return status === "INSUFFICIENT_COMPARABLE_DATA_FOR_CHART" && list(visual.rejectionReasons).length > 0;
  });
  const bodyNumericCoverage = Number(quantitativeValidation.bodyNumericClaimCoverage ?? 0);
  const eligibleQuantitative = list<Json>(architecture.quantitativeFindings).filter((finding) => finding.eligibleForChart === true);
  const quantitativeIntegrationPass =
    integrationValidation.pass === true &&
    Number(integrationValidation.coverage ?? 0) === 100;
  const gateReasons = [
    writer.llm_status !== "success" ? `WRITER_${String(writer.llm_status).toUpperCase()}` : null,
    writer.fallbackUsed ? "WRITER_FALLBACK_USED" : null,
    list(duplicateValidation.strictDuplicates).length > 0 ? "STRICT_DUPLICATES" : null,
    synthesisValidation.pass !== true ? "SYNTHESIS_VALIDATION" : null,
    quantitativeValidation.pass !== true ? "QUANTITATIVE_PROVENANCE" : null,
    !quantitativeIntegrationPass ? "QUANTITATIVE_FINDING_NOT_IN_BODY" : null,
    !visualizationPass ? "VISUALIZATION_SEMANTICS" : null,
    sections.length < 9 ? "MISSING_FORMAL_SECTIONS" : null,
    sections.some((section) => String(section.groundingStatus ?? "") === "unsupported") ? "UNSUPPORTED_SECTION" : null,
  ].filter((reason): reason is string => Boolean(reason));
  const contentGatePassed = gateReasons.length === 0;
  const verdict = quotaBlocked
    ? "FORMAL_RESEARCH_REPORT_BLOCKED_PROVIDER"
    : contentGatePassed
      ? "FORMAL_RESEARCH_REPORT_READY_FOR_EXPORT"
      : "FORMAL_RESEARCH_REPORT_PARTIAL";
  writeText(directory, "PREVIEW.md", markdownReport(topic.topic, sections, architecture));
  const summary = {
    topic: topic.topic,
    verdict,
    groundingStatus: job.status,
    searchedCandidates: list(job.sourceCandidates).length,
    acceptedSources: sources.length,
    evidenceCards: evidenceCards.length,
    metadataOnlySources: Number(diagnostics.metadataOnlySources ?? 0),
    abstractSources: Number(diagnostics.abstractSources ?? 0),
    fullTextSources: Number(diagnostics.fullTextSources ?? 0),
    partialFullTextSources: list<Json>(architecture.studies).filter((study) => study.contentAccessState === "partial_full_text").length,
    quantitativeFindings: list(architecture.quantitativeFindings).length,
    eligibleQuantitativeFindings: eligibleQuantitative.length,
    bodyNumericClaimCoverage: bodyNumericCoverage,
    quantitativeIntegrationPass,
    strictDuplicates: list(duplicateValidation.strictDuplicates).length,
    duplicateCategories: list<Json>(duplicateValidation.matches).reduce<Record<string, number>>((counts, match) => {
      const category = String(match.category ?? "UNKNOWN");
      counts[category] = (counts[category] ?? 0) + 1;
      return counts;
    }, {}),
    analyticalSynthesisPass: synthesisValidation.pass === true,
    visualizationPass,
    writerStatus: writer.llm_status,
    reportGenerationStatus: writer.reportGenerationStatus,
    fallbackUsed: writer.fallbackUsed,
    providerFailures,
    contentGatePassed,
    gateReasons,
    writerRequests,
    evidenceSetRequests,
    checkpoint: writer.formalResearchCheckpoint ?? null,
  };
  writeJson(directory, "acceptance-summary.json", summary);
  return summary;
}

async function main(): Promise<void> {
  fs.mkdirSync(outputDir, { recursive: true });
  const protectedBefore = shaFile(protectedFixture);
  const results: Json[] = [];
  const requestedSlug = process.env.RESEARCHFORGE_QA_TOPIC_SLUG?.trim();
  const selectedTopics = requestedSlug
    ? topics.filter((topic) => topic.slug === requestedSlug)
    : topics;
  for (const topic of selectedTopics) {
    try {
      results.push(await runTopic(topic));
    } catch (error) {
      results.push({
        topic: topic.topic,
        verdict: "FORMAL_RESEARCH_REPORT_BLOCKED_PROVIDER",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const protectedAfter = shaFile(protectedFixture);
  const ready = results.every((result) => result.verdict === "FORMAL_RESEARCH_REPORT_READY_FOR_EXPORT");
  const providerBlocked = results.some((result) => result.verdict === "FORMAL_RESEARCH_REPORT_BLOCKED_PROVIDER");
  const finalVerdict = ready
    ? "FORMAL_RESEARCH_REPORT_READY_FOR_EXPORT"
    : providerBlocked
      ? "FORMAL_RESEARCH_REPORT_BLOCKED_PROVIDER"
      : "FORMAL_RESEARCH_REPORT_PARTIAL";
  const repositoryState = {
    branch: execFileSync("git", ["branch", "--show-current"], { cwd: repositoryRoot, encoding: "utf8" }).trim(),
    head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim(),
    protectedFixture,
    expectedProtectedSha,
    protectedBefore,
    protectedAfter,
    protectedUnchanged: protectedBefore === protectedAfter && protectedAfter === expectedProtectedSha,
  };
  writeJson(outputDir, "acceptance-summary.json", {
    verdict: finalVerdict,
    startedAt: timestamp,
    completedAt: new Date().toISOString(),
    apiBase,
    exportAttempted: false,
    exportReason: ready ? "CONTENT_GATE_READY" : "CONTENT_GATE_NOT_READY",
    topics: results,
    repositoryState,
  });
  writeJson(outputDir, "repository-state.json", repositoryState);
  writeText(outputDir, "FINAL-VERDICT.txt", finalVerdict);
  process.stdout.write(`${finalVerdict}\n${outputDir}\n`);
}

if (process.env.RESEARCHFORGE_QA_COMPILE_ONLY !== "1") {
  void main().catch((error) => {
    globalThis.fetch = nativeFetch;
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
