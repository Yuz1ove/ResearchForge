import { z } from "zod";

export const RESEARCHFORGE_DEPLOYMENT_CONTRACT_VERSION = "report-integrity-v1";

export const ResearchForgeDeploymentIdentitySchema = z.object({
  service: z.string().min(1),
  status: z.literal("ok"),
  contractVersion: z.literal(RESEARCHFORGE_DEPLOYMENT_CONTRACT_VERSION),
  commitSha: z.string().min(1),
  gitRef: z.string().min(1),
  dirty: z.boolean(),
});

export type ResearchForgeDeploymentIdentity = z.infer<
  typeof ResearchForgeDeploymentIdentitySchema
>;
