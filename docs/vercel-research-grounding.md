# Vercel Research Grounding

The research grounding API persists each job in Postgres before the bounded search pipeline starts. Preview and Production never use in-memory job storage.

## Required environment variables

- `DATABASE_URL`: Postgres connection string for the API Vercel project. The API creates the `research_grounding_jobs` table and indexes on first use.
- `VITE_API_BASE_URL`: absolute URL of the paired API deployment, set in the frontend Vercel project for the matching environment. Do not add a path suffix and never put a token in this value.

Optional settings:

- `GROUNDING_JOB_TTL_SECONDS`: durable job retention time; defaults to `86400`, with a supported range of 300 seconds through seven days.
- `SOURCE_SEARCH_USER_AGENT`, `OPENALEX_MAILTO`, and `CROSSREF_MAILTO`: provider-identifying contact configuration.
- `OPENALEX_TIMEOUT_MS`, `CROSSREF_TIMEOUT_MS`, `OPENALEX_QUERY_LIMIT`, and `CROSSREF_QUERY_LIMIT`: bounded provider runtime settings.

## Vercel configuration

The API is a Node.js Vercel Function (`api/index.js`) with a 60-second `maxDuration`; it awaits the grounding pipeline in the HTTP lifecycle rather than scheduling an unmanaged background promise. Configure the Vercel project Node.js version in Project Settings (Node 24.x is supported by Vercel) and set Preview-scoped variables on both projects.

The frontend must point `VITE_API_BASE_URL` to the API Preview URL reported by the matching deployment. A missing value intentionally fails the request before it is accidentally sent to the frontend SPA. If Vercel Deployment Protection is enabled, the browser needs access to both the frontend and API deployments; configure a Protection Bypass secret for automated smoke tests when applicable.

## Diagnostics

Structured API logs use `research_grounding.job` and `research_grounding.provider_attempt`. They include request/workflow/job identifiers, topic hash, route/stage, provider timing, result count, retryability, HTTP status when available, and sanitized errors. They never include headers or credentials.
