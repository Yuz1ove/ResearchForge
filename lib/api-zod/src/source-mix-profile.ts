import { z } from "zod";

export const SOURCE_MIX_PROFILE_IDS = [
  "academic_strict",
  "school_report_balanced",
  "public_explainer",
  "professional_guidance",
  "business_industry",
] as const;
export const SourceMixProfileSchema = z.enum(SOURCE_MIX_PROFILE_IDS);
export type SourceMixProfile = z.infer<typeof SourceMixProfileSchema>;

export const SOURCE_ROLE_BUCKETS = [
  "background_definition",
  "academic_evidence",
  "official_statistics",
  "professional_guidance",
  "case_or_news",
  "data_or_dataset",
] as const;
export const SourceRoleBucketSchema = z.enum(SOURCE_ROLE_BUCKETS);
export type SourceRoleBucket = z.infer<typeof SourceRoleBucketSchema>;

export interface SourceRoleTarget {
  min: number;
  target: number;
  max: number;
}

export interface SourceMixProfileDefinition {
  id: SourceMixProfile;
  labelZhTw: string;
  descriptionZhTw: string;
  roleTargets: Record<SourceRoleBucket, SourceRoleTarget>;
  primaryEvidenceRoles: SourceRoleBucket[];
}

const fixed = (target: number, max = target): SourceRoleTarget => ({
  min: target,
  target,
  max,
});

export const SOURCE_MIX_PROFILE_DEFINITIONS: Record<
  SourceMixProfile,
  SourceMixProfileDefinition
> = {
  academic_strict: {
    id: "academic_strict",
    labelZhTw: "學術嚴格",
    descriptionZhTw: "以同儕審查研究與正式資料為主，背景來源只作界定概念。",
    roleTargets: {
      background_definition: { min: 0, target: 1, max: 1 },
      academic_evidence: fixed(5, 8),
      official_statistics: { min: 0, target: 1, max: 2 },
      professional_guidance: { min: 0, target: 1, max: 2 },
      case_or_news: { min: 0, target: 0, max: 1 },
      data_or_dataset: { min: 0, target: 1, max: 2 },
    },
    primaryEvidenceRoles: [
      "academic_evidence",
      "official_statistics",
      "professional_guidance",
      "data_or_dataset",
    ],
  },
  school_report_balanced: {
    id: "school_report_balanced",
    labelZhTw: "學校報告均衡",
    descriptionZhTw: "高中、國中與一般學校報告使用百科背景、學術證據、官方或專業資料與案例來源的均衡組合。",
    roleTargets: {
      background_definition: { min: 1, target: 1, max: 2 },
      academic_evidence: fixed(2),
      official_statistics: { min: 1, target: 1, max: 2 },
      professional_guidance: { min: 1, target: 1, max: 2 },
      case_or_news: fixed(1),
      data_or_dataset: { min: 0, target: 1, max: 1 },
    },
    primaryEvidenceRoles: [
      "academic_evidence",
      "official_statistics",
      "professional_guidance",
      "data_or_dataset",
    ],
  },
  public_explainer: {
    id: "public_explainer",
    labelZhTw: "大眾解說",
    descriptionZhTw: "以清楚背景解釋、官方資料與可信機構說明為主，搭配少量研究。",
    roleTargets: {
      background_definition: { min: 1, target: 2, max: 3 },
      academic_evidence: { min: 1, target: 2, max: 3 },
      official_statistics: { min: 1, target: 2, max: 3 },
      professional_guidance: { min: 0, target: 1, max: 2 },
      case_or_news: { min: 0, target: 1, max: 2 },
      data_or_dataset: { min: 0, target: 1, max: 2 },
    },
    primaryEvidenceRoles: [
      "academic_evidence",
      "official_statistics",
      "professional_guidance",
    ],
  },
  professional_guidance: {
    id: "professional_guidance",
    labelZhTw: "專業指引",
    descriptionZhTw: "醫療、長照、社工、心理與實務建議主題，以專業指南、官方資料與研究證據交叉支撐。",
    roleTargets: {
      background_definition: { min: 0, target: 1, max: 2 },
      academic_evidence: { min: 1, target: 2, max: 4 },
      official_statistics: { min: 1, target: 2, max: 3 },
      professional_guidance: { min: 2, target: 3, max: 5 },
      case_or_news: { min: 0, target: 1, max: 1 },
      data_or_dataset: { min: 0, target: 1, max: 2 },
    },
    primaryEvidenceRoles: [
      "professional_guidance",
      "academic_evidence",
      "official_statistics",
      "data_or_dataset",
    ],
  },
  business_industry: {
    id: "business_industry",
    labelZhTw: "商業產業",
    descriptionZhTw: "商業、產品與產業分析以公司、官方、產業機構、資料與可信媒體交叉驗證。",
    roleTargets: {
      background_definition: { min: 0, target: 1, max: 2 },
      academic_evidence: { min: 0, target: 1, max: 2 },
      official_statistics: { min: 1, target: 2, max: 3 },
      professional_guidance: { min: 1, target: 2, max: 3 },
      case_or_news: { min: 1, target: 2, max: 3 },
      data_or_dataset: { min: 1, target: 2, max: 3 },
    },
    primaryEvidenceRoles: [
      "official_statistics",
      "professional_guidance",
      "data_or_dataset",
      "academic_evidence",
    ],
  },
};

export interface ResolveSourceMixProfileInput {
  sourceMixProfile?: string | null;
  reportType?: string | null;
  audience?: string | null;
  domainHints?: string[] | null;
  topic?: string | null;
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function resolveSourceMixProfile(
  input: ResolveSourceMixProfileInput,
): SourceMixProfile {
  const explicit = SourceMixProfileSchema.safeParse(input.sourceMixProfile);
  if (explicit.success) return explicit.data;

  const text = [
    input.reportType ?? "",
    input.audience ?? "",
    input.topic ?? "",
    ...(input.domainHints ?? []),
  ]
    .join(" ")
    .toLowerCase();

  if (
    includesAny(text, [
      /商業|企業|產業|產品|市場|競爭|business|industry|market|product|company/,
    ])
  ) {
    return "business_industry";
  }
  if (
    includesAny(text, [
      /醫療|長照|社工|心理|健康|照護|臨床|medical|health|care|social work|psycholog/,
      /veterinary|獸醫|動物醫院/,
    ])
  ) {
    return "professional_guidance";
  }
  if (
    includesAny(text, [
      /大學|研究所|碩士|博士|專業|學術|論文|university|college|graduate|academic|professional/,
    ])
  ) {
    return "academic_strict";
  }
  if (
    includesAny(text, [
      /高中|國中|中學|小學|學校|校園|學生|school|junior high|senior high|high school|middle school/,
    ])
  ) {
    return "school_report_balanced";
  }

  return "school_report_balanced";
}

export function sourceMixProfileDefinition(
  profile: SourceMixProfile,
): SourceMixProfileDefinition {
  return SOURCE_MIX_PROFILE_DEFINITIONS[profile];
}
