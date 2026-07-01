# Inmonite's Study Helper

A browser-based study planner for managing long-term study progress, daily schedules, timers, notes, attached images, PDF exports, and D-Day targets.

This project is a single-page HTML study helper. It runs directly in the browser and stores user data locally through `localStorage` and IndexedDB.

## Main App

Published app:

https://truanobis.github.io/StudyPlanner/cpa_app_timetable_monthly.html#/

Main file:

`cpa_app_timetable_monthly.html`

Experimental staging file:

`cpa_app_timetable_monthly_v2.html`

Older files may remain in the repository for backup, archive, or comparison, but the current published working version is `cpa_app_timetable_monthly.html`.

## Features

* Subject / topic / module-based study card structure
* Daily timetable sidebar
* D-Day panel
* KST-based date handling
* Study timer and accumulated time tracking
* Daily goal tracking
* Calendar modal with monthly study-time summary
* Markdown notes
* KaTeX math rendering
* Image attachment support through browser IndexedDB
* Image upload resizing / compression and storage usage warnings
* Card folding / unfolding
* Card drag-and-drop
* Card duplication, movement, deletion
* Copyable Markdown links for cards
* JSON backup / restore, including attached images when available
* PDF export for pages and cards, including child pages, internal links, and PDF bookmarks
* Dark mode support

## Data Storage

The app stores planner data in the browser.

Main planner data is saved in:

`localStorage`

Images attached in Markdown notes are saved in:

`IndexedDB`

Because the data is browser-local, using another browser, another device, or clearing browser storage may make the planner appear empty.

Use the export button regularly to create JSON backups.

## Backup and Restore

Use the save/export button in the app to download a planner backup as a JSON file.

Use the import button to restore a previously exported JSON backup.

Backups may include attached image data, so backup files can become large when many images are attached.

## Experimental V2 PDF Restore

`cpa_app_timetable_monthly_v2.html` includes an experimental restorable PDF workflow.

PDFs exported from the v2 app can include StudyPlanner restore data, so the same import button can read either JSON backups or compatible StudyPlanner PDFs.

This is currently a staging feature. If a PDF is edited, compressed, merged, OCR-processed, or saved again in another PDF app, the restore data may be removed even though the PDF still opens visually.

## If the App Shows a Blank Screen

Open the browser developer console and run:

```js
localStorage.clear();
location.reload();
```

This resets the local planner data and reloads the app.

Warning: this deletes the current local planner data in that browser. Export a backup first if possible.

## Optional Content File

The app may try to load:

`cpa_content_v2.json`

This file can be used as initial planner content when no local data exists.

If local data already exists, the browser-saved data is used instead.

## Recommended Usage

1. Open the published app or the main HTML file.
2. Add subjects or import an existing JSON backup.
3. Create topic cards under each subject.
4. Click a topic card to open or create its module page.
5. Add theory notes, questions, and image attachments.
6. Drag cards into the daily timetable sidebar.
7. Use timers and completion checkboxes to track study progress.
8. Export backups regularly.

## Notes

This project is designed as a personal study operations tool rather than a polished production service.

Most data is stored locally in the browser, so backup management is important.

The current version is under active development and may change frequently.
