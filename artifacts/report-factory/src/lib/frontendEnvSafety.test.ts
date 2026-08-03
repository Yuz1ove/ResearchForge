import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const SOURCE_ROOT = path.resolve(process.cwd(), "src");
const FORBIDDEN_SECRET_ENV_READS = [
  /import\.meta\.env\.OPENAI_API_KEY/,
  /import\.meta\.env\.SCHOOL_LLM_API_KEY/,
  /import\.meta\.env\.VITE_OPENAI_API_KEY/,
  /import\.meta\.env\.VITE_SCHOOL_LLM_API_KEY/,
  /process\.env\.OPENAI_API_KEY/,
  /process\.env\.SCHOOL_LLM_API_KEY/,
  /\bVITE_OPENAI_API_KEY\b/,
  /\bVITE_SCHOOL_LLM_API_KEY\b/,
] as const;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) return sourceFiles(fullPath);
      return /\.(ts|tsx|js|jsx)$/.test(entry) ? [fullPath] : [];
    });
}

test("frontend source does not read secret LLM environment variables", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(SOURCE_ROOT)) {
    if (file.endsWith("frontendEnvSafety.test.ts")) continue;
    const content = readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN_SECRET_ENV_READS) {
      if (pattern.test(content)) offenders.push(`${path.relative(SOURCE_ROOT, file)}: ${pattern}`);
    }
  }

  assert.deepEqual(offenders, []);
});

test("frontend embeds build provenance and verifies the paired API deployment identity", () => {
  const viteConfig = readFileSync(path.resolve(process.cwd(), "vite.config.ts"), "utf8");
  const main = readFileSync(path.resolve(process.cwd(), "src/main.tsx"), "utf8");
  const rootVercel = JSON.parse(
    readFileSync(path.resolve(process.cwd(), "../..", "vercel.json"), "utf8"),
  ) as { rewrites?: Array<{ source?: string; destination?: string }> };

  assert.match(viteConfig, /RESEARCHFORGE_DEPLOYMENT_CONTRACT_VERSION/);
  assert.match(viteConfig, /VITE_RESEARCHFORGE_GIT_SHA/);
  assert.match(viteConfig, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(main, /\/api\/deployment/);
  assert.match(main, /researchforgeApiMatch/);
  assert.deepEqual(rootVercel.rewrites, [{ source: "/(.*)", destination: "/index.html" }]);
});
