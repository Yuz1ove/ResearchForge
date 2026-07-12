# ResearchForge Research Tools

This folder contains the install, health-check, and optional Docker tooling for the ResearchForge research pipeline.

## Install modes

```bash
./tools/research/install-research-tools.sh core
./tools/research/install-research-tools.sh pdf
./tools/research/install-research-tools.sh ocr
./tools/research/install-research-tools.sh experimental
./tools/research/install-research-tools.sh vector
./tools/research/install-research-tools.sh web
./tools/research/install-research-tools.sh all
```

## Health check

```bash
./tools/research/check-tools.sh
```

## Docker services

```bash
docker compose -f tools/research/docker-compose.research-tools.yml --profile pdf up -d
docker compose -f tools/research/docker-compose.research-tools.yml --profile vector up -d
```

## Notes

- Default production flow should prioritize `core + pdf`.
- OCR, experimental parsers, vector search, and web extraction are feature-flagged and optional.
- Public-web extraction only; do not use these tools to bypass paywalls, logins, or anti-bot protections.
