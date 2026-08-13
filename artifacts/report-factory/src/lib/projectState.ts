import {
  TOPIC_CATEGORIES,
  GENERATION_MODES,
  ACADEMIC_LEVELS,
  REPORT_STYLES,
  REPORT_LENGTHS,
} from "./generateReport";

// ─── Project handoff (E) ──────────────────────────────────────────────────────
// A self-describing snapshot of the app's current capabilities, exported as
// Markdown so a future developer (or AI) can pick up the project quickly.
// This is generated from live constants, so it never drifts from the engine.

const APP_NAME = "ResearchForge";
const APP_VERSION = "V3";

/** buildProjectHandoff — render a Traditional-Chinese project status document
 *  describing the engine's domains, modes and export options. */
export function buildProjectHandoff(): string {
  const today = new Date().toLocaleDateString("zh-TW");
  const lines: string[] = [
    `# ${APP_NAME}（${APP_VERSION}）專案狀態`,
    "",
    `- 匯出日期：${today}`,
    "- 性質：繁體中文 AI 報告「規劃」引擎（目前為本地模擬生成，未串接外部模型）。",
    "- 重要原則：不杜撰事實與引用，未證實處以〔…〕或「資料來源待補」標示。",
    "",
    "## 支援領域（AI 判定 / 可手動覆寫）",
    ...TOPIC_CATEGORIES.map((c) => `- ${c}`),
    "",
    "## 生成模式",
    ...GENERATION_MODES.map((m) => `- ${m}`),
    "",
    "## 學術程度",
    ...ACADEMIC_LEVELS.map((l) => `- ${l}`),
    "",
    "## 報告風格",
    ...REPORT_STYLES.map((s) => `- ${s}`),
    "",
    "## 報告長度",
    ...REPORT_LENGTHS.map((l) => `- ${l}`),
    "",
    "## 匯出格式",
    "- Word（DOCX）、PDF（列印）、Markdown、TXT、複製文字",
    "- 研究藍圖（規劃用 Markdown）、AI 提示包（可貼入其他 AI）、JSON（機器可讀）",
    "- 專案狀態（本文件）",
    "",
    "## 後續接上真實模型的方式",
    "- 將 `src/lib/generateReport.ts` 中 `generateReport()` 的函式主體替換為非同步模型呼叫，",
    "  並維持回傳的 `GeneratedReport` 結構不變，UI 即無需修改。",
  ];
  return lines.join("\n");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadProjectHandoff() {
  const blob = new Blob([buildProjectHandoff()], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, `${APP_NAME}-專案狀態.md`);
}
