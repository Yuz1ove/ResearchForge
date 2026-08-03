import { defineConfig } from "@playwright/test";

const externalBaseUrl = process.env.RESEARCHFORGE_E2E_URL;
const localBaseUrl = "http://127.0.0.1:22067";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: externalBaseUrl ?? localBaseUrl,
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm dev",
        env: {
          PORT: "22067",
          VITE_API_BASE_URL: localBaseUrl,
        },
        url: localBaseUrl,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
