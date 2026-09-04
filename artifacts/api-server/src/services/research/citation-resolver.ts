import { createHash } from "node:crypto";

export interface ParsedReferenceItem {
  marker: string;
  rawText: string;
  doi: string | null;
  url: string | null;
  year: number | null;
  authors: string[];
  title: string | null;
}

export interface ResolvedReferenceItem {
  marker: string;
  rawText: string;
  resolved: boolean;
  title: string | null;
  authors: string[];
  year: number | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  provider: string;
  resolutionMethod: "exact_doi" | "identifier" | "title_match" | "local_bibliography_parse" | "fixture";
  resolutionConfidence: number;
  resolutionStatus: "RESOLVED" | "RESOLUTION_FAILED";
  provenanceMode: "LIVE_EXTERNAL_LOOKUP" | "LOCAL_PARSE" | "REPLAY";
}

function restoreOpenAlexAbstract(invertedIndex: Record<string, number[]> | null | undefined): string | null {
  if (!invertedIndex) return null;
  const wordsByPosition: Array<{ word: string; position: number }> = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    if (Array.isArray(positions)) {
      for (const position of positions) {
        if (typeof position === "number" && Number.isFinite(position)) {
          wordsByPosition.push({ word, position });
        }
      }
    }
  }
  const restored = wordsByPosition
    .sort((a, b) => a.position - b.position)
    .map((item) => item.word)
    .join(" ")
    .replace(/\s+([,.;:!?%)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .trim();
  return restored || null;
}

export function parseBibliography(referencesText: string): Map<string, ParsedReferenceItem> {
  const refMap = new Map<string, ParsedReferenceItem>();
  if (!referencesText) return refMap;

  const lines = referencesText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  let currentMarker: string | null = null;
  let currentRaw = "";

  function saveCurrent() {
    if (currentMarker && currentRaw) {
      const doiMatch = currentRaw.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/i);
      const doi = doiMatch ? doiMatch[0].replace(/[.,;)]+$/, "") : null;
      const urlMatch = currentRaw.match(/https?:\/\/[^\s)]+/);
      const url = urlMatch ? urlMatch[0].replace(/[.,;)]+$/, "") : null;
      const yearMatch = currentRaw.match(/\b(19\d{2}|20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

      // Extract title heuristics
      let title: string | null = null;
      const quoted = currentRaw.match(/["“]([^"”]+)["”]/);
      if (quoted) {
        title = quoted[1].trim();
      } else {
        // Try author (year). Title. Journal / URL
        const afterYear = currentRaw.split(/\((?:19\d{2}|20\d{2})\)\.?/);
        if (afterYear.length > 1) {
          const cand = afterYear[1].split(/[.?!]/)[0]?.trim();
          if (cand && cand.length > 5) title = cand;
        }
      }
      if (!title) {
        title = currentRaw.slice(0, 120);
      }

      refMap.set(currentMarker, {
        marker: currentMarker,
        rawText: currentRaw,
        doi,
        url,
        year,
        authors: [],
        title,
      });
    }
  }

  for (const line of lines) {
    if (/^#{1,3}\s*(References|參考文獻)/i.test(line)) continue;
    const numMatch = line.match(/^(?:\[(\d+)\]|(\d+)\.|\((\d+)\))\s*(.*)$/);
    if (numMatch) {
      saveCurrent();
      currentMarker = numMatch[1] || numMatch[2] || numMatch[3]!;
      currentRaw = numMatch[4]?.trim() || "";
    } else if (currentMarker) {
      currentRaw += " " + line;
    } else {
      // Author-year style entry without explicit leading index
      const authorYearMatch = line.match(/^([A-Za-z\u4e00-\u9fa5]+(?:\s+et\s+al\.)?)[,\s]+\(?(19\d{2}|20\d{2})\)?/);
      if (authorYearMatch) {
        saveCurrent();
        currentMarker = `${authorYearMatch[1]}_${authorYearMatch[2]}`;
        currentRaw = line;
      }
    }
  }
  saveCurrent();

  return refMap;
}

export async function resolveReferences(
  parsedRefs: Map<string, ParsedReferenceItem>,
  options: {
    sourceMode?: "LIVE" | "REPLAY" | "FIXTURE";
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<Map<string, ResolvedReferenceItem>> {
  const resolvedMap = new Map<string, ResolvedReferenceItem>();
  const fetchFn = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || 4000;
  const mode = options.sourceMode || "LIVE";

  for (const [marker, item] of parsedRefs.entries()) {
    // If explicit retraction or unverified indicator without DOI
    if (!item.doi && /retracted|unverified|撤稿|未證實/i.test(item.rawText)) {
      resolvedMap.set(marker, {
        marker,
        rawText: item.rawText,
        resolved: false,
        title: item.title,
        authors: item.authors,
        year: item.year,
        doi: null,
        url: item.url,
        abstract: null,
        provider: "LOCAL_PARSE",
        resolutionMethod: "local_bibliography_parse",
        resolutionConfidence: 0.1,
        resolutionStatus: "RESOLUTION_FAILED",
        provenanceMode: "LOCAL_PARSE",
      });
      continue;
    }

    if (item.doi && mode === "LIVE") {
      let resolvedItem: ResolvedReferenceItem | null = null;

      // 1. Try OpenAlex by DOI
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const openAlexUrl = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(item.doi)}`;
        const res = await fetchFn(openAlexUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "ResearchForge/2.0 (mailto:team@researchforge.org)" },
        });
        clearTimeout(timer);

        if (res.ok) {
          const data = (await res.json()) as any;
          const abstract = restoreOpenAlexAbstract(data.abstract_inverted_index) || null;
          const authors = (data.authorships || []).map((a: any) => a.author?.display_name).filter(Boolean);
          const title = data.title || data.display_name || item.title;

          resolvedItem = {
            marker,
            rawText: item.rawText,
            resolved: true,
            title,
            authors: authors.length > 0 ? authors : item.authors,
            year: data.publication_year || item.year,
            doi: item.doi,
            url: data.doi || item.url,
            abstract,
            provider: "OpenAlex",
            resolutionMethod: "exact_doi",
            resolutionConfidence: 0.98,
            resolutionStatus: "RESOLVED",
            provenanceMode: "LIVE_EXTERNAL_LOOKUP",
          };
        }
      } catch (err) {
        // Fall through to Crossref
      }

      // 2. Try Crossref by DOI if OpenAlex did not resolve
      if (!resolvedItem) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(item.doi)}`;
          const res = await fetchFn(crossrefUrl, {
            signal: controller.signal,
            headers: { "User-Agent": "ResearchForge/1.0 (mailto:kuanyunimo@gmail.com)" },
          });
          clearTimeout(timer);

          if (res.ok) {
            const data = (await res.json()) as any;
            const message = data.message || {};
            const title = message.title?.[0] || item.title;
            const authors = (message.author || []).map((a: any) => `${a.given || ""} ${a.family || ""}`.trim()).filter(Boolean);
            const abstract = message.abstract ? message.abstract.replace(/<[^>]+>/g, "").trim() : null;

            resolvedItem = {
              marker,
              rawText: item.rawText,
              resolved: true,
              title,
              authors: authors.length > 0 ? authors : item.authors,
              year: message.created?.["date-parts"]?.[0]?.[0] || item.year,
              doi: item.doi,
              url: message.URL || item.url,
              abstract,
              provider: "Crossref",
              resolutionMethod: "exact_doi",
              resolutionConfidence: 0.95,
              resolutionStatus: "RESOLVED",
              provenanceMode: "LIVE_EXTERNAL_LOOKUP",
            };
          }
        } catch (err) {
          // Fall through
        }
      }

      // 3. Try Semantic Scholar by DOI if not resolved or abstract is missing
      if (!resolvedItem || !resolvedItem.abstract) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          const cleanDoi = item.doi.trim();
          const s2Url = `https://api.semanticscholar.org/graph/v1/paper/${cleanDoi}?fields=title,abstract,authors,year,venue`;
          const res = await fetchFn(s2Url, {
            signal: controller.signal,
            headers: { "User-Agent": "ResearchForge/1.0 (mailto:kuanyunimo@gmail.com)" },
          });
          clearTimeout(timer);

          if (res.ok) {
            const data = (await res.json()) as any;
            const s2Abstract = data.abstract ? String(data.abstract).trim() : null;
            const s2Authors = (data.authors || []).map((a: any) => a.name).filter(Boolean);
            const s2Title = data.title || item.title;

            if (resolvedItem) {
              if (s2Abstract) {
                resolvedItem.abstract = s2Abstract;
                resolvedItem.provider = `${resolvedItem.provider}+SemanticScholar`;
              }
            } else {
              resolvedItem = {
                marker,
                rawText: item.rawText,
                resolved: true,
                title: s2Title,
                authors: s2Authors.length > 0 ? s2Authors : item.authors,
                year: data.year || item.year,
                doi: item.doi,
                url: item.doi ? `https://doi.org/${item.doi}` : item.url,
                abstract: s2Abstract,
                provider: "Semantic Scholar",
                resolutionMethod: "exact_doi",
                resolutionConfidence: 0.95,
                resolutionStatus: "RESOLVED",
                provenanceMode: "LIVE_EXTERNAL_LOOKUP",
              };
            }
          }
        } catch (err) {
          // Fall through
        }
      }

      const inlineAbstractMatch = item.rawText.match(/(?:Abstract|摘要|Summary|Findings)[:：]\s*([\s\S]+)/i);
      const inlineAbstract = inlineAbstractMatch ? inlineAbstractMatch[1].trim() : null;

      if (resolvedItem) {
        if (!resolvedItem.abstract && inlineAbstract) {
          resolvedItem.abstract = inlineAbstract;
        }
        resolvedMap.set(marker, resolvedItem);
        continue;
      }
    }

    // Local parse / fallback resolution
    const inlineAbstractMatch = item.rawText.match(/(?:Abstract|摘要|Summary|Findings)[:：]\s*([\s\S]+)/i);
    const inlineAbstract = inlineAbstractMatch ? inlineAbstractMatch[1].trim() : null;
    const hasDoi = Boolean(item.doi);
    resolvedMap.set(marker, {
      marker,
      rawText: item.rawText,
      resolved: hasDoi || Boolean(inlineAbstract),
      title: item.title,
      authors: item.authors,
      year: item.year,
      doi: item.doi,
      url: item.url,
      abstract: inlineAbstract,
      provider: "LOCAL_PARSE",
      resolutionMethod: hasDoi ? "exact_doi" : "local_bibliography_parse",
      resolutionConfidence: hasDoi ? 0.85 : 0.6,
      resolutionStatus: (hasDoi || Boolean(inlineAbstract)) ? "RESOLVED" : "RESOLUTION_FAILED",
      provenanceMode: "LOCAL_PARSE",
    });
  }

  return resolvedMap;
}
