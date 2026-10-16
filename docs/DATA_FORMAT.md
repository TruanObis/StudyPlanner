# StudyPlanner Data Format

This document describes the data model implemented in the main app,
`cpa_app_timetable_monthly.html`, and experimental `cpa_app_timetable_monthly_v2.html`.

## Storage Layers

Planner records are stored in `localStorage` under:

`universal_planner_v28_data` (main) and `studyplanner_v2_timeline_data` (V2).
V2 copies the main record only when its own record is absent. Main reads only its
own record and never adopts V2 storage automatically. Both migrate supported
older records to schema 5. Migration failures preserve the original record.

Attached image blobs are stored separately in IndexedDB:

- Database: `studyplanner_assets_v1`
- Object store: `assets`
- Markdown reference: `app://asset/<asset-id>`

The planner record contains references to images, not the image bytes themselves.
Both apps preserve the shared image store during a full reset. Unused-image
cleanup considers references in both planner records before deleting any assets.

## Planner Schema

The main and V2 planner schema is version 5.

```json
{
  "schemaVersion": 5,
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
  "dailyHistory": {}
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
Each currently valid selected card contributes one item to daily progress and
remaining tasks, using its source completion state. An absent, empty, or entirely
stale list counts the parent plan once. Duplicate targets in a single selection
are counted once; separate planned copies continue to count separately. Source
identity changes update these references, and source deletion removes them.

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
  "schemaVersion": 5,
  "appBuildId": "build-id",
  "exportedAt": "2026-07-24T00:00:00.000Z",
  "data": {},
  "assets": []
}
```

`data` contains the complete migrated planner. `assets` contains referenced IndexedDB
records with a base64 data URL. Asset hash collisions are remapped during import, and
all affected `app://asset/` references are rewritten.

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
`planner-data.json` preserves the complete schema-v5 record for a future round-trip
importer.

The current ZIP is export-only. Editing files in Obsidian and importing them back into
StudyPlanner is not yet supported.

## Compatibility Matrix

| Format | Lossless planner restore | Images | Human-readable | Current import |
| --- | --- | --- | --- | --- |
| Official JSON | Yes | Yes | Partly | Replace current planner |
| Restorable PDF | Scoped | Yes | Yes | Append imported structure |
| Obsidian ZIP | Source data preserved | Yes | Yes | Export only |

