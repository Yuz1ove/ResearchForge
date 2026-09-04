import { Router, type Request, type Response } from "express";
import { VerifyExistingReportRequestSchema } from "@workspace/api-zod/research-product-workflow";
import { verifyExistingReport } from "../services/research/existing-report-verification";

export function createExistingReportVerificationRouter(): Router {
  const router = Router();

  router.post("/verify-existing-report", async (req: Request, res: Response) => {
    try {
      const parsed = VerifyExistingReportRequestSchema.parse(req.body);
      const result = await verifyExistingReport(parsed);
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({
        code: "VERIFICATION_FAILED",
        message: error instanceof Error ? error.message : "Verification request failed",
      });
    }
  });

  return router;
}
