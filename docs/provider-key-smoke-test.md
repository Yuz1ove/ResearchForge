# Provider Key Smoke Test

This project supports a school OpenAI-compatible gateway and official OpenAI-style configuration.

Server-side local env file:

```bash
artifacts/api-server/.env.local
```

Supported provider env:

```bash
SCHOOL_LLM_API_KEY=...
SCHOOL_LLM_BASE_URL=https://ai.ccsh.tn.edu.tw/v1
SCHOOL_LLM_MODEL=...

OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=...
```

`SCHOOL_LLM_*` wins by default when both provider families are present. Use `--provider=openai` only when you intentionally want the OpenAI env path.

## Safe Checks

The API server loads `artifacts/api-server/.env.local` in development and test, without overwriting values that already exist in `process.env`. Production should use deployment-injected env and must not depend on local `.env.local` files.

The smoke output never prints the full API key. It only prints a credential preview such as:

```text
aiapi_2...rRtM
```

## Commands

Check provider auth only:

```bash
pnpm --filter @workspace/api-server smoke:providers --provider=school_llm --skip-generation
```

Check `/models` and generation:

```bash
pnpm --filter @workspace/api-server smoke:providers --provider=school_llm
```

JSON output:

```bash
pnpm --filter @workspace/api-server smoke:providers --provider=school_llm --json
```

Useful options:

```bash
--provider=auto|school_llm|openai
--json
--skip-generation
--model=<model>
--endpoint=auto|models|chat|responses
--timeout-ms=<number>
```

## Status Meaning

- HTTP 200: key and base URL are basically usable for the checked endpoint.
- HTTP 401: key is wrong, expired, revoked, or malformed.
- HTTP 403: key is valid but lacks permission.
- HTTP 404: base URL is wrong or the endpoint is not supported.
- HTTP 429: rate limit or quota issue.
- HTTP 5xx: provider server problem.

Custom OpenAI-compatible gateways often support `/chat/completions` before they support `/responses`, so the smoke test tries `/chat/completions` first for `school_llm`. A `/responses` 404 is classified as `endpoint_not_supported`, not as an invalid key.

## Env Notes

`node -e` does not automatically read `.env.local`. Use the app entrypoint, the smoke CLI, or explicitly source/load env first.

Terminal `export` only affects processes launched from that terminal after the export. It will not change a dev server already running in another terminal.

## Safety Rules

- Do not put keys in Notes, screenshots, chats, or issue text.
- Do not commit `.env` or `.env.local`.
- Do not put API keys in frontend env or `VITE_*`.
- Do not print full keys in logs, JSON, diagnostics, snapshots, or errors.
- Rotate or revoke a key immediately after leakage.
