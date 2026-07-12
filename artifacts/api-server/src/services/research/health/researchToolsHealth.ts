import type {
  ResearchToolHealthItem,
  ResearchToolsHealthResponse,
} from "@workspace/api-zod/research-tools";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { grobidHealth } from "../parsers/grobidClient";
import { tikaHealth } from "../parsers/tikaClient";
import { ARXIV_PROVIDER } from "../providers/arxiv";
import { CORE_PROVIDER } from "../providers/core";
import { CROSSREF_PROVIDER } from "../providers/crossref";
import { DOAJ_PROVIDER } from "../providers/doaj";
import { OPENALEX_PROVIDER } from "../providers/openalex";
import { SEMANTIC_SCHOLAR_PROVIDER } from "../providers/semanticScholar";
import { UNPAYWALL_PROVIDER } from "../providers/unpaywall";

const execFileAsync = promisify(execFile);

async function canReach(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

async function hasPythonModule(moduleName: string): Promise<boolean> {
  try {
    await execFileAsync("python3", ["-c", `import ${moduleName}`], {
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

async function hasCommand(command: string): Promise<boolean> {
  try {
    await execFileAsync("sh", ["-lc", `command -v ${command}`], {
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

function optionalItem(
  name: string,
  category: ResearchToolHealthItem["category"],
  detail: string,
): ResearchToolHealthItem {
  return { name, category, state: "Optional", detail };
}

export async function getResearchToolsHealth(): Promise<ResearchToolsHealthResponse> {
  const items: ResearchToolHealthItem[] = [];

  items.push({
    name: OPENALEX_PROVIDER.name,
    category: "api",
    state: (await canReach(process.env.OPENALEX_WORKS_URL?.trim() || OPENALEX_PROVIDER.defaultEndpoint)) ? "OK" : "Failed",
  });
  items.push({
    name: CROSSREF_PROVIDER.name,
    category: "api",
    state: (await canReach(process.env.CROSSREF_WORKS_URL?.trim() || CROSSREF_PROVIDER.defaultEndpoint)) ? "OK" : "Failed",
  });
  items.push({
    name: SEMANTIC_SCHOLAR_PROVIDER.name,
    category: "api",
    state: process.env.SEMANTIC_SCHOLAR_API_KEY?.trim()
      ? (await canReach(process.env.SEMANTIC_SCHOLAR_SEARCH_URL?.trim() || SEMANTIC_SCHOLAR_PROVIDER.defaultEndpoint))
        ? "OK"
        : "Failed"
      : "Missing",
    detail: process.env.SEMANTIC_SCHOLAR_API_KEY?.trim()
      ? undefined
      : "Missing API key",
  });
  items.push({
    name: ARXIV_PROVIDER.name,
    category: "api",
    state: (await canReach(process.env.ARXIV_API_URL?.trim() || ARXIV_PROVIDER.defaultEndpoint)) ? "OK" : "Failed",
  });
  items.push(
    process.env.ENABLE_DOAJ?.trim().toLowerCase() === "true"
      ? {
          name: DOAJ_PROVIDER.name,
          category: "api",
          state: (await canReach(process.env.DOAJ_API_URL?.trim() || DOAJ_PROVIDER.defaultEndpoint)) ? "OK" : "Failed",
        }
      : optionalItem(DOAJ_PROVIDER.name, "api", "Not configured"),
  );
  items.push(
    process.env.ENABLE_CORE?.trim().toLowerCase() === "true"
      ? {
          name: CORE_PROVIDER.name,
          category: "api",
          state: process.env.CORE_API_KEY?.trim() ? "Optional" : "Missing",
          detail: process.env.CORE_API_KEY?.trim() ? "Configured but not queried in default flow" : "Not configured",
        }
      : optionalItem(CORE_PROVIDER.name, "api", "Not configured"),
  );
  items.push(
    process.env.ENABLE_UNPAYWALL?.trim().toLowerCase() === "true"
      ? {
          name: UNPAYWALL_PROVIDER.name,
          category: "api",
          state: process.env.UNPAYWALL_EMAIL?.trim() ? "Optional" : "Missing",
          detail: process.env.UNPAYWALL_EMAIL?.trim() ? "Configured but optional" : "Not configured",
        }
      : optionalItem(UNPAYWALL_PROVIDER.name, "api", "Not configured"),
  );

  items.push({
    name: "GROBID",
    category: "parser",
    state: (await grobidHealth()) ? "OK" : "Not running",
  });
  items.push({
    name: "Tika",
    category: "parser",
    state: (await tikaHealth()) ? "OK" : "Not running",
  });
  items.push({
    name: "PyMuPDF",
    category: "parser",
    state: (await hasPythonModule("fitz")) ? "OK" : "Missing",
  });
  items.push({
    name: "pdfminer.six",
    category: "parser",
    state: (await hasPythonModule("pdfminer")) ? "OK" : "Missing",
  });
  items.push({
    name: "pdfplumber",
    category: "parser",
    state: (await hasPythonModule("pdfplumber")) ? "OK" : "Missing",
  });
  items.push({
    name: "pypdf",
    category: "parser",
    state: (await hasPythonModule("pypdf")) ? "OK" : "Missing",
  });
  items.push({
    name: "Unstructured",
    category: "parser",
    state: (await hasPythonModule("unstructured")) ? "Optional" : "Optional",
    detail: (await hasPythonModule("unstructured")) ? "Installed" : "Not installed",
  });
  items.push({
    name: "Docling",
    category: "parser",
    state: "Optional",
    detail: (await hasPythonModule("docling")) ? "Installed" : "Not installed",
  });
  items.push({
    name: "Marker",
    category: "parser",
    state: "Optional",
    detail: (await hasPythonModule("marker")) ? "Installed" : "Not installed",
  });
  items.push({
    name: "MinerU",
    category: "parser",
    state: "Optional",
    detail: (await hasPythonModule("mineru")) ? "Installed" : "Not installed",
  });
  items.push({
    name: "Tesseract",
    category: "ocr",
    state: (await hasCommand("tesseract")) ? "Optional" : "Missing",
    detail: (await hasCommand("tesseract")) ? "Installed" : "Missing language data or binary",
  });
  items.push({
    name: "PaddleOCR",
    category: "ocr",
    state: "Optional",
    detail: (await hasPythonModule("paddleocr")) ? "Installed" : "Not installed",
  });
  items.push({
    name: "fastText",
    category: "vector",
    state: "Optional",
    detail: (await hasPythonModule("fasttext")) ? "Installed" : "Not installed",
  });
  items.push({
    name: "multilingual-e5",
    category: "vector",
    state: "Optional",
    detail: process.env.ENABLE_MULTILINGUAL_E5?.trim().toLowerCase() === "true"
      ? "Enabled by feature flag"
      : "Not installed",
  });
  items.push({
    name: "pgvector",
    category: "database",
    state: process.env.ENABLE_PGVECTOR?.trim().toLowerCase() === "true" ? "Optional" : "Missing",
    detail: process.env.ENABLE_PGVECTOR?.trim().toLowerCase() === "true" ? "Schema proposal only" : "Missing extension",
  });
  items.push({
    name: "Qdrant",
    category: "vector",
    state: process.env.ENABLE_QDRANT?.trim().toLowerCase() === "true"
      ? (await canReach(process.env.QDRANT_URL?.trim() || "http://localhost:6333")) ? "OK" : "Not running"
      : "Optional",
    detail:
      process.env.ENABLE_QDRANT?.trim().toLowerCase() === "true"
        ? undefined
        : "Not configured",
  });
  items.push({
    name: "OpenSearch",
    category: "vector",
    state: "Future",
    detail: "Not configured",
  });

  return {
    status: items.some((item) => item.state === "Failed") ? "degraded" : "ok",
    checkedAt: new Date().toISOString(),
    items,
  };
}
