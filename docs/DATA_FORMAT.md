# StudyPlanner Data Format

This document describes the staging data model implemented in
`cpa_app_timetable_monthly_v2.html`.

## Storage Layers

Planner records are stored in `localStorage` under:

`universal_planner_v28_data`

Attached image blobs are stored separately in IndexedDB:

- Database: `studyplanner_assets_v1`
- Object store: `assets`
- Markdown reference: `app://asset/<asset-id>`

The planner record contains references to images, not the image bytes themselves.

## Planner Schema

The current planner schema is version 3.

```json
{
  "schemaVersion": 3,
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

## Migration Policy

Data is migrated one version at a time before normalization.

| From | To | Migration |
| --- | --- | --- |
| 1 | 2 | Rename legacy detail-card `moduleId` references to `module`. |
| 2 | 3 | Add root schema metadata and `meta.dataModel`. |

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
  "schemaVersion": 3,
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

A PDF exported by the v2 app may contain an appended StudyPlanner restore payload.
This is an emergency portability format, not the canonical backup.

The payload can disappear when a PDF is edited, compressed, merged, OCR-processed,
or saved again by another PDF application. The official JSON backup should therefore
remain the primary recovery artifact.

## Obsidian ZIP

The v2 app can export a one-way Obsidian package:

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
`planner-data.json` preserves the complete schema-v3 record for a future round-trip
importer.

The current ZIP is export-only. Editing files in Obsidian and importing them back into
StudyPlanner is not yet supported.

## Compatibility Matrix

| Format | Lossless planner restore | Images | Human-readable | Current import |
| --- | --- | --- | --- | --- |
| Official JSON | Yes | Yes | Partly | Replace current planner |
| Restorable PDF | Scoped | Yes | Yes | Append imported structure |
| Obsidian ZIP | Source data preserved | Yes | Yes | Export only |

