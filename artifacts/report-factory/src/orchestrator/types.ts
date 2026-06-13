export type ResearchWritingIntent = "academic_research_report" | "applied_research" | "software_project";

export type VariableRole =
  | "independent_variable"
  | "dependent_variable"
  | "control_or_context_variable"
  | "related_factor";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ResearchWritingOrchestratorInput {
  topic: string;
  reportType?: string;
  audience?: string;
  language?: string;
  expectedLength?: string;
  sourceRequirement?: string;
  outputFormat?: string[];
  constraints?: string[];
}

export interface TopicVariable {
  role: VariableRole;
  name: string;
  confidence: ConfidenceLevel;
  reason: string;
}

export interface TopicAnalysis {
  mainSubject: string;
  variables: TopicVariable[];
  possibleScope: string;
  riskWarnings: string[];
}

export interface SectionWritingPlan {
  sectionId: string;
  title: string;
  purpose: string;
  requiredEvidence: string[];
  writerInstruction: string;
  qualityRules: string[];
}

export interface SourcePlan {
  recommendedSourceTypes: string[];
  searchKeywords: string[];
  citationStyle: string;
  citationWarnings: string[];
}

export interface MethodPlan {
  recommendedMethods: string[];
  dataToCollect: string[];
  limitations: string[];
}

export interface ResearchWritingPlan {
  intent: ResearchWritingIntent;
  isSoftwareProject: boolean;
  domains: string[];
  researchStrategy: string;
  topicAnalysis: TopicAnalysis;
  researchQuestions: string[];
  hypotheses: string[];
  sectionPlan: SectionWritingPlan[];
  sourcePlan: SourcePlan;
  methodPlan: MethodPlan;
  qualityChecklist: string[];
  nextAction: string;
}

export interface DomainRule {
  domain: string;
  keywords: string[];
  recommendedSourceTypes: string[];
  methodHints: string[];
  dataHints: string[];
}

export interface SectionTemplate {
  sectionId: string;
  title: string;
  purpose: string;
}
