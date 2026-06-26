import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const execFileAsync = promisify(execFile);

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "../../../../../../");
const workerDir = path.join(repoRoot, "python", "workers");

export async function runPythonWorker(
  scriptName: string,
  payload: unknown,
): Promise<unknown> {
  const scriptPath = path.join(workerDir, scriptName);
  const { stdout } = await execFileAsync("python3", [scriptPath], {
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      RESEARCH_WORKER_INPUT: JSON.stringify(payload),
    },
  });
  return stdout.trim() ? JSON.parse(stdout) : null;
}
