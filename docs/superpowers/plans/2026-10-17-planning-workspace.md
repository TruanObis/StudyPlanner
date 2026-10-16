# Planning Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement the approved daily planning details, period goals, new-card allocation in both week/month views, and schedule copying in V2.

**Architecture:** Keep the standalone HTML app and reuse daily plan references, source-card status, timeline subgoals, and hash routing. Add a schema-6 period-goal collection and stable plan IDs, with model helpers separate from rendering inside the existing script. Period views share new-card detection and allocation; no live schedule reshuffling.

**Tech Stack:** Vanilla JavaScript/CSS/HTML, localStorage, Node test runner with the shipped script executed in a VM; CUA browser verification.

**Spec:** ../specs/2026-10-17-planning-workspace-design.md, approved with week and month new-card visibility.

## Global Constraints

- Change V2 only; preserve the main HTML and its release channel.
- Retain 26-hour / 10-minute scheduling and source-card timer/completion semantics.
- New cards are reviewed before inclusion; allocate dates, not invented study durations.
- Keep manual placements, existing sessions, cumulative times, and main/V2 storage separation.
- Keep the standalone/offline file format; no new dependencies.
- User authorized implementation in the existing V2 checkout. Execute inline on its feature branch.

## Review Focus

- Same source referenced in multiple goals: show one new-card row and skip already assigned units.
- Renames, reparenting, deletion: track identities, not text; validate stale UI drafts before applying.
- Preview races with edits/timers: refresh changed plans, but timer ticks alone must not invalidate a preview.
- Copy of an active or completed task: never copy execution or running state, and keep canonical completion.
- Mobile navigation/date changes: details remain reachable without hidden-page focus or lost sidebar date.

### Task 1: Planning model and persistence

**Files:** V2 HTML; tests/planning.test.cjs; existing timeline tests for schema expectations.
**Interfaces:** planningCatalog() -> card entries; planningEnsureData(data); planningCreateGoal(config); planningNewCards(start,end); planningBuildAllocation(goalId,refs,from,to); planningApplyAllocation(preview); planningFindPlan(planId); planningMovePlan(planId,date,start,end); planningCopyPreview(source,dates,includePlans); planningApplyCopy(preview).

- [ ] Write tests for schema-5 preservation/backup validation, catalog units, new cards across overlapping goals, ordered/even allocation, duplication and stale preview, move identity/records, copy idempotence and execution exclusion.
- [ ] Run `node --test tests/planning.test.cjs`; verify missing behavior fails.
- [ ] Implement model helpers, schema-6 migration/validation, and source-reference rewrite/deletion integration. Ranges are KST dates and 10-minute intervals; new plans are unscheduled.
- [ ] Run planning and V2 timeline suites; keep main timeline suite green.
- [ ] Commit model and its tests.

### Task 2: Planning page and editing flows

**Files:** V2 HTML; tests/planning.test.cjs.
**Interfaces:** renderPlanningPage(view), openPlanningPage(), closePlanningPage(), planningOpenGoal(), planningOpenAllocation(), planningOpenCopy(), shared planning modal and refresh functions.

- [ ] Test that week and month render the same relevant new cards, day renders selected subgoals, and edits address stable plan identities.
- [ ] Add header expand control and day/week/month routes. Day lists visible subgoals, completion, timer, source navigation, time/date editing, and removal. Preserve sidebar on desktop; expose mobile return-to-timetable.
- [ ] Add period-goal form, shared new-card selection, allocation preview/commit and ignore, goal editing/removal, and day-copy preview/commit.
- [ ] Sync date/sidebar/list refresh; integrate source identity changes and popup stale-state handling.
- [ ] Verify browser flows including source addition after goal creation, both period tabs, copy, and responsive layout.
- [ ] Commit completed UI flows.

### Task 3: Release metadata, docs and review

**Files:** README.md, docs/DATA_FORMAT.md, V2 build ID, app_version.json v2BuildId.

- [ ] Document actual V2 workflow, schema-6 compatibility and copies; leave published main feature claims accurate.
- [ ] Run both timeline suites, planning suite, whitespace checks and main-file integrity check.
- [ ] Obtain a fresh whole-change review and address actionable findings with regression coverage.
- [ ] Save browser proof and open V2 for user review. Keep this release local; do not promote or publish main.

## Execution record

- Baseline: V2 59/59 timeline tests pass on 02fa3f8.
- Ruling: Continue in existing feature checkout so the user's 8767 preview follows changes; no additional worktree or repeated approval is needed for the requested V2 implementation.
- Ruling: The user has explicitly approved the design and requested V2 implementation. Plan creation is an implementation detail; continue directly rather than introducing another approval gate.
