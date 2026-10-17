# StudyPlanner Data Format

This document describes the data model implemented in the main app,
`cpa_app_timetable_monthly.html`, and experimental `cpa_app_timetable_monthly_v2.html`.

## Storage Layers

Planner records are stored in `localStorage` under:

`universal_planner_v28_data` (main) and `studyplanner_v2_timeline_data` (V2).
V2 copies the main record only when its own record is absent. Main reads only its
own record and never adopts V2 storage automatically. Both apps migrate
supported older records, including schema-5 main records, to schema 7.
Migration failures preserve the original record.

Attached image blobs are stored separately in IndexedDB:

- Database: `studyplanner_assets_v1`
- Object store: `assets`
- Markdown reference: `app://asset/<asset-id>`

The planner record contains references to images, not the image bytes themselves.
Both apps preserve the shared image store during a full reset. Unused-image
cleanup considers references in both planner records before deleting any assets.

## Planner Schema

Both main and V2 use planner schema version 7. Their official backups are
compatible with each other; importing one replaces the destination planner
after validation. The two browser storage records remain independent.

```json
{
  "schemaVersion": 7,
  "meta": {
    "version": "2.6",
    "dataModel": "studyplanner"
  },
  "home": {
    "title": "StudyPlanner",
    "subtitle": "",
    "subjects": [],
    "dDays": []
  },
  "details": {},
  "modules": {},
  "dailyHistory": {},
  "periodGoals": []
}
```

Core hierarchy:

1. `home.subjects[]` contains subject cards.
2. `details[subjectId].cards[]` contains detail cards.
3. A detail card may reference `modules[moduleId]`.
4. A module contains `tabs[]`.
5. A tab contains `questions[]`.
6. `dailyHistory[YYYY-MM-DD]` contains timetable slots and references to the same records.

### Timetable and Execution

Slots contain `startMinute` and `endMinute` measured from that date's KST midnight.
Valid plans use multiples of 10, have a minimum duration of 10 minutes, and stay
within `[0, 1560]` (next-day 02:00). Each `cardIds[]` reference has its own range,
independent of its slot's geometry. Moving, resizing, or deleting a time block
leaves its cards' times unchanged. Both card edges can extend beyond the block.
Cards dropped on empty space, or retained after a block is deleted, use a hidden
slot with `cardOnly: true` and null slot endpoints. References in this storage
group are still drawn from their individual time ranges. Unscheduled legacy
slots and references can have null endpoints until they are placed.

A daily plan reference may have `progressTargets: [{type, id, pid}, ...]`.
These refer to selected descendant detail, theory, or question cards. The list
belongs only to that date and plan; it never changes the source card's completion.
Source identity changes update these references, and source deletion removes
them. Both apps compute partial progress from learning-card counts instead of treating each
parent as only complete/incomplete. Subject and detail progress sum the completed
and total theory/question cards underneath; a detail with no module content is
one item. Subject progress deduplicates shared module identities within that
subject. Overall progress traverses only subjects registered in `home.subjects`
and deduplicates shared modules across that entire scope. Different modules and
standalone detail cards remain distinct even when their local card IDs match.
Unlinked detail pages are retained in storage but excluded from overall progress;
registering their subject again includes them without changing their completion
or execution records. These calculations do not change the schema or the existing
study-time aggregation. Daily progress expands selected subject/detail targets (or the default
parent) into those same learning units, deduplicating source identities across
all plans on that date. A parent plan and a separate plan for its child therefore
share one completion item for that child, even in different time blocks.
Explicit theory and question targets each remain one item. Independent daily-only
tasks and different dates remain separate. Selected subgoal checklists preserve
parent goals and indent children beneath them, independently of the deduplicated
progress units. Ancestors shown only for context have no completion checkbox.
The stored `progressTargets` choices are unchanged. Daily goal counters derive
from that date's execution sessions, merging overlapping descendant intervals
for parents and retaining legacy daily ref totals. Starting a subgoal uses its
canonical timer and records the actual current date; no extra plan is created.
These derived counts are not stored; adding/removing
source cards or changing completion immediately updates the percentages without
rewriting plans, completion flags or execution records. Full-completion checks
compare counts exactly rather than relying on rounded percentages.

### Period Goals and Planning Identity (Schema 7)

An optional `dailyHistory[date].calendarPlanOrder` array stores unique `planId`
strings in the manual display order shared by weekly and monthly calendars.
It does not change slot membership, scheduled times, the chronological daily
list, or execution records. Without this array, calendars sort chronologically.
Unlisted plans follow the listed plans in chronological order; deleted or moved
plan IDs are ignored. Cross-date moves remove the ID from the source order.
Explicit insertion saves the destination's complete current order, including
cards hidden by the month view. Official backups retain this additive schema-7
field; imports reject a non-array, invalid IDs, or duplicates.

The root `periodGoals` array stores weekly and monthly goals:

```json
{
  "id": "goal_example",
  "kind": "month",
  "root": {"type": "subject", "id": "subject_management"},
  "scope": {"type": "subject", "id": "subject_management"},
  "startDate": "2026-10-17",
  "endDate": "2026-10-31",
  "weekdays": [1, 2, 3, 4, 5],
  "dailyTime": {"startMinute": 540, "endMinute": 660},
  "targets": [{"type": "theory", "id": "core", "pid": "module_example"}],
  "knownRefs": []
}
```

`kind` is `week` or `month`; both kinds share the same allocator. `root` is
the chosen goal card and `scope` is the subject/topic watched for new cards.
For theory/question roots, scope is the owning topic. `targets` stores selected
learning units; `knownRefs` snapshots identities already reviewed in that scope.
New-card detection compares current identities to this set, so renaming is not
a new card, while newly added or moved-in identities are. Allocation or explicit
exclusion acknowledges the selected identities. No timestamp is required.

Optional `dailyTime` specifies this goal's daily study window. Its integer
endpoints must be multiples of 10, within 0–1560 minutes, with end after start.
`null` explicitly leaves times unset. An absent field inherits the parent
monthly goal's window for a generated weekly goal; independent goals with an
absent field remain untimed. A weekly goal can override the inherited window or
set `null`, and removing its field resumes inheritance. This additive field
uses schema 7 and survives official backups without changing legacy goals.

Each daily reference receives a globally unique, stable `planId`. Allocation
creates one reference to the actual learning unit, with `goalId` and either a
range within its effective `dailyTime` or null endpoints. It does not wrap units
in a daily subject/topic card. Already timed plans and actual records remain
intact. Assigned units (across dates/goals) and completed units are skipped for
new plans. Selected, incomplete, untimed references linked to the goal or its
generated children can receive times without changing their date or `planId`.
Editing a goal's effective `dailyTime` now prepares a new time allocation for
all existing linked plans before saving. Monthly changes include inheriting
weekly goals but preserve explicit weekly overrides. Plans keep their dates,
IDs, source references, subgoals, completion and elapsed records; only their
planned endpoints change. Null effective hours clear those endpoints. Completed
and running plans are included without changing their timers or real sessions.
Unchanged effective hours leave manual placements alone. Retiming excludes its
own previous ranges from occupied time and aborts the entire goal save if the
new window lacks capacity. It never creates additional plans.
The preview divides free 10-minute cells between that day's pending cards,
keeping each card contiguous. Existing and newly proposed ranges reserve time
across date boundaries; insufficient capacity aborts before any allocation is
saved. Inherited monthly time changes also invalidate a weekly preview.
Monthly allocation also creates topic-level weekly goals
with `parentGoalId` pointing to the monthly goal. Their dates are the calendar
week clipped to the monthly period, and their targets are the units allocated
to that topic/week. Daily plans link to the weekly goal. A topic can span weeks.
Parent links must reference an existing monthly goal; only weekly goals can
have them. Generated children do not independently discover new cards: their
parent scope handles discovery in both period views.

Moving a generated plan within the monthly period relinks it to the destination
week's topic goal. Moving outside its goal's date range detaches `goalId`.
Deleting a monthly goal also removes generated weekly goals. The deletion
dialog counts daily references linked by `goalId` to the selected goal or its
generated children, and offers to keep them (detaching `goalId`, the default)
or remove them together. Deleting a weekly goal leaves its parent and sibling
goals intact. Unrelated plans, source cards, time blocks, and execution history
remain. Source identity moves also relink generated plans to the correct topic
while retaining plan IDs and times.

The 6-to-7 migration splits only generated parent wrappers with explicit valid
learning-unit subgoals and no assigned time, elapsed time, running state, or
completion flag. It preserves the original date and first plan ID; additional
units get new IDs. Monthly wrappers gain weekly topic links. Manual plans,
timed/recorded wrappers, stale targets, and all execution sessions are preserved.
The migration is idempotent and operates on a cloned record before validation.

Allocated plans set `progressTargetsFollowMoves: true`. This retains their
explicit, still-existing selected cards even after those cards move outside the
daily parent's hierarchy. The daily parent's source identity and timer remain
unchanged. The flag survives copy and goal detachment. A moved goal root updates
its watched scope. New allocations create independent learning-card plans.

Duplicate-allocation checks expand explicitly selected subject/topic subgoals
into their covered learning units. An unconfigured parent reserves only itself.
An assigned theory covers that theory only, since
theory and questions are separate learning units. Distribution uses the current
source-card order, regardless of checkbox selection order.

Both apps ensure stable slot IDs, including imported legacy slots. Copies receive new
slot/plan IDs and optional `copiedFromBlock` / `copiedFromPlan` provenance values
in `sourceDate:sourceId` form. These prevent repeated copies from duplicating
the same source entry. Copies retain geometry, colors and subgoal selection but
exclude `goalId`, elapsed time, running state and execution sessions. Ad-hoc
copies get a new card ID and start incomplete; linked-card completion remains
the current source state, not a per-day historical snapshot.

Official backups preserve these fields. Preview fingerprints are transient UI
state, not persisted planner records. Allocation/copy recheck current data before
applying a preview; changed plans require another review.

Optional `timelineColors` at the planner root maps `type|id|pid` keys to integer
HSL hues in `[0, 359]`; subject keys always have an empty `pid` component. Plans
and actual sessions use the same mapping. Individual slots may have an optional
`colorHue` in the same range. Missing colors use the defaults. These settings are
included in official backups.

`dailyHistory[date].sessions[]` contains actual timer history:

```json
{
  "id": "run_example",
  "ref": {"type": "subject", "id": "subject_accounting", "pid": null, "title": "회계학"},
  "startMs": 1792195200000,
  "endMs": 1792197000000
}
```

Timestamps are epoch milliseconds, independent of plan snapping. A title snapshot
keeps history readable after the source is deleted. Adjacent ticks for the same
card merge; pauses remain gaps. Sessions are split and stored once per KST
calendar day. The 26-hour view clips sessions from its date and the following day.
This display overlap never adds to `totalSeconds`. Simultaneous timers retain
individual sessions while the daily elapsed total counts time only once.

Daily reset clears the selected KST date's `sessions`, `totalSeconds`, and every
plan reference's `time`. Slots, ranges, labels, colors, progress targets, completion
states, and `goalStr` are preserved. Source-card cumulative time and other dates
are unaffected. Active timers continue with a new interval at the reset moment.

## Migration Policy

Data is migrated one version at a time before normalization.

| From | To | Migration |
| --- | --- | --- |
| 1 | 2 | Rename legacy detail-card `moduleId` references to `module`. |
| 2 | 3 | Add root schema metadata and `meta.dataModel`. |
| 3 | 4 | Add slot/card time ranges and empty execution-session arrays. Parse recognizable legacy slot time labels; retain unknown ranges as unscheduled. Preserve accumulated time and card references. |
| 4 | 5 | Support optional per-plan progress targets. Existing plans keep parent-card progress without adding selections or modifying study records. |
| 5 | 6 | Add an empty period-goal list and stable daily-plan/slot identities; retain existing plans, targets, names, colors and execution data. |
| 6 | 7 | Split eligible generated, untimed parent wrappers into selected learning-card plans and link monthly allocations to weekly topic goals. Preserve manual, timed, running, recorded or completed plans and all execution history. |

Data without `schemaVersion` is treated as version 1 for backward compatibility.

A schema newer than the app supports is rejected without overwriting the browser copy.
Malformed stored JSON is also left untouched. The error screen offers a raw JSON
download before destructive reset.

Every future structural change must:

1. Increment `PLANNER_SCHEMA_VERSION`.
2. Add exactly one sequential migration function.
3. Preserve old import fixtures.
4. Add a future-version rejection test.
5. Update this document.

## Official Backup

The lossless backup format is:

```json
{
  "format": "inmonite-studyplanner-backup",
  "formatVersion": 1,
  "schemaVersion": 7,
  "appBuildId": "build-id",
  "exportedAt": "2026-07-24T00:00:00.000Z",
  "data": {},
  "assets": []
}
```

`data` contains the complete migrated planner. `assets` contains referenced IndexedDB
records with a base64 data URL. Asset hash collisions are remapped during import, and
all affected `app://asset/` references are rewritten.
The envelope's `schemaVersion` is 7 for both main and V2.

Legacy root JSON backups and root-level `__assets` are still accepted and migrated.

## Restorable PDF

A PDF exported by either app may contain an appended StudyPlanner restore payload.
This is an emergency portability format, not the canonical backup.

The payload can disappear when a PDF is edited, compressed, merged, OCR-processed,
or saved again by another PDF application. The official JSON backup should therefore
remain the primary recovery artifact.

## Obsidian ZIP

Both apps can export a one-way Obsidian package:

```text
StudyPlanner/
  StudyPlanner.md
  Subjects/
  Cards/
  Modules/
  Daily/
  attachments/
  _studyplanner/
    manifest.json
    planner-data.json
```

Markdown notes contain YAML frontmatter with stable StudyPlanner IDs, type, parent ID,
and order. Wiki links preserve the subject-to-question navigation tree. App image
references are rewritten to Obsidian embeds under `attachments/`.

`manifest.json` identifies every generated note and attachment.
`planner-data.json` preserves the complete record (schema 7 in both apps)
for a future round-trip importer.

The current ZIP is export-only. Editing files in Obsidian and importing them back into
StudyPlanner is not yet supported.

## Compatibility Matrix

| Format | Lossless planner restore | Images | Human-readable | Current import |
| --- | --- | --- | --- | --- |
| Official JSON | Yes | Yes | Partly | Replace current planner |
| Restorable PDF | Scoped | Yes | Yes | Append imported structure |
| Obsidian ZIP | Source data preserved | Yes | Yes | Export only |

