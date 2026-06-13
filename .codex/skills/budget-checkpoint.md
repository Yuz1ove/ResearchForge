# Budget Checkpoint & Handoff Skill

Use this project-local protocol when a Codex session should preserve budget, checkpoint progress, or hand off work safely. This skill is documentation-only and must not be used as a reason to add product features.

## Trigger Conditions

Start this protocol when any of these are true:

- Remaining budget is below about `$30-$35`.
- The user says `保存`, `存檔`, `checkpoint`, `handoff`, `額度不足`, or `今天進度夠多了`.
- A milestone has just passed tests, typecheck, or build.
- A task was interrupted by usage limit or context pressure.
- The working tree has important uncommitted changes.

## Required Behavior

- Stop adding features.
- Inspect repository status before editing, staging, committing, or pushing.
- Identify modified, deleted, and untracked files.
- Exclude secrets and generated files from any commit.
- Recommend safe commit grouping before staging when changes span multiple concerns.
- Produce a concise handoff summary that another Codex session can resume from.
- Push the branch only if a remote exists and the user confirms, unless the user already explicitly asked to push.
- Never commit `.env`, API keys, `node_modules`, `dist`, `.vite`, generated DOCX/ZIP files, or private cache files.
- Do not modify the report generation pipeline, backend routes, UI, auth, database, payment, PDF, PPTX, LLM, or citation systems while running this protocol.

## Standard Command Checklist

Run these lightweight checks from the repository root, then summarize the results:

```bash
git branch --show-current
git status --short
git diff --stat
git diff --name-only | cat
git diff --cached --stat
git log --oneline -8
```

Check for likely secrets before staging:

```bash
grep -RInE "(OPENAI[_]API[_]KEY|ANTHROPIC[_]API[_]KEY|GITHUB[_]TOKEN|DATABASE[_]URL|JWT[_]SECRET|SECRET[_]KEY|PRIVATE[_]KEY|BEGIN RSA PRIVATE[_]KEY|BEGIN OPENSSH PRIVATE[_]KEY|sk-[A-Za-z0-9_-]{20,})" . \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=.vite \
  --exclude-dir=.pnpm-store
```

Check for generated artifacts that should normally stay out of commits:

```bash
find . \
  -path ./.git -prune -o \
  -path ./node_modules -prune -o \
  -path ./dist -prune -o \
  -path ./.vite -prune -o \
  -path ./.pnpm-store -prune -o \
  -type f \( -name "*.docx" -o -name "*.zip" -o -name "*.pdf" -o -name "*.tmp" -o -name "*.log" \) \
  -print
```

Optional remote check before any push recommendation:

```bash
git remote -v
git status --branch --short
```

## Commit Grouping Strategy

When changes span multiple concerns, split commits by reviewable intent:

- Core feature: production code needed for the feature to work.
- Tests/fixtures: test files, fixtures, and validation data.
- Assets: images, animation assets, icons, and other static media.
- Documentation: handoff notes, architecture notes, status docs, and protocol docs.
- Cleanup/gitignore: ignore-rule corrections, generated-file cleanup, and non-product maintenance.

Keep each commit coherent. Avoid mixing documentation-only checkpoints with app behavior changes unless the user explicitly asks for a combined commit.

## Low-Budget Rules

When budget is low:

- No new features.
- No large refactors.
- No dependency upgrades unless required to preserve or validate existing work.
- No UI redesign.
- No speculative cleanup.
- Only save, validate, document, and prepare handoff.
- Prefer exact status summaries over broad analysis.
- Do not start new implementation after a successful checkpoint unless the user explicitly resumes feature work.

## Handoff Summary Template

Use this template for `docs/project-status/latest-handoff.md` or the final response:

```markdown
# Latest Handoff

## Current Branch

- Branch:
- Remote:
- Working tree:

## Latest Commits

- `hash` message

## Completed

- ...

## Validation Results

- Command:
- Result:
- Notes:

## Files Changed

- ...

## Remaining Risks

- ...

## Next Recommended Task

- ...

## Budget Note

- ...

## Resume Prompt

Continue in `/Users/Yuz1ove/Documents/報告工廠/Report-Builder-AI` on branch `<branch>`. Start by reading `docs/project-status/latest-handoff.md`, then run `git status --short` and `git log --oneline -8`. Preserve the low-budget rules: do not add product features until the checkpoint is committed/pushed or the user explicitly resumes implementation.
```

## Final Response Checklist

At the end of a checkpoint task, report:

- Files created.
- Files modified.
- Whether any app code was changed.
- Recommended commit message.
- A short next-session resume prompt.

Recommended commit message for this protocol:

```text
docs: add budget checkpoint handoff skill
```
