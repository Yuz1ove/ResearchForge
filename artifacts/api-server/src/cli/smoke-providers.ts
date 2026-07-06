import "../lib/load-env";
import {
  type ProviderSmokeEndpoint,
  runProviderSmokeTest,
} from "../services/provider-smoke";
import type { LlmProviderName } from "../config/llm-provider-config";
import { redactKnownSecrets } from "../services/llm/schoolProvider";

interface CliOptions {
  provider: LlmProviderName | "auto";
  json: boolean;
  skipGeneration: boolean;
  model: string | null;
  endpoint: ProviderSmokeEndpoint;
  timeoutMs: number | undefined;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    provider: "auto",
    json: false,
    skipGeneration: false,
    model: null,
    endpoint: "auto",
    timeoutMs: undefined,
  };

  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--skip-generation") {
      options.skipGeneration = true;
      continue;
    }
    const [flag, value = ""] = arg.split("=", 2);
    if (flag === "--provider") {
      if (value === "auto" || value === "school_llm" || value === "openai") {
        options.provider = value;
      }
      continue;
    }
    if (flag === "--model") {
      options.model = value.trim() || null;
      continue;
    }
    if (flag === "--endpoint") {
      if (value === "auto" || value === "models" || value === "chat" || value === "responses") {
        options.endpoint = value;
      }
      continue;
    }
    if (flag === "--timeout-ms") {
      const timeout = Number(value);
      if (Number.isFinite(timeout) && timeout > 0) options.timeoutMs = timeout;
    }
  }

  return options;
}

function humanStatus(status: number | null): string {
  return status == null ? "not requested" : `HTTP ${status}`;
}

function printHuman(result: Awaited<ReturnType<typeof runProviderSmokeTest>>): void {
  console.log(`Provider: ${result.provider}`);
  console.log(`Base URL configured: ${Boolean(result.baseURL)}`);
  console.log(`Credential: ${result.credentialPreview}`);
  console.log(
    `/models: ${humanStatus(result.auth.httpStatus)}, models returned: ${result.auth.modelCount}`,
  );
  if (result.auth.firstModels[0]) {
    console.log(`First model: ${result.auth.firstModels[0]}`);
  }
  if (result.generation.skipped) {
    console.log(`${result.generation.endpoint}: skipped`);
  } else {
    console.log(
      `${result.generation.endpoint}: ${humanStatus(result.generation.httpStatus)}, output: ${JSON.stringify(
        result.generation.outputPreview ?? "",
      )}`,
    );
  }
  for (const warning of result.warnings) {
    console.log(`Warning: ${warning}`);
  }
  for (const item of result.failures) {
    console.log(`Failure: ${item.code} at ${item.endpoint} (${humanStatus(item.httpStatus)})`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await runProviderSmokeTest({
    provider: options.provider,
    skipGeneration: options.skipGeneration,
    model: options.model,
    endpoint: options.endpoint,
    timeoutMs: options.timeoutMs,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  const requiredProvider = options.provider !== "auto";
  process.exitCode = result.ok || (!requiredProvider && !result.configured) ? 0 : 1;
}

main().catch((error) => {
  console.error(
    redactKnownSecrets(error instanceof Error ? error.message : "Provider smoke test failed."),
  );
  process.exitCode = 1;
});
