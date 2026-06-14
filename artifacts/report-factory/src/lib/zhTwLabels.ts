export const PREFLIGHT_DEBUG_LABELS = {
  domains: "主題領域",
  recommended_keywords: "建議搜尋關鍵詞",
  preferred_source_types: "優先資料來源類型",
  avoid_source_types: "避免資料來源類型",
  common_failure_modes: "常見誤判風險",
} as const;

export type PreflightDebugLabelKey = keyof typeof PREFLIGHT_DEBUG_LABELS;

export function preflightDebugLabel(key: PreflightDebugLabelKey): string {
  return PREFLIGHT_DEBUG_LABELS[key];
}

export const SEARCH_INTENT_DEBUG_LABELS = {
  searchIntent: "搜尋意圖",
  primaryConcepts: "核心概念",
  contextConcepts: "場域概念",
  outcomeConcepts: "影響結果",
  mustHaveTerms: "必須相關詞",
  lowWeightTerms: "低權重詞",
  plannerStatus: "搜尋規劃狀態",
  fallbackUsed: "是否使用備援規劃",
} as const;

export type SearchIntentDebugLabelKey = keyof typeof SEARCH_INTENT_DEBUG_LABELS;

export function searchIntentDebugLabel(key: SearchIntentDebugLabelKey): string {
  return SEARCH_INTENT_DEBUG_LABELS[key];
}
