# Initial editorial QA

> Backstage only. This is not an iThome article.

> Superseded status note (2026-08-30): this file records the initial Day 01–10 checkpoint. The current 30/30 publication-level assessment is `PUBLICATION-REVIEW-V1.md`, and the canonical coverage/state is `PUBLICATION-MANIFEST.md` plus `publication-manifest.json`.

Date: 2026-08-29

## Scope

- Final public articles: Day 01–05
- Complete public drafts: Day 06–10
- Individual outlines: Day 11–30
- Backstage: repository recon, history, source ledger, article fact map, editing log
- Operations: editorial map, style guide, publication runbook, status

## Checks

- JSON parse: PASS for STATUS, SOURCE-LEDGER, ARTICLE-FACT-MAP.
- Fact-map integrity: 30 article entries; every evidence ID resolves to the source ledger.
- Length: Day 01–10 each contains 1,800–3,500 Han characters.
- Markdown source: exactly one H1 per article; heading hierarchy present; no trailing whitespace.
- Local render: Day 01–10 rendered through markdown-it; zero raw code-fence leakage.
- Public/backstage separation: no absolute repository path, commit SHA, FINAL report label, internal completion token, or QA-report section template in public articles.
- Anti-AI style scan: no configured generic opening/closing phrases.
- Sensitive-pattern scan: no key, bearer token, password assignment, auth cookie assignment, or token assignment pattern.
- Public local-link scan: no file/local/localhost links.
- Required file count: 10 article files and 20 outline files present.
- Scope safety: only `docs/ironman-2026/` was added by this editorial task; production application files were not edited.

## Publication boundary

Local editorial readiness does not prove iThome render compatibility or publication. The actual platform Preview, authenticated Publish, public URL verification, and post-publish QA remain NOT RUN until a safe authorized session and publication date exist.
