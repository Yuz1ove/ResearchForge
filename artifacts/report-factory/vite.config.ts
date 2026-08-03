import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { execFileSync } from "node:child_process";
import { RESEARCHFORGE_DEPLOYMENT_CONTRACT_VERSION } from "../../lib/api-zod/src/deployment-contract.ts";

const rawPort = process.env.PORT ?? "22067";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";
const isProduction = process.env.NODE_ENV === "production";
const apiProxyTarget = process.env.API_PROXY_TARGET ?? (isProduction ? undefined : "http://127.0.0.1:3100");
const repositoryRoot = path.resolve(import.meta.dirname, "../..");

function gitValue(args: string[], fallback: string): string {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const buildCommitSha =
  process.env.VERCEL_GIT_COMMIT_SHA ?? gitValue(["rev-parse", "HEAD"], "development");
const buildGitRef =
  process.env.VERCEL_GIT_COMMIT_REF ??
  gitValue(["rev-parse", "--abbrev-ref", "HEAD"], "development");
const buildDirty = gitValue(["status", "--porcelain"], "") !== "";

export default defineConfig({
  base: basePath,
  define: {
    "import.meta.env.VITE_RESEARCHFORGE_CONTRACT_VERSION": JSON.stringify(
      RESEARCHFORGE_DEPLOYMENT_CONTRACT_VERSION,
    ),
    "import.meta.env.VITE_RESEARCHFORGE_GIT_SHA": JSON.stringify(buildCommitSha),
    "import.meta.env.VITE_RESEARCHFORGE_GIT_REF": JSON.stringify(buildGitRef),
    "import.meta.env.VITE_RESEARCHFORGE_GIT_DIRTY": JSON.stringify(String(buildDirty)),
  },
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(!isProduction &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    ...(apiProxyTarget
      ? {
          proxy: {
            "/api": {
              target: apiProxyTarget,
              changeOrigin: true,
            },
          },
        }
      : {}),
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
