import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
  allProviderHealthSnapshots,
  InMemoryProviderHealthStore,
  dedupeSources,
  normalizeCrossrefWork,
  normalizeOpenAlexWork,
  normalizeSemanticScholarPaper,
  resetProviderHealthStoreForTesting,
  searchSourceProvider,
  searchSources,
  setProviderHealthStoreForTesting,
} from "./source-retrieval";
import { getSourceProviderConfigs } from "./source-provider-config";

beforeEach(() => {
  resetProviderHealthStoreForTesting();
});

test("normalizes Crossref works into the unified Source shape", () => {
  const source = normalizeCrossrefWork({
    title: ["Vitamin C and oxidative stress"],
    author: [{ given: "Ada", family: "Lovelace" }, { name: "Research Group" }],
    published: { "date-parts": [[2022, 1, 1]] },
    "published-print": { "date-parts": [[2019, 1, 1]] },
    issued: { "date-parts": [[2020, 1, 1]] },
    abstract: "<jats:p>Vitamin C abstract.</jats:p>",
    DOI: "https://doi.org/10.1000/EXAMPLE",
    URL: "https://doi.org/10.1000/example",
    publisher: "Example Publisher",
    "container-title": ["Example Journal"],
    type: "journal-article",
    "is-referenced-by-count": 42,
  }, "vitamin c query");

  assert.equal(source?.id, "doi:10.1000/example");
  assert.equal(source?.title, "Vitamin C and oxidative stress");
  assert.deepEqual(source?.authors, ["Ada Lovelace", "Research Group"]);
  assert.equal(source?.year, 2019);
  assert.equal(source?.abstract, "Vitamin C abstract.");
  assert.equal(source?.doi, "10.1000/example");
  assert.equal(source?.url, "https://doi.org/10.1000/example");
  assert.equal(source?.sourceType, "Crossref");
  assert.equal(source?.provider, "Crossref");
  assert.equal(source?.queryUsed, "vitamin c query");
  assert.equal(source?.containerTitle, "Example Journal");
  assert.equal(source?.citationCount, 42);
  assert.equal(source?.sourceKind, "journal");
  assert.ok((source?.sourceQualityScore ?? 0) > 80);
  assert.ok(source?.scoreReasons?.includes("has DOI"));
});

test("normalizes Semantic Scholar papers into the unified Source shape", () => {
  const source = normalizeSemanticScholarPaper({
    title: "Large language models in education",
    authors: [{ name: "Grace Hopper" }],
    year: 2023,
    abstract: "A paper abstract.",
    externalIds: { DOI: "10.2000/example" },
    url: "https://www.semanticscholar.org/paper/example",
    venue: "Conference on Education",
    citationCount: 17,
    publicationTypes: ["Conference"],
  }, "llm writing query");

  assert.equal(source?.id, "doi:10.2000/example");
  assert.equal(source?.title, "Large language models in education");
  assert.deepEqual(source?.authors, ["Grace Hopper"]);
  assert.equal(source?.year, 2023);
  assert.equal(source?.abstract, "A paper abstract.");
  assert.equal(source?.doi, "10.2000/example");
  assert.equal(source?.sourceType, "Semantic Scholar");
  assert.equal(source?.provider, "Semantic Scholar");
  assert.equal(source?.queryUsed, "llm writing query");
  assert.equal(source?.citationCount, 17);
  assert.equal(source?.sourceKind, "conference");
  assert.ok(source?.scoreReasons?.includes("citation count available"));
});

test("normalizes OpenAlex works and restores abstract inverted index", () => {
  const source = normalizeOpenAlexWork({
    id: "https://openalex.org/W123",
    doi: "https://doi.org/10.2500/spider-habitat",
    title: "Spider habitat selection and vegetation structure",
    publication_year: 2022,
    abstract_inverted_index: {
      Spider: [0],
      habitat: [1],
      selection: [2],
      is: [3],
      related: [4],
      to: [5],
      vegetation: [6],
      structure: [7],
      and: [8],
      microhabitat: [9],
      conditions: [10],
    },
    authorships: [{ author: { display_name: "Ada Lovelace" } }],
    primary_location: {
      source: { display_name: "Journal of Arachnid Ecology" },
      landing_page_url: "https://example.org/spider-habitat",
    },
    concepts: [{ display_name: "Ecology" }],
    cited_by_count: 99,
    open_access: { is_oa: true },
    type: "article",
  });

  assert.equal(source?.sourceType, "OpenAlex");
  assert.equal(source?.doi, "10.2500/spider-habitat");
  assert.match(source?.abstract ?? "", /Spider habitat selection/);
  assert.equal(source?.containerTitle, "Journal of Arachnid Ecology");
  assert.equal(source?.citationCount, 99);
  assert.equal(source?.isOpenAccess, true);
  assert.equal(source?.sourceKind, "journal");
});

test("uses Semantic Scholar TLDR as a fallback abstract when the main abstract is missing", () => {
  const source = normalizeSemanticScholarPaper({
    title: "Incomplete but usable title",
    authors: [{ name: "" }],
    tldr: { text: "Provider TLDR can still provide a short but useful summary." },
  });

  assert.equal(source?.authors.length, 0);
  assert.equal(source?.year, null);
  assert.equal(source?.doi, null);
  assert.equal(source?.url, null);
  assert.equal(
    source?.abstract,
    "Provider TLDR can still provide a short but useful summary.",
  );
  assert.equal(source?.reviewState, "pending");
});

test("dedupes sources by DOI before URL or title", () => {
  const sources = dedupeSources([
    {
      id: "doi:10.3000/example",
      title: "Duplicate source",
      authors: [],
      year: 2021,
      abstract: null,
      doi: "10.3000/example",
      url: "https://doi.org/10.3000/example",
      sourceType: "Crossref",
      reviewState: "pending",
      publisher: null,
      containerTitle: null,
      accessedAt: null,
    },
    {
      id: "doi:10.3000/example",
      title: "Duplicate source from another provider",
      authors: ["Someone"],
      year: 2021,
      abstract: null,
      doi: "10.3000/example",
      url: "https://www.semanticscholar.org/paper/example",
      sourceType: "Semantic Scholar",
      reviewState: "pending",
      publisher: null,
      containerTitle: null,
      accessedAt: null,
    },
  ]);

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.sourceType, "Crossref");
  assert.equal(sources[0]?.abstract, null);
  assert.deepEqual(sources[0]?.authors, ["Someone"]);
  assert.equal(sources[0]?.url, "https://doi.org/10.3000/example");
  assert.equal(sources[0]?.dedupeKey, "doi:10.3000/example");
  assert.equal(sources[0]?.scoreReasons?.some((reason) => reason.includes("merged providers")), true);
});

test("dedupe enrichment keeps the richer abstract for duplicate DOI records", () => {
  const sources = dedupeSources([
    {
      id: "doi:10.3000/example",
      title: "Duplicate source",
      authors: [],
      year: 2021,
      abstract: null,
      doi: "10.3000/example",
      url: "https://doi.org/10.3000/example",
      sourceType: "Crossref",
      reviewState: "pending",
      publisher: null,
      containerTitle: null,
      accessedAt: null,
    },
    {
      id: "doi:10.3000/example",
      title: "Duplicate source from OpenAlex",
      authors: ["Someone"],
      year: 2021,
      abstract:
        "Spider habitat and microhabitat ecology abstract with enough detail for source summary.",
      doi: "10.3000/example",
      url: "https://openalex.org/W123",
      sourceType: "OpenAlex",
      reviewState: "pending",
      publisher: null,
      containerTitle: "Ecology Journal",
      accessedAt: null,
    },
  ]);

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.sourceType, "Crossref");
  assert.match(sources[0]?.abstract ?? "", /microhabitat ecology/);
  assert.deepEqual(sources[0]?.authors, ["Someone"]);
  assert.equal(sources[0]?.containerTitle, "Ecology Journal");
});

test("CORE repository link supplements duplicate DOI metadata without replacing canonical source", () => {
  const sources = dedupeSources([
    {
      id: "doi:10.4000/core-contract",
      title: "Canonical metadata source",
      authors: ["Ada Lovelace"],
      year: 2024,
      abstract: "Canonical Crossref abstract.",
      doi: "10.4000/core-contract",
      url: "https://doi.org/10.4000/core-contract",
      sourceType: "Crossref",
      reviewState: "pending",
      publisher: "Example Publisher",
      containerTitle: "Example Journal",
      accessedAt: null,
      provider: "Crossref",
    },
    {
      id: "core-repository",
      title: "Repository copy of canonical source",
      authors: [],
      year: 2024,
      abstract: null,
      doi: "10.4000/core-contract",
      url: "https://repository.example/core-contract.pdf",
      sourceType: "Institutional Source",
      reviewState: "pending",
      publisher: "Repository",
      containerTitle: null,
      accessedAt: null,
      provider: "CORE",
    },
  ]);

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.sourceType, "Crossref");
  assert.equal(sources[0]?.provider?.includes("CORE"), true);
  assert.equal(sources[0]?.url, "https://doi.org/10.4000/core-contract");
  assert.equal(sources[0]?.containerTitle, "Example Journal");
});

test("dedupes sources by normalized title, first author, and year when DOI is missing", () => {
  const sources = dedupeSources([
    {
      id: "crossref-title",
      title: "Spider habitat selection.",
      authors: ["Ada Lovelace"],
      year: 2021,
      abstract: null,
      doi: null,
      url: "https://crossref.example/spider",
      sourceType: "Crossref",
      reviewState: "pending",
      publisher: null,
      containerTitle: null,
      accessedAt: null,
    },
    {
      id: "openalex-title",
      title: "Spider habitat selection",
      authors: ["Ada Lovelace", "Grace Hopper"],
      year: 2021,
      abstract: "A richer abstract about spider microhabitat selection.",
      doi: null,
      url: "https://openalex.org/W123",
      sourceType: "OpenAlex",
      reviewState: "pending",
      publisher: null,
      containerTitle: "Ecology Journal",
      accessedAt: null,
    },
  ]);

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.dedupeKey, "title:spider habitat selection|author:ada lovelace|year:2021");
  assert.deepEqual(sources[0]?.authors, ["Ada Lovelace", "Grace Hopper"]);
  assert.match(sources[0]?.abstract ?? "", /microhabitat/);
});

test("returns structured provider failure instead of throwing", async () => {
  const configs = getSourceProviderConfigs();
  const result = await searchSourceProvider("Crossref", "student attention", {
    providerConfigs: {
      Crossref: {
        ...configs.Crossref,
        endpoint: "https://example.test/works",
        timeoutMs: 50,
        queryLimit: 1,
        pageLimit: 1,
      },
    },
    fetchImpl: async () => new Response(JSON.stringify({ message: "failure" }), { status: 500 }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.provider, "Crossref");
  assert.equal(result.query, "student attention");
  assert.equal(result.error_type, "server_error");
  assert.match(result.error_message ?? "", /HTTP 500/);
  assert.deepEqual(result.results, []);
});

test("retries provider search once after HTTP 429 and returns recovered results", async () => {
  const configs = getSourceProviderConfigs();
  let attemptCount = 0;

  const result = await searchSourceProvider("Crossref", "electroplating reaction", {
    providerConfigs: {
      Crossref: {
        ...configs.Crossref,
        endpoint: "https://example.test/works",
        timeoutMs: 50,
        queryLimit: 1,
        pageLimit: 1,
      },
    },
    fetchImpl: async () => {
      attemptCount += 1;
      if (attemptCount === 1) {
        return new Response(JSON.stringify({ message: "rate limited" }), {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      return new Response(
        JSON.stringify({
          message: {
            items: [
              {
                title: ["Electroplating reaction kinetics"],
                author: [{ given: "Ada", family: "Lovelace" }],
                issued: { "date-parts": [[2024]] },
                DOI: "10.4100/electroplating",
                URL: "https://doi.org/10.4100/electroplating",
              },
            ],
          },
        }),
      );
    },
  });

  assert.equal(attemptCount, 2);
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.sourceType, "Crossref");
});

test("returns structured provider timeout instead of throwing", async () => {
  const configs = getSourceProviderConfigs();
  let attemptCount = 0;
  const timeoutFetch = async (_input: string | URL, init?: RequestInit): Promise<Response> => {
    attemptCount += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  };

  const result = await searchSourceProvider("Semantic Scholar", "sleep quality", {
    providerConfigs: {
      "Semantic Scholar": {
        ...configs["Semantic Scholar"],
        endpoint: "https://example.test/paper/search",
        timeoutMs: 5,
        queryLimit: 1,
      },
    },
    fetchImpl: timeoutFetch,
  });

  assert.equal(result.ok, false);
  assert.equal(result.provider, "Semantic Scholar");
  assert.equal(attemptCount, 1);
  assert.equal(result.error_type, "timeout");
  assert.match(result.error_message ?? "", /timed out/);
  assert.deepEqual(result.results, []);
});

test("marks provider degraded after repeated 5xx and shortens degraded timeout", async () => {
  const configs = getSourceProviderConfigs();
  const providerConfigs = {
    OpenAlex: {
      ...configs.OpenAlex,
      endpoint: "https://example.test/openalex/works",
      timeoutMs: 4000,
      queryLimit: 1,
      pageLimit: 1,
    },
  };

  for (const query of ["rayleigh one", "rayleigh two", "rayleigh three"]) {
    const result = await searchSourceProvider("OpenAlex", query, {
      providerConfigs,
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }),
    });
    assert.equal(result.ok, false);
  }

  const degraded = allProviderHealthSnapshots().find(
    (health) => health.provider === "openalex",
  );
  assert.equal(degraded?.status, "degraded");
  assert.equal((degraded?.recentFailureCount ?? 0) >= 3, true);

  const startedAt = Date.now();
  const timeoutResult = await searchSourceProvider("OpenAlex", "rayleigh degraded timeout", {
    providerConfigs,
    fetchImpl: async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
  });
  const elapsed = Date.now() - startedAt;

  assert.equal(timeoutResult.ok, false);
  assert.equal(timeoutResult.error_type, "timeout");
  assert.equal(elapsed < 3500, true);
  assert.equal(timeoutResult.provider_health?.status, "degraded");
});

test("marks degraded provider down after continued retryable failures and skips during cooldown", async () => {
  const configs = getSourceProviderConfigs();
  const providerConfigs = {
    OpenAlex: {
      ...configs.OpenAlex,
      endpoint: "https://example.test/openalex/works",
      timeoutMs: 50,
      queryLimit: 1,
      pageLimit: 1,
    },
  };
  let fetchCount = 0;

  for (const query of [
    "rayleigh failure one",
    "rayleigh failure two",
    "rayleigh failure three",
    "rayleigh failure four",
    "rayleigh failure five",
    "rayleigh failure six",
  ]) {
    await searchSourceProvider("OpenAlex", query, {
      providerConfigs,
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response(JSON.stringify({ error: "unavailable" }), { status: 503 });
      },
    });
  }

  const down = allProviderHealthSnapshots().find((health) => health.provider === "openalex");
  assert.equal(down?.status, "down");
  assert.ok(down?.cooldownUntil);

  const skipped = await searchSourceProvider("OpenAlex", "rayleigh skipped while down", {
    providerConfigs,
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ results: [] }));
    },
  });

  assert.equal(skipped.ok, false);
  assert.equal(skipped.provider_health?.status, "down");
  assert.match(skipped.error_message ?? "", /cooling down/);
  assert.equal(fetchCount, 12);
});

test("probes a down provider as degraded after cooldown and recovers after success streak", async () => {
  const store = new InMemoryProviderHealthStore();
  setProviderHealthStoreForTesting(store);
  await store.markDown(
    "OpenAlex",
    new Date(Date.now() - 1000),
    "timeout",
  );
  const configs = getSourceProviderConfigs();
  const providerConfigs = {
    OpenAlex: {
      ...configs.OpenAlex,
      endpoint: "https://example.test/openalex/works",
      timeoutMs: 4000,
      queryLimit: 1,
      pageLimit: 1,
    },
  };
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        results: [
          {
            id: "https://openalex.org/W1",
            title: "Rayleigh scattering and sunset color",
            publication_year: 2024,
            type: "article",
          },
        ],
      }),
    );

  const firstProbe = await searchSourceProvider("OpenAlex", "rayleigh probe", {
    providerConfigs,
    fetchImpl,
  });
  assert.equal(firstProbe.ok, true);
  assert.equal(firstProbe.provider_health?.status, "degraded");

  const secondProbe = await searchSourceProvider("OpenAlex", "rayleigh probe recovered", {
    providerConfigs,
    fetchImpl,
  });
  assert.equal(secondProbe.ok, true);
  assert.equal(secondProbe.provider_health?.status, "healthy");
});

test("Crossref timeout uses short query retry and records retry diagnostics", async () => {
  const configs = getSourceProviderConfigs();
  const providerConfigs = {
    Crossref: {
      ...configs.Crossref,
      endpoint: "https://example.test/works",
      timeoutMs: 30,
      queryLimit: 1,
      pageLimit: 1,
    },
  };
  let longAttempts = 0;

  const result = await searchSourceProvider("Crossref", "sunset color wavelength Rayleigh scattering", {
    providerConfigs,
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      const query = url.searchParams.get("query") ?? "";
      if (query !== "Rayleigh scattering sunset") {
        longAttempts += 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      }
      return new Response(
        JSON.stringify({
          message: {
            items: [
              {
                title: ["Rayleigh scattering and sunset color"],
                DOI: "10.1000/rayleigh-sunset",
                "container-title": ["Atmospheric Optics"],
                type: "journal-article",
              },
            ],
          },
        }),
      );
    },
  });

  assert.equal(result.ok, true);
  assert.equal(longAttempts, 1);
  assert.equal(result.retry_mode, "short_query");
  assert.equal(result.retry_reason, "timeout");
  assert.equal(result.retry_query, "Rayleigh scattering sunset");
  assert.equal(result.results[0]?.doi, "10.1000/rayleigh-sunset");
});

test("returns deduped partial results when one provider succeeds and another fails", async () => {
  const configs = getSourceProviderConfigs();
  const sources = await searchSources("student sleep quality", {
    providerConfigs: {
      Crossref: {
        ...configs.Crossref,
        endpoint: "https://example.test/works",
        timeoutMs: 50,
        queryLimit: 1,
      },
      "Semantic Scholar": {
        ...configs["Semantic Scholar"],
        endpoint: "https://example.test/paper/search",
        timeoutMs: 50,
        queryLimit: 1,
      },
    },
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("paper/search")) {
        return new Response(JSON.stringify({ message: "semantic failure" }), { status: 503 });
      }

      return new Response(JSON.stringify({
        message: {
          items: [
            {
              title: ["Student sleep quality and attention"],
              author: [{ given: "Ada", family: "Lovelace" }],
              issued: { "date-parts": [[2024]] },
              DOI: "10.4000/student-sleep",
              URL: "https://doi.org/10.4000/student-sleep",
            },
          ],
        },
      }));
    },
  });

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.sourceType, "Crossref");
  assert.equal(sources[0]?.doi, "10.4000/student-sleep");
});
