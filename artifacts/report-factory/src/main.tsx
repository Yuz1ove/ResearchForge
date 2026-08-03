import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { RESEARCHFORGE_DEPLOYMENT_CONTRACT_VERSION } from "@workspace/api-zod/deployment-contract";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const rootElement = document.getElementById("root")!;
const frontendCommitSha = import.meta.env.VITE_RESEARCHFORGE_GIT_SHA || "development";
const frontendGitRef = import.meta.env.VITE_RESEARCHFORGE_GIT_REF || "development";

rootElement.dataset.researchforgeContract = RESEARCHFORGE_DEPLOYMENT_CONTRACT_VERSION;
rootElement.dataset.researchforgeCommit = frontendCommitSha;
rootElement.dataset.researchforgeGitRef = frontendGitRef;
rootElement.dataset.researchforgeDirty = import.meta.env.VITE_RESEARCHFORGE_GIT_DIRTY || "false";

if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
} else {
  console.warn(
    "VITE_API_BASE_URL is not configured; relative /api calls require a same-origin API server.",
  );
}

async function verifyApiDeploymentIdentity(): Promise<void> {
  const apiOrigin = apiBaseUrl || window.location.origin;
  try {
    const response = await fetch(`${apiOrigin.replace(/\/$/, "")}/api/deployment`);
    const identity = await response.json() as {
      contractVersion?: string;
      commitSha?: string;
    };
    const matches =
      response.ok &&
      identity.contractVersion === RESEARCHFORGE_DEPLOYMENT_CONTRACT_VERSION &&
      identity.commitSha === frontendCommitSha;
    rootElement.dataset.researchforgeApiMatch = String(matches);
    rootElement.dataset.researchforgeApiCommit = identity.commitSha ?? "unknown";
    if (!matches) {
      console.error("ResearchForge frontend/API deployment identity mismatch", {
        frontendCommitSha,
        apiCommitSha: identity.commitSha,
        frontendContractVersion: RESEARCHFORGE_DEPLOYMENT_CONTRACT_VERSION,
        apiContractVersion: identity.contractVersion,
      });
    }
  } catch {
    rootElement.dataset.researchforgeApiMatch = "unavailable";
  }
}

void verifyApiDeploymentIdentity();

createRoot(rootElement).render(<App />);
