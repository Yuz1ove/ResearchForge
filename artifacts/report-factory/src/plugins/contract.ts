export type ReportFactoryPluginKind =
  | "orchestrator"
  | "writer"
  | "source"
  | "citation"
  | "export"
  | "quality";

export type ReportFactoryPluginStatus = "planned" | "mock" | "alpha" | "active" | "disabled";

export interface ReportFactoryPluginCapability {
  id: string;
  description: string;
  inputContract: string;
  outputContract: string;
}

export interface ReportFactoryPluginManifest {
  id: string;
  name: string;
  version: string;
  kind: ReportFactoryPluginKind;
  status: ReportFactoryPluginStatus;
  description: string;
  capabilities: ReportFactoryPluginCapability[];
  dependsOn?: string[];
  warnings?: string[];
}

export interface PluginRegistryEntry {
  manifest: ReportFactoryPluginManifest;
  enabled: boolean;
  execute?: ReportFactoryPluginExecute;
}

export interface PluginRegistrySnapshot {
  plugins: PluginRegistryEntry[];
  enabledPluginIds: string[];
  disabledPluginIds: string[];
}

export type ReportFactoryPluginExecute = (input: unknown) => unknown | Promise<unknown>;

export type ReportDocumentBlockType = "paragraph" | "list" | "note" | "quality";

export interface ReportDocumentQualityCheck {
  label: string;
  passed: boolean;
  reason?: string;
}

export interface ReportDocumentBlock {
  type: ReportDocumentBlockType;
  text?: string;
  items?: string[];
  checks?: ReportDocumentQualityCheck[];
}

export interface ReportDocumentSection {
  id: string;
  title: string;
  blocks: ReportDocumentBlock[];
}

export interface ReportDocument {
  schemaVersion: "report-document-v1";
  title: string;
  topic: string;
  reportType: string;
  language: string;
  sections: ReportDocumentSection[];
  warnings: string[];
  citationPolicy: {
    style: string;
    allowPlaceholders: boolean;
    noFabricatedCitations: boolean;
  };
  meta: {
    intent?: string;
    category?: string;
    pluginId?: string;
  };
}

export interface DocxPluginInput {
  document: ReportDocument;
  mode?: "blob" | "download";
}

export interface DocxPluginResult {
  format: "docx";
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  downloaded: boolean;
  blob?: Blob;
  warnings: string[];
}

export function isReportFactoryPluginManifest(value: unknown): value is ReportFactoryPluginManifest {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<ReportFactoryPluginManifest>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.version === "string" &&
    typeof candidate.kind === "string" &&
    typeof candidate.status === "string" &&
    typeof candidate.description === "string" &&
    Array.isArray(candidate.capabilities)
  );
}
