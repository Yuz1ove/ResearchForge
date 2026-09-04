# ResearchForge 鐵人賽 Writer Rules

> Internal editorial contract. This file governs future public articles; it is not itself a submission.

## 1. Frozen history is the input

- Writer may use only the selected day's frozen fact packet and the source ledger.
- A fact packet is a time-bounded view, not a summary of the current system.
- `KNOWN_AT_THE_TIME`, `IMPLEMENTED_AT_THE_TIME`, and `OBSERVED_FAILURE_AT_THE_TIME` may be narrated as history only when their source refs support them.
- `LATER_RETROSPECTIVE_INTERPRETATION` must be introduced as a later interpretation, normally with wording such as "現在回頭看".
- `CURRENT_STATE_ONLY` belongs in a clearly marked present-day epilogue, never in the historical event itself.
- When the evidence does not establish a detail, write `UNKNOWN`, `CONFLICTING`, or `INSUFFICIENT_EVIDENCE`; do not repair the story from plausibility.

## 2. Day N cannot know the future

Before drafting, check `terminology_forbidden_due_to_hindsight` in that day's packet. A later component may be mentioned only as a retrospective consequence, not as an earlier design intention. In particular, do not move canonical admission, Study Facts V2, legal full-text qualification, V5 budget authority, or V6A materialization back into June or July.

The writer must preserve the distinction between:

1. what existed in code,
2. what the developer could observe at that time,
3. what failed in a dated run,
4. what a later audit concluded, and
5. what exists only in the current dirty worktree.

## 3. Narrative shape

An article should tell one engineering problem as a causal story:

`concrete symptom → assumption at the time → evidence that contradicted it → bounded implementation choice → result and remaining gap → transferable lesson`

The article is not a QA report, acceptance report, release note, commit log, architecture specification, or list of test totals. Technical details are welcome when they explain a decision. The project is a case study; the reader should leave with a principle that applies outside ResearchForge.

Use first person when the source supports a project-owner decision. Do not invent dialogue, emotion, motivation, working hours, user reactions, or a failure that is only implied by a later fix commit.

## 4. Evidence and numbers

- Every material historical claim must map to at least one `source_refs` entry and an ID in `SOURCE-LEDGER.json`.
- A number must carry a direct numeric provenance. If it is a replay, fixture, prior baseline, current live run, or derived count, say which one.
- `HTTP 200`, metadata, an abstract, a search candidate, a Writer response, and a rendered document are different states.
- Passing deterministic regression proves only the tested contract. It does not prove live content, generalization, publication, or deployment.
- Never convert `UNKNOWN` to zero, `NOT_REPORTED`, false, absent, or no effect.
- Do not publish job UUIDs, raw provider payloads, local absolute paths, internal evidence IDs, model prompts, or exact infrastructure identifiers merely to make a claim look precise.

## 5. Recommended drafting sequence

1. Read the packet's period, confidence, known facts, unavailable concepts, and failure history.
2. Select one central problem and no more than two supporting technical details.
3. Draft the present-tense problem only from the packet's historical boundary.
4. Add the decision and the narrow result; preserve negative and missing results.
5. Add a short retrospective bridge only where the packet permits it.
6. Run the source, number, chronology, and publication-safety checks.
7. Perform a structural edit for causality and reader value, not just sentence polish.

## 6. Article readiness

An article may be marked `READY_FOR_HUMAN_REVIEW` only when:

- every public historical claim maps to the fact map and source ledger;
- early terminology has passed the hindsight audit;
- no unresolved contradiction is silently chosen;
- public numbers are traceable and safe;
- the article contains a concrete tension, one explained engineering choice, and a transferable takeaway;
- it has been rendered and checked for Markdown structure;
- it does not read like a status report or a changelog.

Human review and iThome Preview remain separate gates. Repository readiness never means that a post has been published.
