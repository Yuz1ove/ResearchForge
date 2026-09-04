import {
  ResearchProductExportResponseSchema,
  ResearchProductWorkflowSnapshotV1Schema,
  VerifyExistingReportResponseSchema,
  type CreateResearchProductProjectRequest,
  type EditWorkflowSectionRequest,
  type EvidenceDecisionInput,
  type ResearchProductExportResponse,
  type ResearchProductWorkflowSnapshotV1,
  type SourceCandidateInput,
  type VerifyExistingReportRequest,
  type VerifyExistingReportResponse,
  type WorkflowEvidenceCardInput,
} from "@workspace/api-zod/research-product-workflow";

export class ResearchProductWorkflowApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(input: { code: string; message: string; status: number }) {
    super(input.message);
    this.name = "ResearchProductWorkflowApiError";
    this.code = input.code;
    this.status = input.status;
  }
}

function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!base && import.meta.env.PROD) {
    throw new ResearchProductWorkflowApiError({
      code: "API_BASE_URL_NOT_CONFIGURED",
      message: "VITE_API_BASE_URL is not configured for this deployment.",
      status: 0,
    });
  }
  return base ? `${base.replace(/\/+$/u, "")}${path}` : path;
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.text();
  let payload: unknown;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    throw new ResearchProductWorkflowApiError({
      code: "NON_JSON_RESPONSE",
      message: `Research product API returned a non-JSON response (HTTP ${response.status}).`,
      status: response.status,
    });
  }
  if (!response.ok) {
    const detail = payload as { code?: unknown; message?: unknown } | null;
    throw new ResearchProductWorkflowApiError({
      code: typeof detail?.code === "string" ? detail.code : "REQUEST_FAILED",
      message:
        typeof detail?.message === "string"
          ? detail.message
          : `Research product request failed (HTTP ${response.status}).`,
      status: response.status,
    });
  }
  return payload;
}

function parseSnapshot(payload: unknown): ResearchProductWorkflowSnapshotV1 {
  const result = ResearchProductWorkflowSnapshotV1Schema.safeParse(payload);
  if (!result.success) {
    throw new ResearchProductWorkflowApiError({
      code: "RESPONSE_SCHEMA_INVALID",
      message: "Research product API returned an invalid workflow snapshot.",
      status: 200,
    });
  }
  return result.data;
}

function projectPath(projectId: string, suffix = ""): string {
  return `/api/research-product/projects/${encodeURIComponent(projectId)}${suffix}`;
}

function jsonBody(value: unknown): Pick<RequestInit, "body" | "headers"> {
  return {
    body: JSON.stringify(value),
    headers: { "content-type": "application/json" },
  };
}

export async function createResearchProductProject(
  input: CreateResearchProductProjectRequest,
): Promise<ResearchProductWorkflowSnapshotV1> {
  return parseSnapshot(
    await requestJson("/api/research-product/projects", {
      method: "POST",
      ...jsonBody(input),
    }),
  );
}

export async function fetchResearchProductProject(
  projectId: string,
): Promise<ResearchProductWorkflowSnapshotV1> {
  return parseSnapshot(await requestJson(projectPath(projectId)));
}

export async function runResearchProductLiveDiscovery(
  projectId: string,
): Promise<ResearchProductWorkflowSnapshotV1> {
  return parseSnapshot(
    await requestJson(projectPath(projectId, "/research-runs"), {
      method: "POST",
      ...jsonBody({}),
    }),
  );
}

export async function registerResearchProductSources(
  projectId: string,
  candidates: SourceCandidateInput[],
): Promise<ResearchProductWorkflowSnapshotV1> {
  return parseSnapshot(
    await requestJson(projectPath(projectId, "/sources"), {
      method: "POST",
      ...jsonBody({ candidates, providerFailures: [] }),
    }),
  );
}

export async function registerResearchProductEvidence(
  projectId: string,
  evidenceCards: WorkflowEvidenceCardInput[],
): Promise<ResearchProductWorkflowSnapshotV1> {
  return parseSnapshot(
    await requestJson(projectPath(projectId, "/evidence"), {
      method: "POST",
      ...jsonBody({ evidenceCards }),
    }),
  );
}

export async function reviewResearchProductEvidence(
  projectId: string,
  decisions: EvidenceDecisionInput[],
): Promise<ResearchProductWorkflowSnapshotV1> {
  return parseSnapshot(
    await requestJson(projectPath(projectId, "/evidence-decisions"), {
      method: "POST",
      ...jsonBody({ decisions }),
    }),
  );
}

export async function buildResearchProductPlan(
  projectId: string,
): Promise<ResearchProductWorkflowSnapshotV1> {
  return parseSnapshot(
    await requestJson(projectPath(projectId, "/report-plan"), {
      method: "PUT",
      ...jsonBody({}),
    }),
  );
}

export async function generateResearchProductReport(
  projectId: string,
): Promise<ResearchProductWorkflowSnapshotV1> {
  return parseSnapshot(
    await requestJson(projectPath(projectId, "/generation-runs"), {
      method: "POST",
      ...jsonBody({}),
    }),
  );
}

export async function verifyResearchProductReport(
  projectId: string,
): Promise<ResearchProductWorkflowSnapshotV1> {
  return parseSnapshot(
    await requestJson(projectPath(projectId, "/verifications"), {
      method: "POST",
      ...jsonBody({}),
    }),
  );
}

export async function editResearchProductSection(
  projectId: string,
  sectionId: string,
  input: EditWorkflowSectionRequest,
): Promise<ResearchProductWorkflowSnapshotV1> {
  return parseSnapshot(
    await requestJson(
      projectPath(projectId, `/sections/${encodeURIComponent(sectionId)}`),
      { method: "PUT", ...jsonBody(input) },
    ),
  );
}

export async function exportResearchProductReport(
  projectId: string,
  format: "pdf" | "docx" | "markdown" | "json_bundle",
): Promise<ResearchProductExportResponse> {
  const payload = await requestJson(projectPath(projectId, "/exports"), {
    method: "POST",
    ...jsonBody({ format, allowDraft: false }),
  });
  const result = ResearchProductExportResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new ResearchProductWorkflowApiError({
      code: "RESPONSE_SCHEMA_INVALID",
      message: "Research product API returned an invalid export response.",
      status: 200,
    });
  }
  return result.data;
}

export async function verifyExistingReportApi(
  input: VerifyExistingReportRequest,
): Promise<VerifyExistingReportResponse> {
  const payload = await requestJson("/api/research-product/verify-existing-report", {
    method: "POST",
    ...jsonBody(input),
  });
  const result = VerifyExistingReportResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new ResearchProductWorkflowApiError({
      code: "RESPONSE_SCHEMA_INVALID",
      message: "Research product API returned an invalid verification response.",
      status: 200,
    });
  }
  return result.data;
}

