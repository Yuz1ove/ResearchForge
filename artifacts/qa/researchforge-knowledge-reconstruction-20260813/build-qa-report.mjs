import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = dirname(scriptPath);
const repository = resolve(scriptDirectory, "../../..");
const qaRoot = resolve(repository, "artifacts/qa/researchforge-knowledge-reconstruction-20260813");
const baselineDirectory = resolve(
  repository,
  process.env.BASELINE_DIR ??
    "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep",
);
const currentDirectory = resolve(
  repository,
  process.env.CURRENT_DIR ??
    "artifacts/qa/researchforge-knowledge-reconstruction-20260813/final-run/short_video_sleep",
);
const outputDirectory = resolve(repository, process.env.QA_OUTPUT_DIR ?? qaRoot);
const assetsDirectory = resolve(outputDirectory, "qa-report-assets");
const currentDocxRenderPdf = resolve(
  repository,
  process.env.CURRENT_DOCX_RENDER_PDF ??
    "artifacts/qa/researchforge-knowledge-reconstruction-20260813/current-docx-render/formal-report.pdf",
);
const testSummaryPath = resolve(
  repository,
  process.env.QA_TEST_SUMMARY ??
    "artifacts/qa/researchforge-knowledge-reconstruction-20260813/qa-test-results.json",
);

const requiredCurrentFiles = [
  "report-plan.json",
  "report-response.json",
  "generated-report.json",
  "formal-export-gate.json",
  "smoke-summary.json",
  "formal-report.docx",
  "formal-report.pdf",
  "formal-print.html",
  "final-preview.md",
];

const requiredNamedTests = Object.freeze([
  "writer_does_not_receive_raw_abstracts",
  "no_source_order_narrative",
  "no_blanket_citation_clusters",
  "directness_classification_consistent",
  "visual_type_matches_statistic",
  "no_cross_study_false_comparison",
  "all_chart_values_are_traceable",
  "main_body_contains_result_visuals",
  "table_overuse_gate",
  "cjk_render_preserved",
  "docx_pdf_preview_content_parity",
]);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path, fallback = null) {
  if (!(await exists(path))) return fallback;
  return JSON.parse(await readFile(path, "utf8"));
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function validateNamedTestSummary(tests) {
  const named = tests?.named && typeof tests.named === "object" && !Array.isArray(tests.named)
    ? tests.named
    : {};
  const result = tests?.result && typeof tests.result === "object" && !Array.isArray(tests.result)
    ? tests.result
    : {};
  const namedKeys = Object.keys(named);
  const missingNames = requiredNamedTests.filter((name) => !Object.hasOwn(named, name));
  const unexpectedNames = namedKeys.filter((name) => !requiredNamedTests.includes(name));
  const matchedNames = requiredNamedTests.filter((name) => Object.hasOwn(named, name));
  const passedNames = matchedNames.filter((name) => named[name] === true);
  const failedNames = matchedNames.filter((name) => named[name] !== true);
  const expectedCount = requiredNamedTests.length;
  const suites = array(tests?.suites);
  const suiteCountsAreIntegers = suites.every(
    (suite) => Number.isInteger(suite?.total) && Number.isInteger(suite?.passed),
  );
  const suiteTotal = suiteCountsAreIntegers
    ? suites.reduce((total, suite) => total + suite.total, 0)
    : null;
  const suitePassed = suiteCountsAreIntegers
    ? suites.reduce((total, suite) => total + suite.passed, 0)
    : null;
  const issues = [];

  if (missingNames.length > 0) issues.push(`missing_named_tests:${missingNames.join(",")}`);
  if (unexpectedNames.length > 0) issues.push(`unexpected_named_tests:${unexpectedNames.join(",")}`);
  if (namedKeys.length !== expectedCount) {
    issues.push(`named_key_count:${namedKeys.length}/${expectedCount}`);
  }
  if (failedNames.length > 0) issues.push(`named_tests_not_passed:${failedNames.join(",")}`);
  if (result.total !== expectedCount) issues.push(`result_total:${String(result.total)}/${expectedCount}`);
  if (result.passed !== expectedCount) issues.push(`result_passed:${String(result.passed)}/${expectedCount}`);
  if (result.failed !== 0) issues.push(`result_failed:${String(result.failed)}/0`);
  if (result.exitCode !== 0) issues.push(`result_exit_code:${String(result.exitCode)}/0`);
  if (suites.length === 0) {
    issues.push("suite_counts:missing");
  } else if (!suiteCountsAreIntegers) {
    issues.push("suite_counts:invalid");
  } else {
    if (suiteTotal !== expectedCount) issues.push(`suite_total:${suiteTotal}/${expectedCount}`);
    if (suitePassed !== expectedCount) issues.push(`suite_passed:${suitePassed}/${expectedCount}`);
  }

  return {
    valid: issues.length === 0,
    expectedCount,
    namedKeyCount: namedKeys.length,
    matchedCount: matchedNames.length,
    passedCount: passedNames.length,
    missingNames,
    unexpectedNames,
    failedNames,
    declaredResult: {
      total: result.total ?? null,
      passed: result.passed ?? null,
      failed: result.failed ?? null,
      exitCode: result.exitCode ?? null,
    },
    suiteTotal,
    suitePassed,
    issues,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cjkCount(text) {
  return Array.from(String(text ?? "").matchAll(/[\u3400-\u9fff]/gu)).length;
}

function statusLabel(value) {
  return value ? "PASS" : "FAIL";
}

function statusClass(value) {
  return value ? "pass" : "fail";
}

function stringifyDocument(generatedReport) {
  return array(generatedReport?.sections)
    .flatMap((section) => [
      section.heading,
      ...array(section.blocks).map((block) => block.text ?? ""),
    ])
    .join("\n");
}

function flattenBlocks(generatedReport) {
  return array(generatedReport?.sections).flatMap((section, sectionIndex) =>
    array(section.blocks).map((block, blockIndex) => ({
      ...block,
      sectionHeading: section.heading ?? "",
      sectionIndex,
      blockIndex,
    })),
  );
}

function extractFigures(generatedReport) {
  return flattenBlocks(generatedReport)
    .filter((block) => block.type === "formalFigure" && block.figure)
    .map((block) => ({ ...block.figure, sectionHeading: block.sectionHeading, blockIndex: block.blockIndex }));
}

function extractTables(generatedReport) {
  return flattenBlocks(generatedReport)
    .filter((block) => block.type === "formalTable" && block.table)
    .map((block) => ({ ...block.table, sectionHeading: block.sectionHeading }));
}

function countMainBodyTables(generatedReport) {
  return extractTables(generatedReport).filter(
    (table) => !/(?:參考文獻|附錄|來源治理)/u.test(table.sectionHeading),
  ).length;
}

function valueCorpus(figures) {
  return figures
    .flatMap((figure) => [
      figure.title,
      figure.altText,
      figure.note,
      figure.comparabilityWarning,
      ...array(figure.provenance?.dataPoints).flatMap((datum) => [
        datum.displayValue,
        datum.exactText,
        datum.metric,
        datum.unit,
      ]),
    ])
    .join(" ");
}

function figureTraceability(figures) {
  const dataPoints = figures.flatMap((figure) => array(figure.provenance?.dataPoints));
  const unresolved = dataPoints.filter((datum) => {
    const sourceIds = array(datum.sourceIds);
    const derived = /derived|computed|canonical/iu.test(String(datum.sourceField ?? ""));
    if (datum.sourceField === "derived_coverage_count" && datum.displayValue === "0") {
      return false;
    }
    const grounded = Boolean(datum.exactText) && Boolean(datum.locator);
    return sourceIds.length === 0 || (!derived && !grounded);
  });
  return { dataPointCount: dataPoints.length, unresolved };
}

function sourceLedPatternCount(text) {
  const patterns = [
    /一項研究(?:指出|顯示)/gu,
    /另一項研究(?:則)?(?:指出|顯示)/gu,
    /相對地，?另有研究/gu,
    /另一方面/gu,
    /綜合來看/gu,
  ];
  return patterns.reduce((count, pattern) => count + Array.from(text.matchAll(pattern)).length, 0);
}

function titleIsNaturalChinese(title) {
  return cjkCount(title) >= 6 && !/^[\x00-\x7F\s]+$/u.test(String(title ?? ""));
}

function extractWriterDiagnostics(reportResponse, smokeSummary) {
  return reportResponse?.writerDiagnostics ?? smokeSummary?.writer?.diagnostics ?? {};
}

function summarizeCase({ plan, response, generated, gate, smoke, label }) {
  const figures = extractFigures(generated);
  const tables = extractTables(generated);
  const writer = extractWriterDiagnostics(response, smoke);
  const text = stringifyDocument(generated);
  const facts = array(plan?.normalizedFacts);
  const claims = array(plan?.claimGraph?.claims);
  const passes = array(plan?.narrativePasses);
  const keywords = array(plan?.keywords);
  const traceability = figureTraceability(figures);
  return {
    label,
    title: plan?.title ?? generated?.meta?.title ?? "未提供",
    originalTitle: plan?.originalTitle ?? null,
    keywords,
    factCount: facts.length,
    claimCount: claims.length,
    claimEdgeCount: array(plan?.claimGraph?.edges).length,
    narrativePasses: passes.map((pass) => pass.pass),
    writerStatus: response?.reportGenerationStatus ?? smoke?.writer?.status ?? null,
    writerModelCompletedSections: Number(writer?.modelCompletedSections ?? 0),
    writerFallbackSections: Number(writer?.fallbackSections ?? 0),
    postEditStatus: writer?.postEditValidation?.status ?? null,
    postEditIssues: array(writer?.postEditValidation?.issues),
    figures,
    figureCount: figures.length,
    figureTypes: unique(figures.map((figure) => figure.visualType)),
    figureTraceability: traceability,
    tableCount: tables.length,
    mainBodyTableCount: countMainBodyTables(generated),
    sourceLedPatternCount: sourceLedPatternCount(text),
    malformedSentencePresent: text.includes("現有研究顯示，另一項以大學生為對象的研究則指出。"),
    text,
    exportPassed: gate?.passed === true,
    exportReasons: array(gate?.reasons),
    documentIntegrity: smoke?.document?.integrity ?? null,
    docxWritten: smoke?.export?.docxWritten === true,
    pdfWritten: smoke?.export?.pdfWritten === true,
  };
}

async function runCommand(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      ...options,
    });
  } catch (error) {
    const detail = error?.stderr || error?.message || String(error);
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
}

const binaryCache = new Map();

async function resolveBinary(name) {
  if (binaryCache.has(name)) return binaryCache.get(name);
  const pathDirectories = String(process.env.PATH ?? "").split(":").filter(Boolean);
  const candidates = pathDirectories.flatMap((directory) => [
    resolve(directory, name),
    resolve(directory, "../../native/poppler/bin", name),
    resolve(directory, "../../native/poppler/poppler/bin", name),
  ]);
  for (const candidate of unique(candidates)) {
    if (await exists(candidate)) {
      binaryCache.set(name, candidate);
      return candidate;
    }
  }
  throw new Error(`Unable to find bundled binary: ${name}`);
}

async function runPdfTool(name, args) {
  return runCommand(await resolveBinary(name), args);
}

async function pdfMetrics(pdfPath) {
  if (!(await exists(pdfPath))) {
    return { exists: false, pages: 0, cjk: 0, replacementGlyphs: 0, text: "" };
  }
  const [{ stdout: info }, { stdout: text }] = await Promise.all([
    runPdfTool("pdfinfo", [pdfPath]),
    runPdfTool("pdftotext", ["-layout", pdfPath, "-"]),
  ]);
  const pages = Number(info.match(/^Pages:\s+(\d+)/mu)?.[1] ?? 0);
  return {
    exists: true,
    pages,
    cjk: cjkCount(text),
    replacementGlyphs: Array.from(text.matchAll(/\uFFFD/gu)).length,
    text,
  };
}

async function selectCurrentFigurePage(pdfPath, pages) {
  if (!pages) return 1;
  for (let page = 1; page <= pages; page += 1) {
    const { stdout } = await runPdfTool("pdftotext", ["-f", String(page), "-l", String(page), pdfPath, "-"]);
    if (/(?:圖\s*[1-6]|forest|31\.06|34\.7|0\.439|適用性邊界)/iu.test(stdout)) return page;
  }
  return Math.min(3, pages);
}

async function renderPdfPage(pdfPath, page, outputStem) {
  if (!(await exists(pdfPath))) return null;
  const prefix = resolve(assetsDirectory, outputStem);
  await runPdfTool("pdftoppm", [
    "-f",
    String(page),
    "-l",
    String(page),
    "-r",
    "120",
    "-png",
    "-singlefile",
    pdfPath,
    prefix,
  ]);
  const output = `${prefix}.png`;
  return (await exists(output)) ? output : null;
}

async function imageDataUri(path) {
  if (!path || !(await exists(path))) return null;
  return `data:image/png;base64,${(await readFile(path)).toString("base64")}`;
}

async function findNotoFont() {
  const pnpmDirectory = resolve(repository, "node_modules/.pnpm");
  const entries = await readdir(pnpmDirectory);
  const packageDirectory = entries.find((name) => name.startsWith("@fontsource+noto-sans-tc@"));
  if (!packageDirectory) return null;
  const filesDirectory = resolve(
    pnpmDirectory,
    packageDirectory,
    "node_modules/@fontsource/noto-sans-tc/files",
  );
  const files = await readdir(filesDirectory);
  const preferred = files.find((name) => /chinese-traditional-400-normal\.woff2$/u.test(name));
  return preferred ? resolve(filesDirectory, preferred) : null;
}

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [
    process.env.RESEARCHFORGE_PLAYWRIGHT_MODULE,
    resolve(repository, "artifacts/api-server/node_modules/playwright"),
    resolve(repository, "node_modules/.pnpm/playwright@1.61.1/node_modules/playwright"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next repository-bundled path.
    }
  }
  throw new Error(`Unable to load repository-bundled Playwright from: ${candidates.join(", ")}`);
}

function visualMiniBriefs(figures) {
  const byType = new Map(figures.map((figure) => [figure.visualType, figure]));
  const definitions = [
    {
      type: "sleep_evidence_coverage",
      short: "證據覆蓋總覽",
      job: "先回答高中／中學、短影音與睡眠三構面各有多少覆蓋，以及真正交集有多少。",
      shape: "來源層級布林覆蓋與去重來源數；不代表效果量。",
      owner: "視覺策略＋確定性 SVG",
      encoding: "三構面矩陣／覆蓋節點，交集以單獨數值直接標示。",
      fallback: "靜態向量圖；正文同步敘述各構面與交集數。",
      access: "直接標籤、非純色編碼，alt text 說明各來源數與交集。",
      qa: "來源去重；交集來源必須同時滿足對象、暴露與睡眠三條件。",
    },
    {
      type: "prevalence_facets",
      short: "睡眠比例小多圖",
      job: "讓讀者分別理解 34.7% 與 31.06%，同時看見不可直接比較。",
      shape: "兩來源、兩種睡眠判定方式、0-100% 比例。",
      owner: "統計視覺化＋確定性 SVG",
      encoding: "同尺度分面水平比例條；每面板直標數值與來源。",
      fallback: "兩段數字摘要；禁止合併長條、平均值與排名。",
      access: "數值不靠 hover；圖說明示樣本與判定方式不同。",
      qa: "34.7 與 31.06 均可追至唯一來源；comparability warning 必須存在。",
    },
    {
      type: "odds_ratio_forest",
      short: "OR forest plot",
      job: "顯示 TikTok、使用時數與中重度憂鬱對睡眠不佳的 OR 與不確定性。",
      shape: "三個 OR 點估計＋95% CI；共同無效線為 1。",
      owner: "統計／不確定性視覺化",
      encoding: "對數或合宜線性位置、點＋區間、基準線 1、右側直接標籤。",
      fallback: "靜態 SVG／PNG 與可讀 OR、CI 文字，不換算為百分比。",
      access: "線型、點形與數字重複編碼；主結論不依顏色。",
      qa: "1.33 [1.01,1.77]、1.26 [1.16,1.37]、1.69 [1.19,2.40] 原樣追溯。",
    },
    {
      type: "correlation_structure",
      short: "相關結構圖",
      job: "說明短影音成癮、睡眠品質與社交焦慮的兩兩關聯，不誤解為百分比或因果。",
      shape: "三節點、三個 r 值；量表方向若未明示則不翻譯好壞。",
      owner: "統計視覺化＋節點關係圖",
      encoding: "固定節點位置、帶 r 數值的連線、非因果標註。",
      fallback: "文字列出 r=0.439、0.404、0.457 與方向限制。",
      access: "節點與連線有文字長描述；線寬不作唯一訊息通道。",
      qa: "r 保持係數單位，不乘 100；三值均有 source/fact provenance。",
    },
    {
      type: "statistical_mediation_path",
      short: "社交焦慮中介路徑",
      job: "解釋社交焦慮可能位於短影音成癮與睡眠品質之間。",
      shape: "三節點有向統計路徑；若圖契約為無係數則不得補值。",
      owner: "節點關係圖＋統計語意",
      encoding: "短影音成癮 → 社交焦慮 → 睡眠品質，明示『統計路徑、非因果機制』。",
      fallback: "靜態路徑與同義文字說明；Image2 不負責箭頭、文字或數字。",
      access: "閱讀順序寫入 alt text；箭頭方向另以文字表達。",
      qa: "來源只明示部分中介時，不把路徑畫成生理因果；無係數模式不得出現係數。",
    },
    {
      type: "population_applicability_boundary",
      short: "適用性邊界",
      job: "區分高中／中學生直接證據、大學生機制參照與一般社群媒體背景。",
      shape: "互斥用途層級＋去重來源數；每來源只進最適合的一層。",
      owner: "視覺策略＋適用性分類",
      encoding: "邊界帶／分組矩陣，直接性由位置與標籤而非單靠顏色表示。",
      fallback: "靜態矩陣與正文用途清單；不可把背景證據升格為直接結果。",
      access: "每層有明文定義與來源數；灰階仍能辨識。",
      qa: "高中、大學生與一般社群媒體不能互換；分類計數與 A/B 定義一致。",
    },
  ];
  return definitions.map((definition) => {
    const figure = byType.get(definition.type);
    return {
      ...definition,
      present: Boolean(figure),
      title: figure?.title ?? "尚未在 current 成品找到",
      sourceIds: unique(array(figure?.provenance?.sourceIds)),
      dataPointCount: array(figure?.provenance?.dataPoints).length,
      argumentClaimId: figure?.argumentClaimId ?? null,
      altTextPresent: Boolean(figure?.altText),
    };
  });
}

function auditRows(baseline, current, currentFilesReady, pdf, docxPdf, tests, attachmentsPresent) {
  const expectedFigureTypes = [
    "sleep_evidence_coverage",
    "prevalence_facets",
    "odds_ratio_forest",
    "correlation_structure",
    "statistical_mediation_path",
    "population_applicability_boundary",
  ];
  const namedTestValidation = validateNamedTestSummary(tests);
  const validatedNamedTestPassed = (name) =>
    namedTestValidation.valid && tests?.named?.[name] === true;
  const values = valueCorpus(current.figures);
  const exactKeywords = ["短影音", "高中生", "睡眠品質", "社交焦慮", "證據綜合"];
  const generalReviewSource = "doi:10.3390/ijerph19169960";
  const generalSleepSource = "doi:10.2147/ijgm.s464457";
  const coverageFigure = current.figures.find((figure) => figure.visualType === "sleep_evidence_coverage");
  const boundaryFigure = current.figures.find((figure) => figure.visualType === "population_applicability_boundary");
  const coverageShortVideoSources = array(coverageFigure?.provenance?.dataPoints)
    .find((datum) => datum.datumKey === "sleep-coverage-short-video")?.sourceIds ?? [];
  const generalSleepSources = array(boundaryFigure?.provenance?.dataPoints)
    .find((datum) => datum.datumKey === "sleep-applicability-general-social-media-sleep")?.sourceIds ?? [];
  const generalReviewSources = array(boundaryFigure?.provenance?.dataPoints)
    .find((datum) => datum.datumKey === "sleep-applicability-general-social-media")?.sourceIds ?? [];
  const checks = [
    {
      id: "current_outputs_ready",
      label: "Preview／DOCX／PDF 與 canonical JSON 均存在",
      pass: currentFilesReady,
      evidence: currentFilesReady ? "九項必需 current 產物齊備" : "current 產物仍不完整",
    },
    {
      id: "atomic_facts",
      label: "Atomic Evidence Facts 已建立",
      pass: current.factCount > 0,
      evidence: `${current.factCount} facts`,
    },
    {
      id: "claim_graph",
      label: "跨來源 Claim Graph 已建立",
      pass: current.claimCount > 0,
      evidence: `${current.claimCount} claims / ${current.claimEdgeCount} edges`,
    },
    {
      id: "two_pass_writer",
      label: "Teach-back 與 academic reconstruction 兩階段存在",
      pass:
        current.narrativePasses.includes("teach_back") &&
        current.narrativePasses.includes("academic_reconstruction"),
      evidence: current.narrativePasses.join(" → ") || "無",
    },
    {
      id: "writer_success",
      label: "正文 writer 真實成功且沒有 fallback",
      pass:
        current.writerFallbackSections === 0 &&
        current.postEditStatus === "pass" &&
        current.writerModelCompletedSections > 0,
      evidence: `model=${current.writerModelCompletedSections}, fallback=${current.writerFallbackSections}, postEdit=${current.postEditStatus ?? "n/a"}`,
    },
    {
      id: "writer_isolation_test",
      label: "實際 LLM message 不含 raw abstracts／snippets",
      pass: validatedNamedTestPassed("writer_does_not_receive_raw_abstracts"),
      evidence:
        validatedNamedTestPassed("writer_does_not_receive_raw_abstracts")
          ? "sentinel test pass；HTTP orchestration payload 與實際 LLM message boundary 分開稽核"
          : `具名測試摘要不合格：${namedTestValidation.issues.join("；") || "sentinel test 未通過"}`,
    },
    {
      id: "six_visuals",
      label: "六種要求視覺均在主文模型",
      pass: expectedFigureTypes.every((type) => current.figureTypes.includes(type)),
      evidence: `${current.figureCount} figures: ${current.figureTypes.join(", ") || "無"}`,
    },
    {
      id: "concept_separation",
      label: "一般社群媒體未被誤算為短影音直接證據",
      pass:
        !coverageShortVideoSources.includes(generalReviewSource) &&
        !coverageShortVideoSources.includes(generalSleepSource) &&
        generalSleepSources.includes(generalSleepSource) &&
        generalReviewSources.includes(generalReviewSource),
      evidence: `short-video=${coverageShortVideoSources.length}；general-social-media sleep=${generalSleepSources.length}；review background=${generalReviewSources.length}`,
    },
    {
      id: "critical_values",
      label: "34.7、31.06、三個 OR 與三個 r 均進入視覺 provenance",
      pass: ["34.7", "31.06", "1.33", "1.26", "1.69", "0.439", "0.404", "0.457"].every((value) =>
        values.includes(value),
      ),
      evidence: "required values scanned from figure-level provenance",
    },
    {
      id: "traceability",
      label: "所有圖表 datum 可追溯",
      pass: current.figureTraceability.dataPointCount > 0 && current.figureTraceability.unresolved.length === 0,
      evidence: `${current.figureTraceability.dataPointCount} datum / ${current.figureTraceability.unresolved.length} unresolved`,
    },
    {
      id: "table_gate",
      label: "主文最多一張分析表",
      pass: current.mainBodyTableCount <= 1,
      evidence: `${current.mainBodyTableCount} main-body tables / ${current.tableCount} total tables`,
    },
    {
      id: "title_keywords",
      label: "自然中文標題、原英文副標與恰五個指定關鍵詞",
      pass:
        titleIsNaturalChinese(current.title) &&
        current.originalTitle === "Short-form video use and sleep quality among high school students" &&
        current.keywords.length === 5 &&
        exactKeywords.every((keyword) => current.keywords.includes(keyword)),
      evidence: `${current.title} / keywords=${current.keywords.join("、")}`,
    },
    {
      id: "source_stitching",
      label: "來源順序模板與殘句未出現在 current",
      pass: current.sourceLedPatternCount === 0 && !current.malformedSentencePresent,
      evidence: `source-led patterns=${current.sourceLedPatternCount}; malformed=${current.malformedSentencePresent}`,
    },
    {
      id: "directness",
      label: "直接性分類自動測試一致",
      pass: validatedNamedTestPassed("directness_classification_consistent"),
      evidence: validatedNamedTestPassed("directness_classification_consistent")
        ? "named regression pass"
        : `具名測試摘要不合格：${namedTestValidation.issues.join("；") || "測試未通過"}`,
    },
    {
      id: "named_acceptance_tests",
      label: "本輪 11 項具名驗收測試全部通過",
      pass: namedTestValidation.valid,
      evidence: `${namedTestValidation.passedCount}/${namedTestValidation.expectedCount} pass；matched=${namedTestValidation.matchedCount}；${namedTestValidation.issues.join("；") || "summary counts verified"}`,
    },
    {
      id: "canonical_parity",
      label: "Preview／DOCX／PDF 共用 canonical model 並通過 parity test",
      pass: validatedNamedTestPassed("docx_pdf_preview_content_parity"),
      evidence: validatedNamedTestPassed("docx_pdf_preview_content_parity")
        ? "named regression pass"
        : `具名測試摘要不合格：${namedTestValidation.issues.join("；") || "測試未通過"}`,
    },
    {
      id: "cjk_product_pdf",
      label: "Chromium PDF 保留繁中 glyph",
      pass: pdf.exists && pdf.cjk > 100 && pdf.replacementGlyphs === 0,
      evidence: `${pdf.pages} pages / ${pdf.cjk} CJK / ${pdf.replacementGlyphs} replacement`,
    },
    {
      id: "cjk_libreoffice",
      label: "DOCX→LibreOffice PDF 保留繁中 glyph",
      pass: docxPdf.exists && docxPdf.cjk > 100 && docxPdf.replacementGlyphs === 0,
      evidence: docxPdf.exists
        ? `${docxPdf.pages} pages / ${docxPdf.cjk} CJK / ${docxPdf.replacementGlyphs} replacement`
        : `未找到 ${currentDocxRenderPdf}`,
    },
    {
      id: "export_gate",
      label: "formal export gate、document integrity 均通過",
      pass: current.exportPassed && current.documentIntegrity === "pass",
      evidence: `gate=${current.exportPassed}; integrity=${current.documentIntegrity}; reasons=${current.exportReasons.join("；") || "無"}`,
    },
    {
      id: "required_inputs",
      label: "本輪 formal-report(2).docx 與 project_sources/ 已提供並核對",
      pass: attachmentsPresent,
      evidence: attachmentsPresent
        ? "本輪指定輸入已核對"
        : "未提供；baseline 改用 archived short_video_sleep 成品，project_sources 不作學術證據",
    },
  ];
  return { checks, expectedFigureTypes, namedTestValidation };
}

function miniBriefHtml(brief, index) {
  const sources = brief.sourceIds.length
    ? brief.sourceIds.map((source) => `<code>${escapeHtml(source)}</code>`).join("、")
    : "未找到 current figure provenance";
  return `<article class="brief ${brief.present ? "present" : "missing"}">
    <div class="brief-head"><span class="brief-index">${index + 1}</span><div><h3>${escapeHtml(brief.short)}</h3><p>${escapeHtml(brief.title)}</p></div><strong>${brief.present ? "PRESENT" : "MISSING"}</strong></div>
    <dl>
      <div><dt>Story job</dt><dd>${escapeHtml(brief.job)}</dd></div>
      <div><dt>Data shape</dt><dd>${escapeHtml(brief.shape)}</dd></div>
      <div><dt>Owner</dt><dd>${escapeHtml(brief.owner)}</dd></div>
      <div><dt>Encoding</dt><dd>${escapeHtml(brief.encoding)}</dd></div>
      <div><dt>Fallback</dt><dd>${escapeHtml(brief.fallback)}</dd></div>
      <div><dt>Accessibility</dt><dd>${escapeHtml(brief.access)}</dd></div>
      <div><dt>QA</dt><dd>${escapeHtml(brief.qa)}</dd></div>
      <div><dt>Trace</dt><dd>${brief.dataPointCount} datum；${sources}</dd></div>
    </dl>
  </article>`;
}

function checkTableHtml(checks) {
  return checks
    .map(
      (check) => `<tr><td><span class="badge ${statusClass(check.pass)}">${statusLabel(check.pass)}</span></td><td>${escapeHtml(check.label)}</td><td>${escapeHtml(check.evidence)}</td></tr>`,
    )
    .join("");
}

function beforeAfterRows(baseline, current) {
  return [
    ["生成核心", `${baseline.factCount} facts；無 Claim Graph`, `${current.factCount} atomic facts；${current.claimCount} claims`],
    ["writer", `單階段／來源材料導向`, `${current.narrativePasses.join(" → ") || "兩階段未建立"}`],
    ["主文視覺", `${baseline.figureCount} 張`, `${current.figureCount} 張：${current.figureTypes.join("、") || "無"}`],
    ["關鍵數字", "精確數值集中於附錄表格", "分別進比例、forest、相關與路徑視覺"],
    ["表格角色", `${baseline.mainBodyTableCount} 主文／${baseline.tableCount} 全文`, `${current.mainBodyTableCount} 主文／${current.tableCount} 全文`],
    ["來源拼接訊號", `${baseline.sourceLedPatternCount} 次模板詞；殘句=${baseline.malformedSentencePresent}`, `${current.sourceLedPatternCount} 次模板詞；殘句=${current.malformedSentencePresent}`],
    ["題名／關鍵詞", `${baseline.title}；${baseline.keywords.join("、") || "只有正文舊詞"}`, `${current.title}；${current.keywords.join("、") || "未提供"}`],
    ["匯出 gate", String(baseline.exportPassed), String(current.exportPassed)],
  ];
}

function beforeAfterTableHtml(rows) {
  return rows
    .map(
      ([aspect, before, after]) => `<tr><th>${escapeHtml(aspect)}</th><td>${escapeHtml(before)}</td><td>${escapeHtml(after)}</td></tr>`,
    )
    .join("");
}

function testSummaryHtml(tests, namedTestValidation) {
  if (!tests) {
    return `<div class="notice danger"><b>測試摘要缺件：</b>未找到 ${escapeHtml(testSummaryPath)}。QA 不會把未記錄的測試視為通過。</div>`;
  }
  const suites = array(tests.suites);
  const fullRegression = tests.fullRegression;
  const fullRegressionHtml = fullRegression
    ? `<p class="small"><b>完整回歸：</b>${escapeHtml(fullRegression.combined?.passed ?? "n/a")}/${escapeHtml(fullRegression.combined?.total ?? "n/a")}；API typecheck=${escapeHtml(fullRegression.apiServerTypecheck ?? "n/a")}；factory typecheck=${escapeHtml(fullRegression.reportFactoryTypecheck ?? "n/a")}；diff-check=${escapeHtml(fullRegression.gitDiffCheck ?? "n/a")}。</p>`
    : "";
  const namedValidationHtml = namedTestValidation.valid
    ? `<div class="notice success"><b>具名測試摘要已核對：</b>${namedTestValidation.matchedCount}/${namedTestValidation.expectedCount} 個精確鍵、通過數與 suite/result 計數一致。</div>`
    : `<div class="notice danger"><b>具名測試摘要不合格：</b>${escapeHtml(namedTestValidation.issues.join("；") || "缺少 matched subtests 證據")}。exitCode=0 不會單獨被視為通過。</div>`;
  return `${namedValidationHtml}<div class="metric-grid">
    ${suites
      .map(
        (suite) => `<div class="metric"><b>${escapeHtml(suite.passed ?? suite.status ?? "n/a")}</b><span>${escapeHtml(suite.name)}</span><small>${escapeHtml(suite.total ? `/${suite.total}` : suite.detail ?? "")}</small></div>`,
      )
      .join("")}
  </div>
  ${fullRegressionHtml}
  <p class="small">命名驗收：${Object.entries(tests.named ?? {})
    .map(([name, pass]) => `<code class="${pass ? "ok" : "bad"}">${escapeHtml(name)}=${pass ? "pass" : "fail"}</code>`)
    .join(" ")}</p>`;
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(assetsDirectory, { recursive: true });

  const missingCurrentFiles = [];
  for (const file of requiredCurrentFiles) {
    if (!(await exists(resolve(currentDirectory, file)))) missingCurrentFiles.push(file);
  }
  const currentFilesReady = missingCurrentFiles.length === 0;

  const [
    baselinePlan,
    baselineResponse,
    baselineGenerated,
    baselineGate,
    baselineSmoke,
    currentPlan,
    currentResponse,
    currentGenerated,
    currentGate,
    currentSmoke,
    tests,
  ] = await Promise.all([
    readJson(resolve(baselineDirectory, "report-plan.json"), {}),
    readJson(resolve(baselineDirectory, "report-response.json"), {}),
    readJson(resolve(baselineDirectory, "generated-report.json"), {}),
    readJson(resolve(baselineDirectory, "formal-export-gate.json"), {}),
    readJson(resolve(baselineDirectory, "smoke-summary.json"), {}),
    readJson(resolve(currentDirectory, "report-plan.json"), {}),
    readJson(resolve(currentDirectory, "report-response.json"), {}),
    readJson(resolve(currentDirectory, "generated-report.json"), {}),
    readJson(resolve(currentDirectory, "formal-export-gate.json"), {}),
    readJson(resolve(currentDirectory, "smoke-summary.json"), {}),
    readJson(testSummaryPath, null),
  ]);

  const baseline = summarizeCase({
    plan: baselinePlan,
    response: baselineResponse,
    generated: baselineGenerated,
    gate: baselineGate,
    smoke: baselineSmoke,
    label: "archived baseline",
  });
  const current = summarizeCase({
    plan: currentPlan,
    response: currentResponse,
    generated: currentGenerated,
    gate: currentGate,
    smoke: currentSmoke,
    label: "current reconstruction",
  });
  const currentProductPdfPath = resolve(currentDirectory, "formal-report.pdf");
  const [productPdf, libreOfficePdf] = await Promise.all([
    pdfMetrics(currentProductPdfPath),
    pdfMetrics(currentDocxRenderPdf),
  ]);

  const requiredAttachmentDocx = resolve(
    process.env.REQUIRED_ATTACHMENT_DOCX ??
      "/Users/Yuz1ove/.codex/attachments/51964dbb-dddf-4816-af24-8b777a5c5fec/formal-report(2).docx",
  );
  const requiredProjectSources = resolve(
    repository,
    process.env.REQUIRED_PROJECT_SOURCES ?? "project_sources",
  );
  const attachmentsPresent =
    (await exists(requiredAttachmentDocx)) && (await exists(requiredProjectSources));

  const { checks, expectedFigureTypes, namedTestValidation } = auditRows(
    baseline,
    current,
    currentFilesReady,
    productPdf,
    libreOfficePdf,
    tests,
    attachmentsPresent,
  );
  const pipelineChecks = checks.filter((check) => check.id !== "required_inputs");
  const pipelinePass = pipelineChecks.every((check) => check.pass);
  const fullPass = checks.every((check) => check.pass);
  const visualBriefs = visualMiniBriefs(current.figures);
  const comparisonRows = beforeAfterRows(baseline, current);

  const baselineScreenshotPath = await (async () => {
    const existing = resolve(qaRoot, "baseline-docx-render-fontfixed/page-9.png");
    if (await exists(existing)) return existing;
    const baselinePdf = resolve(baselineDirectory, "formal-report.pdf");
    const metrics = await pdfMetrics(baselinePdf);
    return renderPdfPage(baselinePdf, Math.min(9, Math.max(1, metrics.pages)), "baseline-source-table");
  })();
  const currentFigurePage = await selectCurrentFigurePage(currentProductPdfPath, productPdf.pages);
  const currentScreenshotPath = await renderPdfPage(
    currentProductPdfPath,
    currentFigurePage,
    "current-result-visual",
  );
  const [baselineScreenshot, currentScreenshot] = await Promise.all([
    imageDataUri(baselineScreenshotPath),
    imageDataUri(currentScreenshotPath),
  ]);

  const fontPath = await findNotoFont();
  const fontData = fontPath ? (await readFile(fontPath)).toString("base64") : null;
  const generatedAt = new Date().toISOString();
  const overallLabel = fullPass ? "PASS" : pipelinePass ? "PIPELINE PASS / INPUT GAP" : "PARTIAL / BLOCKED";
  const currentVisualTypes = new Set(current.figureTypes);

  const audit = {
    schemaVersion: "researchforge-knowledge-reconstruction-qa/v1",
    generatedAt,
    inputs: {
      baselineDirectory,
      currentDirectory,
      currentDocxRenderPdf,
      testSummaryPath,
      requiredAttachmentDocx,
      requiredProjectSources,
      missingCurrentFiles,
      requiredInputsPresent: attachmentsPresent,
      baselineSubstitution:
        "formal-report(2).docx was not present; archived short_video_sleep formal-report.docx is used as the reproducible baseline.",
    },
    verdict: { overall: overallLabel, fullPass, pipelinePass },
    baseline: {
      title: baseline.title,
      factCount: baseline.factCount,
      claimCount: baseline.claimCount,
      figureCount: baseline.figureCount,
      mainBodyTableCount: baseline.mainBodyTableCount,
      tableCount: baseline.tableCount,
      sourceLedPatternCount: baseline.sourceLedPatternCount,
      malformedSentencePresent: baseline.malformedSentencePresent,
    },
    current: {
      title: current.title,
      originalTitle: current.originalTitle,
      keywords: current.keywords,
      factCount: current.factCount,
      claimCount: current.claimCount,
      claimEdgeCount: current.claimEdgeCount,
      narrativePasses: current.narrativePasses,
      figureCount: current.figureCount,
      figureTypes: current.figureTypes,
      expectedFigureTypes,
      mainBodyTableCount: current.mainBodyTableCount,
      tableCount: current.tableCount,
      sourceLedPatternCount: current.sourceLedPatternCount,
      malformedSentencePresent: current.malformedSentencePresent,
      writerModelCompletedSections: current.writerModelCompletedSections,
      writerFallbackSections: current.writerFallbackSections,
      postEditStatus: current.postEditStatus,
      exportPassed: current.exportPassed,
      documentIntegrity: current.documentIntegrity,
    },
    pdf: { product: productPdf, libreOffice: libreOfficePdf },
    testSummaryValidation: namedTestValidation,
    checks,
    visualMiniBriefs: visualBriefs,
    beforeAfter: comparisonRows.map(([aspect, before, after]) => ({ aspect, before, after })),
    limitations: [
      "formal-report(2).docx and project_sources/ were not present at the inspected paths unless requiredInputsPresent is true.",
      "The archived short_video_sleep output is used only as a reproducible baseline, not represented as the missing attachment.",
      "Most included evidence is abstract-level; missing full methods, sampling details, and scale directions cannot be invented.",
      "Cross-sectional associations and mediation models do not establish causation.",
      "High school, secondary school, adolescent, and college populations are kept as distinct applicability groups.",
      "Image2 is not used for statistical marks, labels, axes, values, forest plots, or tables; deterministic fallback is the truth-preserving path.",
    ],
  };

  const fontFace = fontData
    ? `@font-face{font-family:RFNoto;src:url(data:font/woff2;base64,${fontData}) format("woff2");font-weight:100 900;font-style:normal;font-display:block}`
    : "";
  const heroStatus = `<span class="hero-status ${fullPass ? "pass" : pipelinePass ? "warn" : "fail"}">${escapeHtml(overallLabel)}</span>`;
  const missingNotice = attachmentsPresent
    ? "本輪指定附件與 project_sources 已找到。"
    : "指定的 formal-report(2).docx 與 project_sources/ 未提供；本報告以 archived short_video_sleep 成品作可重跑 baseline，且不把 project_sources 當學術證據。";

  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>ResearchForge 知識重建與視覺綜合 QA</title><style>
${fontFace}
@page{size:A4;margin:0}*{box-sizing:border-box}html{background:#dfe7e5}body{margin:0;color:#183638;background:#dfe7e5;font-family:RFNoto,"Noto Sans CJK TC","Microsoft JhengHei",sans-serif;font-size:9.5pt;line-height:1.52}.page{position:relative;width:210mm;height:297mm;margin:0 auto;background:#fff;padding:16mm 17mm 15mm;overflow:hidden;page-break-after:always}.page:last-child{page-break-after:auto}.cover{display:flex;flex-direction:column;justify-content:center;background:linear-gradient(145deg,#f7fbf9 0%,#fff 60%,#f7f3e7 100%)}.kicker{font-size:9pt;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#9a7330}.cover h1{font-size:28pt;line-height:1.2;margin:7mm 0 4mm;color:#0e4244;letter-spacing:-.025em}.cover .dek{font-size:13pt;line-height:1.6;color:#45696b;max-width:156mm}.hero-status{display:inline-block;margin-top:12mm;padding:3mm 5mm;border-radius:2mm;font-weight:900;letter-spacing:.08em}.hero-status.pass,.badge.pass{background:#dff4e9;color:#08603f}.hero-status.warn{background:#fff0c8;color:#7a5100}.hero-status.fail,.badge.fail{background:#fde5e2;color:#9b271d}.cover-meta{margin-top:10mm;padding-top:5mm;border-top:1px solid #b9cbc7;color:#536d6d}.cover-meta b{color:#173f41}.footer{position:absolute;left:17mm;right:17mm;bottom:6mm;display:flex;justify-content:space-between;color:#6c7c7b;font-size:7pt;border-top:1px solid #d7e0de;padding-top:2mm}h2{font-size:18pt;line-height:1.25;color:#0f4648;margin:0 0 5mm;padding-bottom:3mm;border-bottom:1.4px solid #b08a3d}h3{font-size:11.2pt;line-height:1.35;color:#16575a;margin:3mm 0 1.5mm}p{margin:0 0 2.6mm}ul{margin:1.5mm 0 3mm;padding-left:5mm}li{margin:0 0 1.3mm}.lead{font-size:11pt;line-height:1.65}.small{font-size:8.2pt;color:#4b6666}.tiny{font-size:7.2pt;color:#5f7372}.notice{padding:3.5mm 4mm;margin:3mm 0;border-left:4px solid #b08a3d;background:#fbf7ec}.notice.danger{border-color:#b83d31;background:#fff0ee}.notice.success{border-color:#258561;background:#edf8f2}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:4mm 0}.metric{border-top:3px solid #2a7773;background:#f3f8f6;padding:3mm}.metric b{display:block;font-size:16pt;color:#155052;line-height:1.15}.metric span{display:block;font-weight:700}.metric small{color:#5a7070}.pipeline{display:flex;flex-wrap:wrap;align-items:stretch;gap:2mm;margin:4mm 0}.node{flex:1 1 29mm;min-height:18mm;padding:3mm;border:1px solid #b9ccc8;background:#f4f8f7;border-radius:2mm;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:800;position:relative}.node:not(:last-child)::after{content:"→";position:absolute;right:-3.5mm;top:50%;transform:translateY(-50%);color:#9b7936;font-size:12pt;z-index:2}.boundary{display:grid;grid-template-columns:1fr 8mm 1fr;gap:3mm;margin:5mm 0}.boundary .zone{padding:4mm;border:1px solid #b7cac6;border-radius:2mm}.boundary .extract{background:#fff6e4}.boundary .write{background:#eef8f4}.boundary .wall{background:#163f42;color:#fff;writing-mode:vertical-rl;display:flex;align-items:center;justify-content:center;border-radius:2mm;font-size:8pt;letter-spacing:.12em}.allowed,.denied{font-size:8.5pt;margin-top:2mm}.denied{color:#922f27}.allowed{color:#0e6647}table{width:100%;border-collapse:collapse;margin:3mm 0;font-size:8.2pt}th,td{border-bottom:1px solid #cad7d4;padding:2.2mm 2mm;text-align:left;vertical-align:top}thead th{background:#17494b;color:#fff;border-bottom:0}.badge{display:inline-block;padding:.8mm 1.7mm;border-radius:1mm;font-size:7pt;font-weight:900;letter-spacing:.06em}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;color:#244e50;overflow-wrap:anywhere}code.ok{background:#e6f6ed;color:#076044;padding:.4mm}code.bad{background:#fee9e5;color:#97291f;padding:.4mm}.brief-grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.brief{border:1px solid #bdcfcb;border-radius:2mm;overflow:hidden;background:#fff}.brief.present{border-top:4px solid #267b69}.brief.missing{border-top:4px solid #ba3a31}.brief-head{display:grid;grid-template-columns:9mm 1fr auto;gap:2mm;align-items:start;padding:3mm;background:#f2f7f5}.brief-index{width:7mm;height:7mm;border-radius:50%;background:#17494b;color:white;display:flex;align-items:center;justify-content:center;font-weight:900}.brief-head h3{margin:0;font-size:10.3pt}.brief-head p{font-size:7.2pt;color:#57706e;margin:.8mm 0 0}.brief-head strong{font-size:6.8pt;color:#466}.brief dl{margin:0;padding:2.5mm 3mm}.brief dl div{display:grid;grid-template-columns:21mm 1fr;gap:2mm;border-bottom:1px dotted #d4dddb;padding:1mm 0}.brief dl div:last-child{border-bottom:0}.brief dt{font-size:7.2pt;font-weight:900;color:#806126;text-transform:uppercase}.brief dd{font-size:7.45pt;margin:0;line-height:1.42}.shots{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin:4mm 0}.shot{border:1px solid #bdcbc9;background:#f3f6f5;padding:2mm}.shot img{display:block;width:100%;height:132mm;object-fit:contain;background:#fff}.shot .placeholder{height:132mm;display:flex;align-items:center;justify-content:center;text-align:center;color:#8a3d35;padding:8mm}.caption{font-size:7.3pt;color:#536c6b;margin-top:1.5mm}.checks{font-size:7.8pt}.checks td:first-child{width:14mm}.checks td:nth-child(2){width:63mm;font-weight:700}.checks td:nth-child(3){color:#4e6665}.comparison th{width:30mm;color:#164a4c}.comparison td:nth-child(2){background:#fff7ec}.comparison td:nth-child(3){background:#eff8f4}.color-ledger{display:flex;gap:3mm;margin:3mm 0}.swatch{flex:1;padding:2.5mm;color:#fff;font-size:7.5pt}.swatch.neutral{background:#647575}.swatch.primary{background:#1f766b}.swatch.compare{background:#a77b2e}.swatch.alert{background:#a83931}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:6mm}.separator{height:1px;background:#d3dcda;margin:4mm 0}.stamp{margin-top:5mm;border:2px solid ${fullPass ? "#1e7a59" : "#a53a30"};padding:4mm;font-size:13pt;font-weight:900;text-align:center;color:${fullPass ? "#146444" : "#8f2c24"}}
.page:last-child{padding-bottom:18mm}.page:last-child .metric-grid{margin:2mm 0}.page:last-child .metric{padding:2mm}.page:last-child .metric b{font-size:14pt}.page:last-child .checks{font-size:7.1pt;margin:2mm 0}.page:last-child .checks th,.page:last-child .checks td{padding:1.35mm 1.5mm}.page:last-child .two-col{gap:4mm}.page:last-child .two-col h3{margin:1.8mm 0 1mm}.page:last-child .two-col ul{margin:1mm 0 1.8mm}.page:last-child .two-col li{margin-bottom:.65mm}.page:last-child .stamp{margin-top:2mm;padding:2mm;font-size:11pt}.page:last-child>.tiny{margin:1.2mm 0 0;font-size:6.7pt;line-height:1.25}.boundary>*{min-width:0}.boundary p{overflow-wrap:anywhere}@media print{html,body{width:210mm;min-width:210mm;margin:0;overflow:hidden}.page{margin:0}}
.footer{min-width:0;right:20mm}.footer span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.footer span:last-child{flex:0 0 auto;margin-left:3mm}
</style></head><body>
<section class="page cover"><p class="kicker">ResearchForge · Knowledge Reconstruction QA</p><h1>知識重建式綜合寫作<br>與數據視覺化修復</h1><p class="dek">驗證 Raw sources → Atomic Evidence Facts → Claim Graph → 兩階段 original narrative → 可追溯視覺 → canonical exports，並以 archived baseline 對照閱讀品質與圖表論證。</p>${heroStatus}<div class="cover-meta"><p><b>驗收題目：</b>短影音使用與高中生睡眠品質的關聯</p><p><b>Original subtitle：</b>Short-form video use and sleep quality among high school students</p><p><b>生成：</b>${escapeHtml(generatedAt)} · HTML → Chromium PDF · deterministic QA</p><p><b>限制：</b>${escapeHtml(missingNotice)}</p></div><div class="footer"><span>ResearchForge QA / evidence-bearing export</span><span>1 / 10</span></div></section>

<section class="page"><h2>01｜判定與 fail-closed gate</h2><p class="lead">管線判定為 <b>${pipelinePass ? "PASS" : "未通過"}</b>；包含指定附件核對的完整判定為 <b>${fullPass ? "PASS" : "PARTIAL"}</b>。任何 writer fallback、六圖缺件、無法追溯 datum、CJK 渲染缺失或 export gate blocked 都會讓本報告維持未通過。</p><div class="metric-grid"><div class="metric"><b>${current.factCount}</b><span>Atomic facts</span><small>baseline ${baseline.factCount}</small></div><div class="metric"><b>${current.claimCount}</b><span>Claim nodes</span><small>${current.claimEdgeCount} edges</small></div><div class="metric"><b>${current.figureCount}/6</b><span>Required visuals</span><small>${current.figureTraceability.dataPointCount} datum</small></div><div class="metric"><b>${statusLabel(current.exportPassed)}</b><span>Formal export</span><small>integrity ${escapeHtml(current.documentIntegrity ?? "n/a")}</small></div></div><table class="checks"><thead><tr><th>狀態</th><th>驗收項目</th><th>證據</th></tr></thead><tbody>${checkTableHtml(checks.slice(0,9))}</tbody></table><div class="notice ${attachmentsPresent ? "success" : "danger"}"><b>輸入材料：</b>${escapeHtml(missingNotice)}</div><div class="footer"><span>Automated evidence gates</span><span>2 / 10</span></div></section>

<section class="page"><h2>02｜架構：從來源拼接改成主張重建</h2><p>舊路徑讓 writer 直接面對逐來源 evidence cards，段落自然跟著來源順序走；精確數字被保留在附錄表格，卻沒有成為主文論證。新路徑先把來源拆成事實與概念，再以跨來源主張與視覺計畫組織閱讀順序。</p><div class="pipeline"><div class="node">Raw sources</div><div class="node">Atomic Evidence Facts</div><div class="node">Concept Normalization</div><div class="node">Cross-source Claim Graph</div><div class="node">Visual Evidence Plan</div><div class="node">Narrative Plan</div><div class="node">Original Narrative</div><div class="node">Citation / Factual Verification</div><div class="node">Preview / DOCX / PDF</div></div><h3>資料模型實證</h3><table><thead><tr><th>層</th><th>current artifact</th><th>用途</th></tr></thead><tbody><tr><td>Facts</td><td>${current.factCount} 筆；每個數值結果可獨立 fact</td><td>保留母群、暴露、結果、統計型態、CI、directness、locator 與限制</td></tr><tr><td>Claim Graph</td><td>${current.claimCount} nodes / ${current.claimEdgeCount} edges</td><td>支撐、矛盾、背景、適用性與引用身分在 claim 層綁定</td></tr><tr><td>Narrative passes</td><td>${escapeHtml(current.narrativePasses.join(" → ") || "未建立")}</td><td>先教會讀者，再補回精確術語、數字、限制與作者年份</td></tr><tr><td>Canonical model</td><td>generated-report.json + export gate</td><td>Preview、DOCX、PDF 不各自重寫內容</td></tr></tbody></table><div class="notice"><b>不能錯誤合併：</b>TikTok 使用 ≠ 短影音成癮；一般社群媒體 ≠ 短影音；睡眠品質分數 ≠ 睡眠不佳比例；大學生機制參照 ≠ 高中生直接效果。</div><div class="footer"><span>Architecture and data contracts</span><span>3 / 10</span></div></section>

<section class="page"><h2>03｜Writer 隔離與兩階段重建</h2><div class="boundary"><div class="zone extract"><h3>Extraction zone</h3><p>可讀：raw abstract、full-text span、snippet、source-order evidence cards。</p><p class="denied">禁止直接傳給正文 LLM message。</p></div><div class="wall">ISOLATION BOUNDARY</div><div class="zone write"><h3>Writing zone</h3><p>只讀：normalized facts、claim graph、comparability、visual summary、citation identity、applicability／limitations。</p><p class="allowed">Teach-back 先不放完整引用；academic reconstruction 再依 claim entailment 補回。</p></div></div><h3>稽核方法</h3><ul><li><b>正向：</b>current plan 必須同時有 teach_back 與 academic_reconstruction，writer model-completed sections &gt; 0，post-edit validation pass。</li><li><b>負向：</b>測試以 raw support span／numeric sentence sentinel 注入抽取層，斷言兩次實際 LLM request 都不含 sentinel。</li><li><b>邊界：</b><code>/api/report-drafts</code> HTTP orchestration request 為了 canonicalization 仍可能攜帶 accepted sources 與 evidence cards；隔離主張只指「實際 writer LLM message projection」，不把 route transport 誤稱 raw-free。</li><li><b>Echo：</b>source-led、paper-by-paper stitching、blanket citation cluster 任何一項未清除都應重生或阻擋。</li></ul><table class="checks"><thead><tr><th>狀態</th><th>檢查</th><th>current</th></tr></thead><tbody>${checkTableHtml(checks.filter((check) => ["two_pass_writer","writer_success","writer_isolation_test","source_stitching"].includes(check.id)))}</tbody></table><div class="notice ${current.writerFallbackSections === 0 ? "success" : "danger"}"><b>目前 writer：</b>model-completed=${current.writerModelCompletedSections}；fallback=${current.writerFallbackSections}；postEdit=${escapeHtml(current.postEditStatus ?? "n/a")}。fallback 不是「可接受的退化」，而是正式匯出阻擋條件。</div><div class="footer"><span>LLM input isolation and reconstruction</span><span>4 / 10</span></div></section>

<section class="page"><h2>04｜六圖 mini-brief（1–2）</h2><p class="small">每層都有 primary owner、encoding、靜態 fallback、無障礙路徑與可執行 QA。這些是圖表語意合約，不是裝飾卡片。</p><div class="brief-grid">${miniBriefHtml(visualBriefs[0],0)}${miniBriefHtml(visualBriefs[1],1)}</div><div class="color-ledger"><div class="swatch neutral">Neutral：脈絡／非焦點</div><div class="swatch primary">Primary：直接證據</div><div class="swatch compare">Compare：參照／限制</div><div class="swatch alert">Alert：阻擋／不可外推</div></div><p class="tiny">共用色彩語意：同一顏色不可在另一圖突然改代表不同概念；所有核心數值用文字直接標示，因此灰階與色覺差異下仍可讀。</p><div class="footer"><span>Embedded visualization self-use gate</span><span>5 / 10</span></div></section>

<section class="page"><h2>05｜六圖 mini-brief（3–4）</h2><div class="brief-grid">${miniBriefHtml(visualBriefs[2],2)}${miniBriefHtml(visualBriefs[3],3)}</div><div class="notice"><b>統計語意底線：</b>OR 不畫成百分比、不自動翻成「風險增加 33%」；r 不乘 100；CI 必須保留上下界；基準線固定 1；量表方向未核對時不把正負相關翻譯成睡眠變好／變差。</div><h3>Required numeric invariant</h3><p><code>34.7%</code>、<code>31.06%</code>、<code>OR 1.33 [1.01–1.77]</code>、<code>OR 1.26 [1.16–1.37]</code>、<code>OR 1.69 [1.19–2.40]</code>、<code>r=0.439 / 0.404 / 0.457</code> 必須從 fact → figure datum → source／locator 一路可追；不能只靠像素看起來正確。</p><div class="footer"><span>Statistical and uncertainty visuals</span><span>6 / 10</span></div></section>

<section class="page"><h2>06｜六圖 mini-brief（5–6）</h2><div class="brief-grid">${miniBriefHtml(visualBriefs[4],4)}${miniBriefHtml(visualBriefs[5],5)}</div><div class="notice"><b>Image2 分工：</b>統計數字、標籤、箭頭、座標軸、forest plot 與表格全部由 deterministic renderer 產生。Image2 若未設定，概念圖以可追溯 SVG fallback，不能假稱生成圖片成功。</div><h3>Fresh-pass status</h3><p class="small">本 QA 採本地 specialist pass：視覺策略負責 claim／chart fit，統計視覺化負責 OR、CI、r 與不可比較性，報告匯出負責靜態資產與 PDF，無障礙 pass 負責 direct labels／alt text，測試 pass 負責 datum invariants、非空匯出與逐頁人工檢視。</p><div class="footer"><span>Mechanism and applicability visuals</span><span>7 / 10</span></div></section>

<section class="page"><h2>07｜引用、直接性與數據追溯</h2><div class="metric-grid"><div class="metric"><b>${current.figureTraceability.dataPointCount}</b><span>Visual datum</span><small>${current.figureTraceability.unresolved.length} unresolved</small></div><div class="metric"><b>${current.mainBodyTableCount}</b><span>Main tables</span><small>gate ≤ 1</small></div><div class="metric"><b>${escapeHtml(current.keywords.length)}</b><span>Keywords</span><small>required exactly 5</small></div><div class="metric"><b>${productPdf.cjk}</b><span>Product PDF CJK</span><small>${productPdf.replacementGlyphs} replacement</small></div></div><h3>主張—引用規則</h3><ul><li>睡眠比例只引用真正提供 34.7% 或 31.06% 的來源；不同判定方式分面呈現。</li><li>OR 與 CI 只引用提供模型的來源；憂鬱 OR 是睡眠不佳模型中的 predictor，不把憂鬱研究誤作睡眠結果證據。</li><li>r 只引用提供三個係數的來源；中介圖只使用明示部分中介的來源。</li><li>一般社群媒體回顧只作背景；大學生只作機制參照；高中／中學生直接證據不可互換。</li><li>A／B 計數必須從同一 standardized fact 定義推導，方法段與成品不能各算一套。</li></ul><table class="checks"><thead><tr><th>狀態</th><th>檢查</th><th>證據</th></tr></thead><tbody>${checkTableHtml(checks.filter((check) => ["critical_values","traceability","table_gate","title_keywords","directness","canonical_parity"].includes(check.id)))}</tbody></table><div class="footer"><span>Claim-citation entailment and directness</span><span>8 / 10</span></div></section>

<section class="page"><h2>08｜Before / after 視覺稽核</h2><div class="shots"><figure class="shot">${baselineScreenshot ? `<img src="${baselineScreenshot}" alt="Archived baseline page showing source-by-source evidence tables." />` : `<div class="placeholder">baseline screenshot unavailable</div>`}<figcaption class="caption">Before：archived baseline 第 9 頁；精確數值被塞進逐來源表格，主文沒有結果視覺。這不是缺失的 formal-report(2).docx。</figcaption></figure><figure class="shot">${currentScreenshot ? `<img src="${currentScreenshot}" alt="Current report page showing a deterministic evidence visualization beside its claim." />` : `<div class="placeholder">current PDF 尚未產生或 export gate blocked</div>`}<figcaption class="caption">${currentScreenshot ? `After：current product PDF 第 ${currentFigurePage} 頁；確定性圖表與對應論點相鄰，數值與來源可追溯。` : "After：formal export gate 已阻擋 current product PDF；canonical model 雖已有六圖與完整 provenance，仍不得冒充正式成品。"}</figcaption></figure></div><table class="comparison"><thead><tr><th>面向</th><th>Before</th><th>After</th></tr></thead><tbody>${beforeAfterTableHtml(comparisonRows.slice(0,5))}</tbody></table><div class="footer"><span>Archived baseline vs current canonical output</span><span>9 / 10</span></div></section>

<section class="page"><h2>09｜測試、CJK、限制與結論</h2>${testSummaryHtml(tests, namedTestValidation)}<table class="checks"><thead><tr><th>狀態</th><th>最後 gate</th><th>證據</th></tr></thead><tbody>${checkTableHtml(checks.slice(9))}</tbody></table><div class="two-col"><div><h3>逐頁與跨格式</h3><ul><li>Product Chromium PDF：${productPdf.pages} 頁、${productPdf.cjk} CJK、${productPdf.replacementGlyphs} replacement glyph。</li><li>DOCX→LibreOffice PDF：${libreOfficePdf.exists ? `${libreOfficePdf.pages} 頁、${libreOfficePdf.cjk} CJK、${libreOfficePdf.replacementGlyphs} replacement glyph` : "尚未提供可檢查的 render PDF"}。</li><li>本 QA PDF 必須以 Poppler render 成 PNG，逐頁檢查裁切、重疊、缺字、破表與頁碼。</li></ul></div><div><h3>尚未解決的證據限制</h3><ul><li>多數來源仍是摘要層級，不能補造量表方向、抽樣細節、控制變項或頁碼。</li><li>橫斷相關與統計中介不能建立因果。</li><li>母群、暴露、結果與量測不相容時不可 pooling、排名或平均。</li><li>${escapeHtml(missingNotice)}</li></ul></div></div><div class="stamp">${escapeHtml(overallLabel)}</div><p class="tiny">本報告由 ${basename(scriptPath)} 可重跑產生；audit JSON 保存每項 gate、視覺 mini-brief 與 before/after 指標。未 commit、push 或 deploy。</p><div class="footer"><span>Final QA decision</span><span>10 / 10</span></div></section>
</body></html>`;

  const htmlPath = resolve(outputDirectory, "ResearchForge-知識重建與視覺綜合-QA.html");
  const pdfPath = resolve(outputDirectory, "ResearchForge-知識重建與視覺綜合-QA.pdf");
  const auditPath = resolve(outputDirectory, "before-after-audit.json");
  await Promise.all([
    writeFile(htmlPath, html, "utf8"),
    writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8"),
  ]);

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1800 } });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await browser.close();
  }

  const qaPdfMetrics = await pdfMetrics(pdfPath);
  const runSummary = {
    htmlPath,
    pdfPath,
    auditPath,
    verdict: audit.verdict,
    qaPdf: {
      pages: qaPdfMetrics.pages,
      cjk: qaPdfMetrics.cjk,
      replacementGlyphs: qaPdfMetrics.replacementGlyphs,
    },
    missingCurrentFiles,
  };
  await writeFile(
    resolve(outputDirectory, "qa-report-run-summary.json"),
    `${JSON.stringify(runSummary, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${JSON.stringify(runSummary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
