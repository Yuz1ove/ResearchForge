// generateReport.ts
// Mock generation function — replace generateReportContent() internals with OpenAI API call in the future.
// The function signature and return type should remain stable.

export interface ReportInput {
  topic: string;
  type: string;
  style: string;
  length: string;
}

export interface QualityCheck {
  label: string;
  passed: boolean;
}

export interface ReportDraft {
  title: string;
  summary: string;
  background: string;
  purpose: string;
  researchQuestions: string[];
  hypothesis: string;
  literatureOutline: string[];
  methodology: string;
  plannedCharts: string[];
  plannedImages: string[];
  limitations: string[];
  conclusion: string;
  qualityChecks: QualityCheck[];
}

// ─── Length multiplier helpers ────────────────────────────────────────────────

function lengthLabel(length: string): "short" | "medium" | "full" | "structure" {
  if (length.includes("短")) return "short";
  if (length.includes("研究架構")) return "structure";
  if (length.includes("完整")) return "full";
  return "medium";
}

// ─── Main mock generator ──────────────────────────────────────────────────────

/**
 * generateReportDraft
 * Synchronous mock — produces deterministic structured output from form inputs.
 * To connect OpenAI: replace the body of this function with an async fetch to
 * /api/generate (or directly to the OpenAI chat completions endpoint) and parse
 * the structured JSON response into ReportDraft.
 */
export function generateReportDraft(input: ReportInput): ReportDraft {
  const { topic, type, style, length } = input;
  const len = lengthLabel(length);
  const isAcademic = style === "學術正式" || style === "高中生可提交" || style === "詳細完整";
  const isBusiness = style === "商業顧問" || style === "Eric 90 分報告風格";

  // ── Title ──────────────────────────────────────────────────────────────────
  const title = `《${topic}》${type}`;

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary =
    len === "short"
      ? `本報告針對「${topic}」進行概要性探討，提供核心研究問題與初步結論，適合快速了解議題全貌。`
      : `本${type}以「${topic}」為核心主題，從研究背景、目的、方法與結論四大面向展開系統性探討。` +
        (isAcademic
          ? `報告採${style}語氣撰寫，符合學術規範，適合作為正式提交或研究前置準備之用。`
          : isBusiness
          ? `報告以${style}框架呈現，強調洞見明確、建議可行，適合對外報告或提案使用。`
          : `報告風格設定為「${style}」，兼顧內容完整性與可讀性。`);

  // ── Background ────────────────────────────────────────────────────────────
  const background =
    `「${topic}」是近年來受到廣泛關注的重要議題。` +
    (len !== "short"
      ? `隨著相關領域的快速發展，對此議題的系統性理解與分析需求日益增加。本${type}希望透過結構化的研究方式，釐清現有知識的脈絡，並為後續研究或實務應用提供參考依據。`
      : "");

  // ── Purpose ───────────────────────────────────────────────────────────────
  const purpose =
    `本研究主要目的為：\n` +
    `1. 系統性彙整「${topic}」的現有研究成果與理論基礎。\n` +
    `2. 分析此議題的核心變數與影響因素。\n` +
    (len === "full" || len === "structure"
      ? `3. 提出具體的研究假設，並設計可驗證的研究方法。\n4. 根據研究發現，提供具可行性的建議方向。`
      : `3. 整合研究發現，提供初步結論與建議。`);

  // ── Research Questions ────────────────────────────────────────────────────
  const researchQuestions = [
    `「${topic}」的主要影響因素有哪些？`,
    `針對「${topic}」，現有研究呈現哪些共識與爭議？`,
    ...(len !== "short"
      ? [
          `「${topic}」在實際應用場景中的效果與限制為何？`,
          `如何設計有效的研究方式來驗證相關假設？`,
        ]
      : []),
  ];

  // ── Hypothesis ────────────────────────────────────────────────────────────
  const hypothesis =
    len === "short"
      ? `預期「${topic}」與相關變數之間存在顯著關聯性，且此關聯可透過系統性研究方法加以驗證。`
      : `研究假設一：「${topic}」受到多重環境因素影響，且各因素間存在交互作用。\n` +
        `研究假設二：在控制相關干擾變數後，「${topic}」的核心效應具有統計顯著性。\n` +
        (len === "full" || len === "structure"
          ? `研究假設三：透過適當的介入措施，可有效改善「${topic}」相關的問題現況。`
          : "");

  // ── Literature Outline ────────────────────────────────────────────────────
  const literatureOutline = [
    `1. ${topic}的定義與理論基礎`,
    `2. 國內外相關研究回顧`,
    `3. 主要研究發現與爭議點整理`,
    ...(len !== "short"
      ? [
          `4. 研究缺口與本研究的定位`,
          `5. 關鍵概念的操作型定義`,
        ]
      : []),
  ];

  // ── Methodology ───────────────────────────────────────────────────────────
  const methodology =
    type.includes("實驗")
      ? `採用實驗研究法，設定實驗組與對照組，控制相關變數，記錄「${topic}」在不同條件下的量化結果，並進行統計分析。`
      : type.includes("市場") || type.includes("商業")
      ? `採用混合研究方法：量化方面蒐集市場數據與問卷調查，質化方面進行深度訪談與個案分析，最終整合兩類資料以獲得全面洞見。`
      : type.includes("讀書心得")
      ? `以文獻分析法為主，系統性閱讀並評析相關文獻，歸納主要論點，並結合個人反思提出見解。`
      : `本研究採用文獻回顧法結合個案分析，透過系統性蒐集、分析與整合相關資料，對「${topic}」進行深入探討，並以歸納與演繹並行的方式得出結論。`;

  // ── Planned Charts ────────────────────────────────────────────────────────
  const plannedCharts = [
    `長條圖：比較「${topic}」在不同條件或群體下的數值差異`,
    `折線圖：呈現「${topic}」隨時間或情境變化的趨勢`,
    ...(len !== "short"
      ? [
          `圓餅圖：各影響因素佔比分布`,
          `雷達圖：多維度指標的綜合比較`,
        ]
      : []),
  ];

  // ── Planned Images ────────────────────────────────────────────────────────
  const plannedImages = [
    `研究架構圖：呈現各變數間關係與研究流程`,
    `概念對照圖：直觀說明「${topic}」的核心概念`,
    ...(len !== "short"
      ? [`實驗/田野現場照片（如適用）`, `文獻來源摘要圖（心智圖或樹狀結構）`]
      : []),
  ];

  // ── Limitations ───────────────────────────────────────────────────────────
  const limitations = [
    `研究範圍限定於特定情境，結論的外部推論能力有限。`,
    `資料蒐集受時間與資源限制，樣本代表性仍有提升空間。`,
    ...(len === "full" || len === "structure"
      ? [
          `部分變數難以完全控制，可能影響研究結果的內部效度。`,
          `現有文獻在此議題上仍有研究缺口，需後續研究加以補充。`,
        ]
      : []),
  ];

  // ── Conclusion ────────────────────────────────────────────────────────────
  const conclusion =
    `綜合本${type}的研究分析，「${topic}」是一個值得深入探討的重要議題。` +
    (len !== "short"
      ? `透過系統性的文獻回顧與研究設計，本研究初步歸納出以下結論：（一）此議題受多重因素影響，需從整體視角加以理解；（二）現有研究雖已建立基礎框架，但在應用層面仍有顯著的發展空間；（三）後續研究可聚焦於更精細的變數操作與大樣本驗證，以強化研究結論的可信度。`
      : `建議後續針對核心問題進行更深入的研究，以取得更具代表性的結論。`);

  // ── Quality Checks ────────────────────────────────────────────────────────
  const qualityChecks: QualityCheck[] = [
    { label: "具備清楚的研究目的", passed: true },
    { label: "包含明確的研究問題", passed: researchQuestions.length > 0 },
    { label: "設有研究假設", passed: hypothesis.trim().length > 0 },
    { label: "規劃文獻探討方向", passed: literatureOutline.length >= 3 },
    { label: "說明研究方法", passed: methodology.trim().length > 0 },
    { label: "規劃圖表呈現", passed: plannedCharts.length > 0 },
    { label: "點出研究限制", passed: limitations.length > 0 },
    { label: "可直接作為後續修改基礎", passed: true },
    { label: `符合「${style}」報告語氣`, passed: true },
  ];

  return {
    title,
    summary,
    background,
    purpose,
    researchQuestions,
    hypothesis,
    literatureOutline,
    methodology,
    plannedCharts,
    plannedImages,
    limitations,
    conclusion,
    qualityChecks,
  };
}
