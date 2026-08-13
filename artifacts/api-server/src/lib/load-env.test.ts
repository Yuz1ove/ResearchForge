import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadApiServerEnv } from "./load-env";

function createWorkspace(): string {
  const root = mkdtempSync(path.join(tmpdir(), "researchforge-env-"));
  mkdirSync(path.join(root, "artifacts", "api-server"), { recursive: true });
  writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
  return root;
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

test("api-server env loader reads root and package .env.local with package override", () => {
  const root = createWorkspace();
  writeFileSync(
    path.join(root, ".env.local"),
    [
      "SCHOOL_LLM_BASE_URL=https://root.example/v1",
      "SCHOOL_LLM_MODEL=root-model",
      "SCHOOL_LLM_API_KEY=root-token",
    ].join("\n"),
  );
  writeFileSync(
    path.join(root, "artifacts", "api-server", ".env.local"),
    [
      "SCHOOL_LLM_MODEL=api-model",
      "SCHOOL_LLM_API_KEY=api-token",
    ].join("\n"),
  );

  const env: NodeJS.ProcessEnv = {};
  const result = loadApiServerEnv({
    env,
    startDir: path.join(root, "artifacts", "api-server"),
    externallyLockedKeys: new Set(),
  });

  assert.deepEqual(result.loadedFiles, [
    path.join(root, ".env.local"),
    path.join(root, "artifacts", "api-server", ".env.local"),
  ]);
  assert.equal(env.SCHOOL_LLM_BASE_URL, "https://root.example/v1");
  assert.equal(env.SCHOOL_LLM_MODEL, "api-model");
  assert.equal(env.SCHOOL_LLM_API_KEY, "api-token");
});

test("api-server env loader never overrides pre-existing process env keys", () => {
  const root = createWorkspace();
  writeFileSync(
    path.join(root, ".env.local"),
    [
      "SCHOOL_LLM_BASE_URL=https://root.example/v1",
      "SCHOOL_LLM_MODEL=root-model",
      "SCHOOL_LLM_API_KEY=root-token",
    ].join("\n"),
  );
  writeFileSync(
    path.join(root, "artifacts", "api-server", ".env.local"),
    "SCHOOL_LLM_API_KEY=api-token\n",
  );

  const env: NodeJS.ProcessEnv = {
    SCHOOL_LLM_API_KEY: "existing-token",
  };
  loadApiServerEnv({
    env,
    startDir: root,
    externallyLockedKeys: new Set(["SCHOOL_LLM_API_KEY"]),
  });

  assert.equal(env.SCHOOL_LLM_BASE_URL, "https://root.example/v1");
  assert.equal(env.SCHOOL_LLM_MODEL, "root-model");
  assert.equal(env.SCHOOL_LLM_API_KEY, "existing-token");
});

test("api-server env loader preserves externally locked empty remote vars while loading Ollama", () => {
  const root = createWorkspace();
  writeFileSync(
    path.join(root, ".env.local"),
    [
      "SCHOOL_LLM_API_KEY=file-school-token",
      "OPENAI_API_KEY=file-openai-token",
      "OLLAMA_BASE_URL=http://127.0.0.1:11434",
      "OLLAMA_MODEL=cached-qwen-model",
    ].join("\n"),
  );

  const env: NodeJS.ProcessEnv = {
    LLM_PROVIDER: "ollama",
    SCHOOL_LLM_API_KEY: "",
    OPENAI_API_KEY: "",
  };
  const result = loadApiServerEnv({
    env,
    startDir: root,
    externallyLockedKeys: new Set([
      "LLM_PROVIDER",
      "SCHOOL_LLM_API_KEY",
      "OPENAI_API_KEY",
    ]),
  });

  assert.equal(env.SCHOOL_LLM_API_KEY, "");
  assert.equal(env.OPENAI_API_KEY, "");
  assert.equal(env.OLLAMA_BASE_URL, "http://127.0.0.1:11434");
  assert.equal(env.OLLAMA_MODEL, "cached-qwen-model");
  assert.equal(result.keys.OLLAMA_BASE_URL?.source, "root .env.local");
  assert.equal(result.keys.OLLAMA_MODEL?.source, "root .env.local");
});

test("api-server env loader skips local env files in production", () => {
  const root = createWorkspace();
  writeFileSync(
    path.join(root, "artifacts", "api-server", ".env.local"),
    "SCHOOL_LLM_API_KEY=api-token\nSCHOOL_LLM_BASE_URL=https://school.example/v1\n",
  );

  const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  const result = loadApiServerEnv({
    env,
    startDir: root,
    externallyLockedKeys: new Set(),
  });

  assert.deepEqual(result.loadedFiles, []);
  assert.equal(env.SCHOOL_LLM_API_KEY, undefined);
  assert.equal(env.SCHOOL_LLM_BASE_URL, undefined);
});

test("repo gitignore keeps local env files ignored while preserving examples", () => {
  const root = findWorkspaceRoot(process.cwd());
  const gitignore = readFileSync(path.join(root, ".gitignore"), "utf8");

  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^artifacts\/api-server\/\.env$/m);
  assert.match(gitignore, /^artifacts\/api-server\/\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(gitignore, /^!artifacts\/api-server\/\.env\.example$/m);
});
