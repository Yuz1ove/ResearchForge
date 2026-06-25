export type ReportFontOptionId =
  | "system-ui"
  | "kai"
  | "ming"
  | "jh"
  | "noto-sans-tc"
  | "noto-serif-tc"
  | "times"
  | "georgia"
  | "arial"
  | "helvetica"
  | "mono";

export interface ReportFontOption {
  id: ReportFontOptionId;
  label: string;
  fontFamily: string;
}

export interface ReportPresentationSettings {
  fontId: ReportFontOptionId;
  fontFamily: string;
  fontSizePx: number;
  lineHeight: number;
  paragraphSpacingPx: number;
  headingStyle: "classic" | "modern";
}

export const REPORT_FONT_OPTIONS: ReportFontOption[] = [
  {
    id: "system-ui",
    label: "系統預設",
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  {
    id: "kai",
    label: "標楷體",
    fontFamily: '"DFKai-SB", "標楷體", "BiauKai", "Kaiti TC", "KaiTi", serif',
  },
  {
    id: "ming",
    label: "新細明體",
    fontFamily: '"PMingLiU", "新細明體", "MingLiU", "細明體", "Songti TC", serif',
  },
  {
    id: "jh",
    label: "微軟正黑體",
    fontFamily: '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Heiti TC", sans-serif',
  },
  {
    id: "noto-sans-tc",
    label: "思源黑體",
    fontFamily: '"Noto Sans TC", "Noto Sans CJK TC", "Source Han Sans TC", sans-serif',
  },
  {
    id: "noto-serif-tc",
    label: "思源宋體",
    fontFamily: '"Noto Serif TC", "Noto Serif CJK TC", "Source Han Serif TC", "Songti TC", serif',
  },
  {
    id: "times",
    label: "Times New Roman",
    fontFamily: '"Times New Roman", Times, serif',
  },
  {
    id: "georgia",
    label: "Georgia",
    fontFamily: 'Georgia, "Times New Roman", serif',
  },
  {
    id: "arial",
    label: "Arial",
    fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  },
  {
    id: "helvetica",
    label: "Helvetica / Inter",
    fontFamily: '"Helvetica Neue", Helvetica, Inter, Arial, sans-serif',
  },
  {
    id: "mono",
    label: "等寬字體",
    fontFamily: '"SFMono-Regular", "Cascadia Mono", Consolas, "Liberation Mono", monospace',
  },
];

export const REPORT_FONT_INSTALL_NOTE = "實際顯示依裝置已安裝字體而定。";

export const DEFAULT_REPORT_PRESENTATION: ReportPresentationSettings = {
  fontId: "jh",
  fontFamily:
    '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Heiti TC", sans-serif',
  fontSizePx: 16,
  lineHeight: 1.95,
  paragraphSpacingPx: 14,
  headingStyle: "classic",
};

export function reportFontOptionById(id: ReportFontOptionId): ReportFontOption {
  return (
    REPORT_FONT_OPTIONS.find((option) => option.id === id) ??
    REPORT_FONT_OPTIONS[0]!
  );
}

export function normalizeReportPresentation(
  value: Partial<ReportPresentationSettings> | null | undefined,
): ReportPresentationSettings {
  const fontOption = value?.fontId
    ? reportFontOptionById(value.fontId)
    : REPORT_FONT_OPTIONS.find((option) => option.fontFamily === value?.fontFamily) ??
      reportFontOptionById(DEFAULT_REPORT_PRESENTATION.fontId);
  return {
    fontId: fontOption.id,
    fontFamily: value?.fontFamily?.trim() || fontOption.fontFamily,
    fontSizePx:
      typeof value?.fontSizePx === "number" && value.fontSizePx >= 12 && value.fontSizePx <= 22
        ? value.fontSizePx
        : DEFAULT_REPORT_PRESENTATION.fontSizePx,
    lineHeight:
      typeof value?.lineHeight === "number" && value.lineHeight >= 1.5 && value.lineHeight <= 2.4
        ? value.lineHeight
        : DEFAULT_REPORT_PRESENTATION.lineHeight,
    paragraphSpacingPx:
      typeof value?.paragraphSpacingPx === "number" &&
      value.paragraphSpacingPx >= 4 &&
      value.paragraphSpacingPx <= 28
        ? value.paragraphSpacingPx
        : DEFAULT_REPORT_PRESENTATION.paragraphSpacingPx,
    headingStyle:
      value?.headingStyle === "modern" || value?.headingStyle === "classic"
        ? value.headingStyle
        : DEFAULT_REPORT_PRESENTATION.headingStyle,
  };
}

export function primaryFontName(fontFamily: string): string {
  return (
    fontFamily
      .split(",")[0]
      ?.replace(/^["']|["']$/g, "")
      .trim() || "Microsoft JhengHei"
  );
}
