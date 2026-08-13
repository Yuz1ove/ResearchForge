import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface EnvLoadResult {
  rootEnvPath: string;
  apiServerEnvPath: string;
  loadedFiles: string[];
  keys: Record<string, EnvKeyLoadInfo>;
}

type MutableEnv = NodeJS.ProcessEnv;
export type EnvKeySource = "process.env" | "root .env.local" | "api-server/.env.local" | "unset";

export interface EnvKeyLoadInfo {
  configured: boolean;
  source: EnvKeySource;
  overriddenByProcessEnv: boolean;
}

const ORIGINAL_ENV_KEYS = new Set(Object.keys(process.env));
const TRACKED_ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_BASE_URL",
  "LLM_PROVIDER",
  "DISABLE_LLM_MOCK",
  "SCHOOL_LLM_BASE_URL",
  "SCHOOL_LLM_MODEL",
  "SCHOOL_LLM_SMOKE_MODEL",
  "SCHOOL_LLM_API_KEY",
  "SCHOOL_LLM_PROVIDER",
  "OPENAI_SMOKE_TEST_MODEL",
  "OLLAMA_BASE_URL",
  "OLLAMA_MODEL",
  "OLLAMA_API_KEY",
] as const;

function parseEnvLine(line: string): readonly [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const withoutExport = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trimStart()
    : trimmed;
  const separatorIndex = withoutExport.indexOf("=");
  if (separatorIndex <= 0) return null;

  const key = withoutExport.slice(0, separatorIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  const rawValue = withoutExport.slice(separatorIndex + 1).trim();
  return [key, parseEnvValue(rawValue)];
}

function parseEnvValue(rawValue: string): string {
  if (!rawValue) return "";

  const quote = rawValue[0];
  if ((quote === "\"" || quote === "'") && rawValue.endsWith(quote)) {
    const inner = rawValue.slice(1, -1);
    return quote === "\"" ? unescapeDoubleQuotedValue(inner) : inner;
  }

  const commentIndex = rawValue.search(/\s#/);
  return (commentIndex >= 0 ? rawValue.slice(0, commentIndex) : rawValue).trim();
}

function unescapeDoubleQuotedValue(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
}

export function loadEnvFile(
  filePath: string,
  env: MutableEnv,
  externallyLockedKeys: ReadonlySet<string>,
  source?: EnvKeySource,
  trackedKeys?: Map<string, EnvKeyLoadInfo>,
): boolean {
  if (!existsSync(filePath)) return false;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;

    const [key, value] = parsed;
    if (externallyLockedKeys.has(key)) continue;
    env[key] = value;
    if (source && trackedKeys && TRACKED_ENV_KEYS.includes(key as (typeof TRACKED_ENV_KEYS)[number])) {
      trackedKeys.set(key, {
        configured: Boolean(value.trim()),
        source,
        overriddenByProcessEnv: false,
      });
    }
  }

  return true;
}

function findProjectRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

function resolveEnvPaths(startDir = process.cwd()): {
  rootEnvPath: string;
  apiServerEnvPath: string;
} {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const rootFromCwd = findProjectRoot(startDir);
  const rootFromModule = findProjectRoot(moduleDir);
  const projectRoot = existsSync(path.join(rootFromCwd, "pnpm-workspace.yaml"))
    ? rootFromCwd
    : rootFromModule;

  return {
    rootEnvPath: path.join(projectRoot, ".env.local"),
    apiServerEnvPath: path.join(projectRoot, "artifacts", "api-server", ".env.local"),
  };
}

export function loadApiServerEnv(
  options: {
    env?: MutableEnv;
    startDir?: string;
    externallyLockedKeys?: ReadonlySet<string>;
    nodeEnv?: string;
  } = {},
): EnvLoadResult {
  const env = options.env ?? process.env;
  const externallyLockedKeys = options.externallyLockedKeys ?? ORIGINAL_ENV_KEYS;
  const { rootEnvPath, apiServerEnvPath } = resolveEnvPaths(options.startDir);
  const loadedFiles: string[] = [];
  const trackedKeys = new Map<string, EnvKeyLoadInfo>();
  const nodeEnv = options.nodeEnv ?? env.NODE_ENV;

  for (const key of TRACKED_ENV_KEYS) {
    if (externallyLockedKeys.has(key)) {
      trackedKeys.set(key, {
        configured: Boolean(env[key]?.trim()),
        source: "process.env",
        overriddenByProcessEnv: true,
      });
    }
  }

  if (nodeEnv === "production") {
    return {
      rootEnvPath,
      apiServerEnvPath,
      loadedFiles,
      keys: Object.fromEntries(
        TRACKED_ENV_KEYS.map((key) => [
          key,
          trackedKeys.get(key) ?? {
            configured: Boolean(env[key]?.trim()),
            source: env[key]?.trim() ? "process.env" : "unset",
            overriddenByProcessEnv: externallyLockedKeys.has(key),
          },
        ]),
      ),
    };
  }

  if (loadEnvFile(rootEnvPath, env, externallyLockedKeys, "root .env.local", trackedKeys)) {
    loadedFiles.push(rootEnvPath);
  }
  if (
    loadEnvFile(
      apiServerEnvPath,
      env,
      externallyLockedKeys,
      "api-server/.env.local",
      trackedKeys,
    )
  ) {
    loadedFiles.push(apiServerEnvPath);
  }

  return {
    rootEnvPath,
    apiServerEnvPath,
    loadedFiles,
    keys: Object.fromEntries(
      TRACKED_ENV_KEYS.map((key) => [
        key,
        trackedKeys.get(key) ?? {
          configured: Boolean(env[key]?.trim()),
          source: env[key]?.trim() ? "process.env" : "unset",
          overriddenByProcessEnv: externallyLockedKeys.has(key),
        },
      ]),
    ),
  };
}

export const apiServerEnvLoadResult = loadApiServerEnv();
