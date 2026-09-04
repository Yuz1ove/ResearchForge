import {
  Router,
  type ErrorRequestHandler,
  type IRouter,
  type RequestHandler,
} from "express";
import {
  CreateResearchProductProjectRequestSchema,
  EditWorkflowSectionRequestSchema,
  EvidenceRegistrationRequestSchema,
  EvidenceReviewRequestSchema,
  QuestionReplacementRequestSchema,
  ReportPlanRequestSchema,
  ResearchProductWorkflowSnapshotV1Schema,
  SourceRegistrationRequestSchema,
  WorkflowExportRequestSchema,
} from "@workspace/api-zod/research-product-workflow";
import {
  buildProductReportPlan,
  createResearchProductWorkflow,
  defaultResearchProductWorkflowRepository,
  editGeneratedSection,
  exportResearchProductWorkflow,
  generateEvidenceBoundSections,
  generateEvidenceBoundSectionsLive,
  ProductWorkflowError,
  registerEvidenceCards,
  registerSourceCandidates,
  replaceResearchQuestions,
  reviewEvidenceCards,
  type ResearchProductWorkflowRepository,
  type LiveEvidenceSectionRequester,
  verifyGeneratedClaims,
} from "../services/research/product-workflow";
import { materializeLiveSourceDiscovery } from "../services/research/live-product-discovery";
import {
  buildResearchProductDocx,
  buildResearchProductPdf,
} from "../services/research/product-document-export";
import { searchIntentSources } from "../services/search-intent-planner";

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

async function loadProject(
  repository: ResearchProductWorkflowRepository,
  projectId: string,
) {
  const snapshot = await repository.get(projectId);
  if (!snapshot) {
    throw new ProductWorkflowError(
      "PROJECT_NOT_FOUND",
      `Research product project ${projectId} was not found.`,
      404,
    );
  }
  return snapshot;
}

export function createResearchProductWorkflowRouter(options: {
  repository?: ResearchProductWorkflowRepository;
  sourceSearch?: typeof searchIntentSources;
  liveGenerationRequester?: LiveEvidenceSectionRequester;
} = {}): IRouter {
  const repository: ResearchProductWorkflowRepository = options.repository ?? {
    get: (projectId) => defaultResearchProductWorkflowRepository().get(projectId),
    save: (snapshot) => defaultResearchProductWorkflowRepository().save(snapshot),
  };
  const router: IRouter = Router();
  const sourceSearch = options.sourceSearch ?? searchIntentSources;

  router.post(
    "/research-product/projects",
    asyncRoute(async (req, res) => {
      const input = CreateResearchProductProjectRequestSchema.parse(req.body);
      const snapshot = createResearchProductWorkflow(input);
      await repository.save(snapshot);
      res.status(201).json(snapshot);
    }),
  );

  router.get(
    "/research-product/projects/:projectId",
    asyncRoute(async (req, res) => {
      res.json(await loadProject(repository, routeParam(req.params.projectId)));
    }),
  );

  router.post(
    "/research-product/projects/:projectId/research-runs",
    asyncRoute(async (req, res) => {
      const current = await loadProject(repository, routeParam(req.params.projectId));
      if (current.project.mode !== "LIVE") {
        throw new ProductWorkflowError(
          "INVALID_TRANSITION",
          "Live provider research is only permitted for a LIVE project.",
          409,
        );
      }
      const result = await sourceSearch(
        {
          topic: current.intent.topic,
          reportType: current.intent.reportType,
          audience: current.intent.targetAudience,
          language: current.intent.targetLanguage,
          searchProfile: current.intent.depth,
          sourceMode: "LIVE",
          workflowId: current.project.workflowId,
        },
        {
          disableLlm: true,
          queryLimit: 2,
          sourceSearch: { providers: ["OpenAlex", "Crossref", "Semantic Scholar"] },
          bypassCache: true,
          runtimeBudget: {
            overallSearchBudgetMs: 30_000,
            perQueryTimeoutMs: 10_000,
            maxConcurrentProviderRequests: 2,
          },
        },
      );
      const snapshot = materializeLiveSourceDiscovery(current, result);
      await repository.save(snapshot);
      res.json(snapshot);
    }),
  );

  router.put(
    "/research-product/projects/:projectId/questions",
    asyncRoute(async (req, res) => {
      const input = QuestionReplacementRequestSchema.parse(req.body);
      const current = await loadProject(repository, routeParam(req.params.projectId));
      const snapshot = replaceResearchQuestions(current, input.questions);
      await repository.save(snapshot);
      res.json(snapshot);
    }),
  );

  router.post(
    "/research-product/projects/:projectId/sources",
    asyncRoute(async (req, res) => {
      const input = SourceRegistrationRequestSchema.parse(req.body);
      const current = await loadProject(repository, routeParam(req.params.projectId));
      const snapshot = registerSourceCandidates(current, input.candidates, {
        providerFailures: input.providerFailures,
      });
      await repository.save(snapshot);
      res.json(snapshot);
    }),
  );

  router.post(
    "/research-product/projects/:projectId/evidence",
    asyncRoute(async (req, res) => {
      const input = EvidenceRegistrationRequestSchema.parse(req.body);
      const current = await loadProject(repository, routeParam(req.params.projectId));
      const snapshot = registerEvidenceCards(current, input.evidenceCards);
      await repository.save(snapshot);
      res.json(snapshot);
    }),
  );

  router.post(
    "/research-product/projects/:projectId/evidence-decisions",
    asyncRoute(async (req, res) => {
      const input = EvidenceReviewRequestSchema.parse(req.body);
      const current = await loadProject(repository, routeParam(req.params.projectId));
      const snapshot = reviewEvidenceCards(current, input.decisions);
      await repository.save(snapshot);
      res.json(snapshot);
    }),
  );

  router.put(
    "/research-product/projects/:projectId/report-plan",
    asyncRoute(async (req, res) => {
      const input = ReportPlanRequestSchema.parse(req.body ?? {});
      const current = await loadProject(repository, routeParam(req.params.projectId));
      const snapshot = buildProductReportPlan(current, input.sections);
      await repository.save(snapshot);
      res.json(snapshot);
    }),
  );

  router.post(
    "/research-product/projects/:projectId/generation-runs",
    asyncRoute(async (req, res) => {
      const current = await loadProject(repository, routeParam(req.params.projectId));
      const snapshot = current.project.mode === "LIVE"
        ? await generateEvidenceBoundSectionsLive(current, {
            requester: options.liveGenerationRequester,
          })
        : generateEvidenceBoundSections(current);
      await repository.save(snapshot);
      res.json(snapshot);
    }),
  );

  router.post(
    "/research-product/projects/:projectId/verifications",
    asyncRoute(async (req, res) => {
      const current = await loadProject(repository, routeParam(req.params.projectId));
      const snapshot = verifyGeneratedClaims(current);
      await repository.save(snapshot);
      res.json(snapshot);
    }),
  );

  router.put(
    "/research-product/projects/:projectId/sections/:sectionId",
    asyncRoute(async (req, res) => {
      const input = EditWorkflowSectionRequestSchema.parse(req.body);
      const current = await loadProject(repository, routeParam(req.params.projectId));
      const snapshot = editGeneratedSection(
        current,
        routeParam(req.params.sectionId),
        input,
      );
      await repository.save(snapshot);
      res.json(snapshot);
    }),
  );

  router.post(
    "/research-product/projects/:projectId/exports",
    asyncRoute(async (req, res) => {
      const input = WorkflowExportRequestSchema.parse(req.body);
      const current = await loadProject(repository, routeParam(req.params.projectId));
      const rendered = input.format === "pdf"
        ? {
            bytes: await buildResearchProductPdf(current),
            mediaType: "application/pdf",
          }
        : input.format === "docx"
          ? {
              bytes: await buildResearchProductDocx(current),
              mediaType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            }
          : undefined;
      const result = exportResearchProductWorkflow(current, input.format, {
        allowDraft: input.allowDraft,
        rendered,
      });
      await repository.save(result.snapshot);
      res.json(result.response);
    }),
  );

  router.put(
    "/research-product/projects/:projectId/replay-bundle",
    asyncRoute(async (req, res) => {
      const snapshot = ResearchProductWorkflowSnapshotV1Schema.parse(req.body);
      if (snapshot.project.id !== routeParam(req.params.projectId)) {
        throw new ProductWorkflowError(
          "INVALID_TRANSITION",
          "Replay bundle project identity does not match the route project id.",
          400,
        );
      }
      if (snapshot.project.mode === "LIVE") {
        throw new ProductWorkflowError(
          "INVALID_TRANSITION",
          "A LIVE bundle cannot be silently imported as replay evidence.",
          400,
        );
      }
      await repository.save(snapshot);
      res.json(snapshot);
    }),
  );

  const workflowErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    if (error instanceof ProductWorkflowError) {
      res.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    if (
      error instanceof Error &&
      error.name === "ZodError"
    ) {
      res.status(400).json({
        code: "INVALID_RESEARCH_PRODUCT_REQUEST",
        message: "Research product workflow request failed schema validation.",
      });
      return;
    }
    next(error);
  };
  router.use(workflowErrorHandler);

  return router;
}

export default createResearchProductWorkflowRouter();
