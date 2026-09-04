import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRODUCTION_VERIFICATION_FILES = [
  "artifacts/api-server/src/services/research/existing-report-verification.ts",
  "artifacts/api-server/src/services/research/citation-resolver.ts",
  "artifacts/api-server/src/services/research/mode-b-claim-verifier.ts",
  "artifacts/api-server/src/services/research/parsers/document-parser.ts",
  "artifacts/api-server/src/routes/existing-report-verification.ts",
];

const FORBIDDEN_BENCHMARK_TOKENS = [
  "恆星",
  "視差",
  "光年",
  "paracyclopina",
  "橈足類",
  "急性肝腎",
  "三週內",
  "Beaumont",
  "Yuan et al.",
];

test("Guard: production verification sources contain zero benchmark-specific tokens", () => {
  for (const relPath of PRODUCTION_VERIFICATION_FILES) {
    let fullPath = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(fullPath)) {
      fullPath = path.resolve(__dirname, "../../../../..", relPath);
    }
    assert.ok(fs.existsSync(fullPath), `File must exist: ${relPath}`);
    const code = fs.readFileSync(fullPath, "utf8");

    for (const token of FORBIDDEN_BENCHMARK_TOKENS) {
      const lowerCode = code.toLowerCase();
      const lowerToken = token.toLowerCase();
      assert.ok(
        !lowerCode.includes(lowerToken),
        `FORBIDDEN LEAKAGE: Production source ${relPath} contains benchmark token: "${token}"`,
      );
    }
  }
});
