import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { randomUUID } from "node:crypto";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT ?? "22067";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";
const isProduction = process.env.NODE_ENV === "production";
const apiProxyTarget =
  process.env.API_PROXY_TARGET ??
  (isProduction ? undefined : "http://127.0.0.1:3100");

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(!isProduction && process.env.REPL_ID !== undefined
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
    alias: [
      {
        find: "@",
        replacement: path.resolve(import.meta.dirname, "src"),
      },
      {
        find: "@assets",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "..",
          "attached_assets",
        ),
      },
      {
        find: /^@workspace\/api-zod$/u,
        replacement: path.resolve(import.meta.dirname, "..", "..", "lib", "api-zod", "src", "index.ts"),
      },
      {
        find: /^@workspace\/api-zod\/(.+)$/u,
        replacement: `${path.resolve(import.meta.dirname, "..", "..", "lib", "api-zod", "src")}/$1.ts`,
      },
    ],
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
              configure(proxy) {
                proxy.on("error", (error, request, response) => {
                  const requestId = randomUUID();
                  console.error("[search-api-proxy] API target unavailable", {
                    errorCode: "SEARCH_API_UNAVAILABLE",
                    requestId,
                    stage: "api-proxy",
                    method: request.method,
                    path: request.url?.split("?")[0],
                    retryable: true,
                    cause:
                      error instanceof Error ? error.message : String(error),
                  });
                  if ("writeHead" in response && !response.headersSent) {
                    response.writeHead(503, {
                      "Content-Type": "application/json; charset=utf-8",
                      "X-Request-Id": requestId,
                    });
                    response.end(
                      JSON.stringify({
                        ok: false,
                        errorCode: "SEARCH_API_UNAVAILABLE",
                        requestId,
                        stage: "api-proxy",
                        retryable: true,
                        message:
                          "暫時無法完成論文搜尋。搜尋 API 目前無法回應，請稍後重試。",
                      }),
                    );
                  }
                });
              },
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
