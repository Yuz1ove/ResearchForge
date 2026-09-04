# ResearchForge 鐵人賽 Publication Safety

> Internal classification and release checklist. The default is to omit an uncertain or sensitive detail.

## Classification

### PUBLIC

Safe for an article after the day packet and fact map support it: general engineering concepts, public product naming, high-level architecture, dated commit subjects when useful, bounded test outcomes, and clearly labeled live/replay distinctions. A public number still needs provenance; "public" does not mean "unverified".

### INTERNAL

Keep backstage by default: full commit SHAs, source-ledger IDs, local file paths, QA directory names, job IDs, evidence revision IDs, raw diagnostic payloads, exact provider-attempt ledgers, internal thresholds, model prompts, and detailed failure matrices. These may stay in internal packets so a reviewer can reproduce the claim.

### SENSITIVE

Never publish: API keys, bearer tokens, passwords, cookies, credentials, private URLs, private infrastructure identifiers, personal data, account identifiers, unpublished provider details, or content whose rights or terms do not permit redistribution. Do not search the filesystem or browser storage for missing credentials.

### UNKNOWN

Use when rights, access, chronology, platform behavior, or cause is not established. `UNKNOWN` is a state, not an invitation to infer. Do not silently turn it into `PUBLIC`, `NOT_REPORTED`, or zero. If it matters to the story, say that the evidence was insufficient and explain what would resolve it.

## Required separation

- Git history ends at the current HEAD recorded in the source ledger. Later dirty-worktree code and dated QA artifacts are later work sessions, not committed history.
- A fixture or deterministic replay may explain a contract but cannot be presented as current live evidence.
- Engineering regression, Writer success, canonical admission, document export, rendered visual QA, iThome Preview, and publication are separate gates.
- A prior accepted report is a baseline unless the current architecture and run identity are explicitly shown.
- An official page that cannot be rechecked is not a current event fact. The 2026 iThome event page was not accessible in this reconstruction session; category, schedule, and registration claims remain `UNKNOWN` until an authorized human session verifies them.

## Pre-publication scan

Before copying an article to the platform, scan for secrets, bearer/key/token/password/cookie assignments, private URLs, local paths, `localhost`, job UUIDs, internal evidence IDs, raw verdict tokens, and unlabelled `0/10`, `7/10`, `8/10`, or similar metrics. Check each remaining number against a source ref. Remove backstage front matter, QA templates, SHA values, artifact paths, and internal completion markers.

If a source is a paper or external document, verify the intended quotation, image, and redistribution rights separately. Do not publish raw provider payloads or full text merely because the application was able to fetch it.

## Platform boundary

No registration, authenticated authoring, upload, or iThome publication is authorized by this reconstruction. Repository files are the canonical editorial source. Platform Preview, publication, public URL verification, and post-publication QA require a separate explicit and authenticated human-controlled session.
