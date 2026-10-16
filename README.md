# Inmonite's Study Helper

A browser-based study planner for managing long-term study progress, daily schedules, timers, notes, attached images, exports, and D-Day targets.

The app runs directly in the browser and stores user data locally through `localStorage` and IndexedDB. The bundled starter content is CPA-oriented; subjects, cards, notes, and daily plans can be edited for other study goals.

## Main App and Experimental V2

Published app:

[Open Inmonite's Study Helper](https://truanobis.github.io/StudyPlanner/cpa_app_timetable_monthly.html#/)

* Main file: `cpa_app_timetable_monthly.html`
* Experimental staging file: `cpa_app_timetable_monthly_v2.html`

V2 is the workspace for trying and validating changes before applying them to the main file. It remains the experimental staging version even when the two files temporarily contain the same code after a promotion.

The features below describe the current published main app. Older files in `archive/` are retained for history or comparison.

## Features

* Subject / topic / module-based study card structure
* A 26-hour daily timetable with 10-minute planning, continuous time blocks, and independent card movement/resizing
* Add study cards by dragging their bodies or handles, or use the empty-cell context menu for cards and daily-only tasks
* Pale planned cards with actual execution overlaid at the real recording time
* Per-plan subgoals for daily progress, with parent-card progress as the default
* Context menus for names and colors, plus touch hold support on the timetable
* D-Day panel and KST-based date handling
* Study timers, accumulated time tracking, and editable daily time goals
* Calendar modal with monthly study-time summary
* Markdown notes and KaTeX math rendering
* Image attachments through browser IndexedDB, with upload resizing / compression and storage usage warnings
* Card folding / unfolding, reordering, duplication, movement, and deletion
* Multiple-card selection for supported batch actions
* Copyable Markdown links to cards
* Versioned JSON backup / restore with available referenced images and migration of supported older backups
* Startup protection that preserves malformed stored JSON or data with a newer unsupported schema
* PDF export for pages and cards, including child pages, internal links, bookmarks, and embedded restore data
* Import compatible StudyPlanner PDFs as additional card structures
* Obsidian vault ZIP export
* Anki TSV export from module question cards
* Dark mode

## Data Storage

Planner records are saved in `localStorage` under `universal_planner_v28_data`.

Images attached in Markdown notes are saved separately in the IndexedDB database `studyplanner_assets_v1`, in the `assets` object store.

Data is local to the browser profile and site origin. There is no automatic account or device synchronization. Another browser or device will not automatically have the same planner, and clearing site storage can remove it.

### Daily Timetable

The main app and V2 display a 26-hour timetable from midnight to the following day's 02:00.
Each hourly row has six 10-minute cells. Use **시간 블록 편집** to enter time-block
editing: draw, move, or resize blocks using their left/start and right/end edges.
Press **시간 블록 편집 완료** to return to card editing. Drag study cards anywhere
on the timetable, including empty areas outside time blocks. Cards move and resize
independently of the blocks. Each card has left/start and right/end handles that
appear on hover or keyboard focus, snapping to 10 minutes.
Topic cards on detail pages and question cards on module pages can be dragged
from their card bodies into the timetable, as well as from the drag handle.
Buttons, checkboxes, links, and editable inputs retain their normal interactions.
The timetable fits all 26 hours and its footer into the available screen height.
The goal and actual study-time row sits below the timetable, above the footer.
The 06:00, 12:00, 18:00, and following midnight grid lines are slightly stronger.
Blocks spanning multiple hours have one continuous outline and one name; partial
first/last hours form a polygon. Resizing the window preserves the 10-minute grid.
Arrow keys move a focused item; its edge handles adjust that edge by 10 minutes.
Time-block editing and card editing are mutually exclusive. The old card-list
panel below the timetable has been removed.
Click a planned card to start or stop its timer; moving or resizing it does not
toggle recording. Enter or Space on a focused planned card does the same.
Starting a linked card also opens its page while keeping the timetable sidebar
open. Subject cards open their subject detail page; topic cards open their own
module page, just like clicking the original card. Theory and question cards
select their containing module tab, including when that module is already open.
Question navigation also clears that tab's source filter so the question is visible.
Stopping a timer stays on the current page; daily-only tasks have no linked page.
For a daily-only task, use its context menu's **완료로 표시** / **미완료로 표시**
to change completion and daily progress. Marking it complete also stops its timer
after recording the elapsed time.
Right-click a parent plan (or hold it on touch screens) and choose **세부목표 설정**
to select descendant topic, theory, or question cards. Selections belong to that
date's plan. Daily progress and remaining tasks count the selected cards using
their existing completion states; an unconfigured plan counts its parent card
once. Clearing all selections restores this fallback. Deleted or no-longer-child
targets are excluded, with the same fallback when none remain. Repeated copies
of a plan retain their own targets and count separately, as before. Text copy
includes selected subgoals, and official backups retain the selections.
Recording always uses the current timestamp and date, even when the selected
plan is scheduled for later. Right-click a card to remove it, or an empty cell
to add a card or daily-only task. In block editing mode, right-click a block to
rename or delete it. Deleting a block preserves its planned cards.
Block names are edited directly in the context menu. Hover tooltips show only
the saved region name; unnamed blocks have no tooltip.
On touch screens, tap a planned card to toggle its timer, hold for 500 ms to open
its context menu, or drag to move it. A selected card shows its resize handles.
Movement cancels the hold menu, and holding never starts a timer. Hold an empty
cell to add a card; hold a block in block-edit mode to change its name or color.
Text copy uses saved region names (or time ranges for unnamed blocks), grouping
cards by their current time overlap instead of their original storage group.
Cards crossing multiple regions appear once under the largest overlap; cards
outside all regions appear under **영역 밖 계획**.
These context menus also offer eight colors and a default-color reset. Card
colors are shared by the same source card's plans and actual execution records;
each time block keeps its own color. Colors are saved with the planner and backups.

Plans use pale colors. Timer execution appears in a stronger color at its actual
time, including cards that were never planned. New execution timestamps are saved;
older cumulative totals cannot be reconstructed into historical time ranges.
The next day's 00:00–02:00 execution is visible in both relevant timetables, while
daily totals continue to use the KST calendar date without double counting.
**Daily 초기화** clears only the selected KST date's execution sessions, daily
elapsed total, and plan-card elapsed times. Plans, time blocks, names, colors,
subgoal selections, completion states, and the time goal remain. Other dates and
the source cards' cumulative study times remain; active timers keep recording
from the reset moment. Next-day execution shown in the 26-hour view belongs to
that next date and is reset from that date.

The main app uses schema 5; the current V2 planning experiment uses schema 6.
The main app keeps the existing
`universal_planner_v28_data` key and automatically migrates supported older data.
V2 uses the separate `studyplanner_v2_timeline_data` key. On its first use in a
browser profile, V2 copies and migrates the main record if present. Subsequent
changes are independent. Updating the main app never replaces its planner with
V2's experimental data. Schema-6 V2 backups can be restored in V2, but cannot
yet be imported into the schema-5 main app. Keep the main backup when testing V2.
Old time labels such as `오전 (09-12)` are placed on the grid; blocks without a
recognizable range remain available under **시간 미지정 블록** for manual placement.
Plans, notes, completion states, and accumulated times are retained. Older totals
have no timestamp history, so the app does not invent execution blocks for them.
Both current apps can import schema-5 official backups; V2 migrates them to schema 6.
Older schema-3 builds cannot import these backups.

Image blobs share the IndexedDB database. A full reset in either app preserves
that image store. Unused-image cleanup checks both planners' references and
stops if the other planner's stored JSON cannot be read.

For experiments that should not affect the working planner, use a separate browser profile and import a copy of an official JSON backup there. Export a backup before testing changes against real study data.

Run the main app's data, migration, timer, and interaction regression tests:

```powershell
node --test tests/timeline.test.cjs
```

Run the same suite against V2 in PowerShell:

```powershell
$env:PLANNER_APP_FILE = 'cpa_app_timetable_monthly_v2.html'
node --test tests/timeline.test.cjs tests/planning.test.cjs
Remove-Item Env:PLANNER_APP_FILE
```

The main file sets `IS_EXPERIMENTAL_BUILD` to `false`; V2 sets it to `true`.
Release version checks use `app_version.json`'s `buildId` for main and
`v2BuildId` for V2. Keep the appropriate field aligned with each file's `APP_BUILD_ID`.

## V2 Experiment: Planning Details

In `cpa_app_timetable_monthly_v2.html`, the arrow at the right of **일일 계획**
opens **계획 상세** beside the current learning page. The timetable and expanded
panel together occupy at most half the viewport, leaving source cards visible
and usable for editing and dragging. On narrow screens, the left half switches
between details and the timetable via **시간표**. Opening a source card keeps the
planning panel open. The daily sidebar date accepts direct numeric entry or the
browser's date picker, without an extra dialog or tooltip. Numeric edits commit
on Enter or when leaving the field; picker selections apply immediately.
Clicking the date text or calendar icon opens the native dropdown in both the
sidebar and details panel. Keyboard focus still allows direct numeric entry.

* **일간** lists every plan for the selected date, including unscheduled plans.
  Assigned subgoals are expanded by default. Check completion, edit subgoals,
  move a plan to another date, set its time in 10-minute steps, start/stop its
  timer, or open its source card. Completion uses the source card's current
  state, including when viewing past dates.
* **주간 / 월간** show **기간 목표** directly below the date controls. Drag a
  learning card into this area to create a goal for the displayed week or month,
  initially including its unfinished learning cards and all seven study weekdays.
  Repeating the same drop reuses the existing goal without changing its settings.
  **편집** adjusts dates, weekdays, and selected cards; **배분** assigns them to days.
  Dropping an existing daily plan here also creates a period goal while preserving
  the daily plan and its execution records.
  The diary calendar follows: seven dated sections for the week,
  or a Monday-first month grid including adjacent dates. Drag a learning card
  onto a date to add an unscheduled plan. Drag a planned card to another date
  to move it, keeping its duration and subgoals; actual study records remain on
  their recorded dates. Click a plan to edit it, or a date to see its daily
  list. Month cells show two compact cards and **+N** for the remaining plans.
  Calendar plans can also be dragged onto the timetable to set their time.
* **주간 / 월간 → + 목표** creates a period goal for a subject or topic, with
  dates, study weekdays, and selected learning cards. **배분** previews an even,
  ordered distribution over the remaining eligible dates. Confirming creates
  unscheduled daily parent plans with those cards as subgoals. Existing
  assignments and completed cards are skipped. No duration is guessed.
  A parent plan without selected subgoals counts only as that parent; it does
  not prevent its children from being allocated. Explicitly selected subgoals
  still prevent duplicate assignments, including descendants of selected topics.
* Both **주간** and **월간** show **새 카드** for goals overlapping the displayed
  period. Cards added or moved into the watched subject/topic after goal
  creation appear once, with their path, related goals, completion and assigned
  dates. Lower-level goals watch their owning topic, including new siblings.
  Select cards to allocate them or exclude them from the relevant goals.
  Existing daily plans and times are not automatically rearranged.
  Moving a goal's source updates its watched topic. Previously selected daily
  subgoals remain visible after source moves, keeping the daily timer source.
* **일간 → 다른 날짜로 복사** copies time blocks to a date range and selected
  weekdays. **계획 카드도 포함** also copies placement and selected subgoals.
  The preview reports overlaps; existing destination entries remain. Repeating
  the same copy skips previously copied entries. Timers, elapsed time, and
  execution sessions are never copied. Linked cards retain their source
  completion state; copied ad-hoc cards start incomplete.

Allocation and copy previews are rechecked before applying; changed source or
destination plans require a fresh confirmation. A single operation supports up
to 366 dates. Editing or deleting a period goal preserves its existing daily
plans. These planning features are V2-only and are not yet promoted to main.

## Backup, Restore, and Export

These formats are available in the current main app:

| Format | Purpose | Import behavior |
| --- | --- | --- |
| Official JSON backup | Full planner data, including daily history, plus available referenced images | Replaces the current planner after validation |
| Restorable StudyPlanner PDF | Readable pages/cards with restore data for the exported scope and included images | Adds imported card structures to the current planner |
| Obsidian ZIP | Linked Markdown notes, metadata, attachments, a manifest, and structured planner data | Export only; no ZIP or edited-vault import |
| Anki TSV | Module question cards exported as tab-separated fields | Export for use in Anki; no Anki import |

### Official JSON Backup

Use **💾 — 전체 공식 백업(JSON + 이미지)** to download the primary full-planner backup.

Use **📂 — JSON/PDF 가져오기** to select a JSON backup. JSON import replaces the current planner rather than merging it, so export the current planner first if you want to keep it.

Supported older JSON backups are migrated automatically. Unsupported future schema versions are rejected. Backups with many images can be large; image files that are already missing from browser storage cannot be recreated by exporting.

### Restorable PDF

Use the PDF export controls to export the current filtered page, an individual card, or a card with its child pages, depending on the control selected.

PDFs generated by the app can contain StudyPlanner restore data. The same **📂 — JSON/PDF 가져오기** button can read a compatible PDF and show a confirmation before adding its card structure.

This imports the exported scope; it does not replace the full planner or restore the complete daily history. Ordinary PDFs without StudyPlanner restore data cannot be imported this way.

Editing, compressing, merging, OCR-processing, or re-saving a PDF in another application may remove its restore data even when it still opens visually. Keep official JSON backups for full recovery.

### Obsidian ZIP

Use **🗂️ — Obsidian 보관함 ZIP 내보내기** to export linked Markdown notes, YAML metadata, image attachments, a manifest, and a copy of the structured planner data.

The integration is currently export-only. Changes made in Obsidian cannot be imported back into StudyPlanner through the ZIP.

## If the App Shows an Error or Blank Screen

1. If the app still opens, export an official JSON backup before troubleshooting.
2. If the recovery screen appears, use **원본 JSON 저장** to preserve the stored planner record. This raw JSON download does not include the images held separately in IndexedDB.
3. For an unsupported newer data format, open a compatible newer app. For other loading problems, inspect the browser console and check that required scripts can load before considering a reset.
4. Only use the app's full reset after preserving recoverable data and deciding to discard the current planner. It resets that app's planner and loads starter content, while retaining the shared image store. **Daily 초기화** only clears the selected day's execution times and keeps the plan.

Malformed stored JSON and unsupported newer schemas are left untouched by startup recovery. Avoid clearing all site storage as a first troubleshooting step.

## Starter Content

When no local planner data exists, the app tries to load `cpa_content_v2.json` as its initial content. Existing browser-saved data takes precedence. A full reset also attempts to reload this starter content.

The `v2` in this content filename does not make it exclusive to the experimental HTML file; the main app uses it too.

## Recommended Usage

1. Open the published app and use the starter subjects, edit them, or import a JSON backup.
2. Create topic cards under subjects, then open a topic card to open or create its module page.
3. Add theory notes, question cards, and image attachments.
4. Open **≡ — 일일 계획** and select the date to plan.
5. Drag a study card onto the timetable, or right-click/hold an empty cell to add a card or daily-only task. Drag either card edge to adjust its time in 10-minute steps.
6. Use **시간 블록 편집** to draw or adjust time blocks, then finish editing to work with cards. Set the study-time goal beneath the timetable.
7. Click a planned card to start/stop recording; starting also opens its page. Right-click/hold a parent plan and choose **세부목표 설정** to select the day's goals. Mark completion on the source cards.
8. Use the calendar to browse dates and monthly study time, and export JSON backups regularly.

Daily progress reads linked cards' existing completion states. Selected subgoals
belong to a particular date's plan, while their completion states are shared with
the source cards. Directly entered daily-only tasks have their own completion state.

## Further Documentation

* [`docs/DATA_FORMAT.md`](docs/DATA_FORMAT.md): storage, schema, migration, and export format details
* [`docs/REGISTRATION_READINESS.md`](docs/REGISTRATION_READINESS.md): dated release and registration preparation checklist
* [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md): third-party dependencies and notices

Some supporting documents retain v2/staging terminology from their preparation date. Features promoted to the main app are listed above.

## Notes

This is a personal study tool under active development.

Browser-local storage makes regular backups important. Libraries and fonts are loaded from external CDNs, so fully offline operation is not guaranteed.
