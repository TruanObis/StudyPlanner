# Restorable PDF Import Review

Commit: `aa5d4a7 Add restorable PDF import for v2` — `cpa_app_timetable_monthly_v2.html` only (+498/-35). Line references are to the post-commit v2 file.

## Executive Summary

Safe to keep in v2. The core design is sound: import is append-only (no overwrite of existing planner data), all structural IDs (subject/card/module/tab/question) are regenerated, `backTo` links are recomputed, `dailyHistory`/`dDays` are deliberately excluded, and the "PDF without payload" path shows a clear message. Verified the commit touches only v2; `monthly` contains no `PDF_RESTORE_BEGIN` markers.

**Not ready for `monthly`.** Two issues should be fixed first: (1) a restore-payload build failure now aborts the entire PDF export that previously always succeeded, and (2) importing third-party PDFs widens an existing stored-XSS surface (unescaped titles + unsanitized markdown). Payload-scope superset and the after-`%%EOF` embedding tradeoff should also be consciously accepted or addressed.

## Findings

### 1. High — Payload build failure aborts the whole PDF export (regression)
- `exportPdfDocument`, v2 ~L1628–1640
- What can go wrong: user clicks 🖨️, PDF renders fine, but the download never happens and they get a generic "PDF 생성 중 오류" alert.
- Why: `await opts.restorePayload()` (which hits IndexedDB via `buildAssetBackupItems`, L2106) runs inside the same `try` as rendering. Previously `pdf.save(...)` was unconditional; now any asset-read error, `blobToDataUrl` failure, or IndexedDB unavailability (private mode) kills the export.
- Fix: wrap payload building in its own try/catch; on failure, download the plain PDF and toast "복원 데이터 없이 저장됨".

### 2. High — Imported payload strings widen an existing stored-XSS surface
- `importStudyPlannerPdfPayload` L2458; rendering: `renderHome` ~L3024 (`${sub.name}` unescaped into innerHTML, same for card titles/badges), `renderMarkdown` L623 (`marked.parse` with no sanitizer).
- What can go wrong: the feature's purpose is sharing PDFs between users. A crafted StudyPlanner PDF carries subject names / notes containing `<img onerror=...>` etc.; after import, script executes on every render with access to localStorage and the asset DB.
- Why: payload JSON is trusted after `schema` check; imported strings flow into innerHTML unescaped, and marked renders raw HTML.
- Fix (minimum): `escapeHtml()` titles/badges/names at render sites, or sanitize on import (strip HTML from short text fields; run markdown fields through DOMPurify or `marked` with sanitization). Pre-existing for JSON backups, but PDF sharing makes untrusted input the expected case.

### 3. Medium — Silent localStorage quota failure can lose an "imported" planner
- `saveData()` L2040 (`catch(e){}`); called from `importStudyPlannerPdfPayload` L2458+.
- What can go wrong: large imported text pushes `DATA` over the localStorage quota; import appears successful (toast, render), then vanishes on reload.
- Why: `localStorage.setItem` failure is swallowed. Pre-existing, but PDF import is the first feature that bulk-appends arbitrarily large external data.
- Fix: in `saveData`, on exception alert once ("저장 공간 부족 — 변경사항이 저장되지 않았습니다").

### 4. Medium — Payload scope is a superset of the visual PDF
- `exportCardPdf` L1647+: `home` card without children → `buildDetailRestoreData(sub.id, null, …)` embeds *all* detail cards and *all* referenced modules (full tabs + questions) via `appendSubjectToRestoreData` L2230; `detail` card → full module; `module_theory` → the tab *including every question* (`buildModuleSubsetRestoreData` L2306 only trims questions when `questionIndex` is an integer).
- What can go wrong: a user shares a "single card" PDF believing it contains only what's printed; recipient extracts full question banks, notes, and images.
- Why: restore builders clone parents/children wholesale instead of matching the rendered scope.
- Fix: either trim payloads to visual scope (theory-only tab → `tab.questions = []`; home card w/o children → card titles only or documentless), or explicitly label the export ("하위 데이터 포함") so the superset is intentional and visible.

### 5. Medium — Asset IDs are not remapped; import can silently overwrite an asset
- `importAssetsFromBackup` L2065 (`store.put({ id: item.id, … })`), called at L2458+.
- What can go wrong: an incoming asset with the same `a_<ts>_<rand>` id but different content replaces the local blob everywhere it is referenced.
- Why: structural IDs are regenerated but asset IDs are kept so `app://asset/<id>` markdown refs keep resolving; `put` overwrites unconditionally. Collision odds are low (timestamp+random) but nonzero, especially with re-shared/edited backups.
- Fix: before `put`, `get` the existing record; skip if `hash` matches, and if hashes differ, assign a new id and rewrite `app://asset/<oldId>` refs in the prepared subset.

### 6. Low — Gzip import requires `DecompressionStream`
- `ungzipBytes` L2144.
- Older Safari (<16.4) can export (graceful `json-base64` fallback in `encodePdfRestorePayload` L2150) but cannot import gzip payloads produced by modern browsers. Error message is clear. Acceptable; document as a support boundary.

### 7. Low — Internal hash links in imported markdown go stale
- `prepareImportedPlannerSubset` L2352 remaps ids but does not rewrite `#/detail/<oldId>` / `#/module/<oldId>` links inside note/scope/qbox text (e.g. from `copyCardMdLink`). Imported notes may contain dead links. Fix: optional link rewrite pass using the sid/mid maps, or accept and document.

### 8. Low — `location.hash = '#/'` after import discards user context
- `importStudyPlannerPdfPayload` end. Forcing navigation home is defensible (imported subjects land there) but jarring mid-detail-page. Consider focusing the first imported subject (`#/?focus=<newSid>`).

Positive verifications: append-only merge with no key collisions possible (all keys freshly `uid()`-generated); `activeTab` remapped via `tabMap` with fallback; `isRunning` scrubbed recursively (L2340); module-only payloads synthesize a wrapper subject/card; empty-structure payloads rejected with a clear error; `confirm()` shows counts before mutating; assets imported only after confirmation and before `DATA` mutation (failure leaves planner untouched); JSON import branch unchanged; file input reset in both branches; `exportData` refactor (L2461+ area) is behavior-equivalent plus a proper `revokeObjectURL`.

## Behavioral Risks

- **Bytes after `%%EOF`.** Chrome, Firefox, Edge, Preview, and Acrobat *readers* tolerate trailing data, so viewing works. But Acrobat "Save As"/repair, print-shop pipelines, PDF/A validators, some mail gateways, and any re-processing tool (OCR, compress, merge) will strip or reject the payload — silently producing a "no restore data" PDF. This is inherent to the approach; the robust alternative is a real PDF embedded-file attachment (EmbeddedFiles name tree), a larger change. At minimum, warn users that editing/re-saving the PDF removes restore data.
- **Payload size.** Images travel as base64 dataURL inside JSON, then the whole payload is base64'd again; gzip barely compresses base64-of-JPEG, so expect roughly +35–80% of raw image bytes appended to the PDF. A home-page export of an image-heavy planner can double file size and memory during export (`bytesToBase64` builds the full string in RAM).
- **Import memory.** `readPdfRestorePayloadFile` (L2215) loads the entire PDF into a `Uint8Array` and scans with JS loops — fine up to tens of MB, sluggish beyond.
- **Marker collision** is effectively impossible in the base64 body (`%` not in alphabet) and `lastIndexOfBytes` picks the final payload, so re-exported imports behave correctly.

## Test Plan

Manual (run in Chrome + Firefox + Safari, importing into a **non-empty** planner each time; verify original data untouched and new items appended with new IDs):

1. Export home PDF (filter `all` and a badge filter) → reimport → subjects/cards/modules/questions counts match confirm dialog; checklists work; timers start clean.
2. Export detail page PDF → reimport → cards appended under a new subject; module links open; `backTo` returns to the new detail page.
3. Export module page PDF → reimport → wrapper subject/card created; tabs, theory notes, questions intact; `activeTab` valid.
4. Export single question PDF → reimport → exactly one question in one tab (also verify what else came along — Finding 4).
5. PDF with images: markdown `app://asset/` images render after import into a fresh browser profile (empty IndexedDB); check `refreshAssetStorageUsage` badge.
6. PDF without payload (any external PDF) → "복원 데이터 없음" alert, planner unchanged, file input reusable immediately.
7. Existing JSON backup export → import → full-replace behavior unchanged, assets restored, "성공" alert.
8. Re-import the same StudyPlanner PDF twice → duplicates appended (expected), no ID collisions, no asset corruption.
9. Cancel at the confirm dialog → nothing changes, no assets written.
10. Corrupted payload (truncate the appended block in a hex editor) → error alert, planner unchanged.
11. Export with IndexedDB blocked (private mode) → verify Finding 1 behavior.
12. Large planner (>20MB images) export/import → time, memory, PDF opens in Acrobat; then Acrobat "Save As" the PDF and confirm reimport reports no data (documents the limitation).

Automated (feasible without a framework): unit-test `bytesToBase64`/`base64ToBytes` round-trip, `indexOfBytes`/`lastIndexOfBytes` edges, `decodePdfRestorePayloadBytes` on synthetic buffers (missing BEGIN, missing END, bad encoding tag, gzip and plain), and `prepareImportedPlannerSubset` ID-remap invariants (no source ID survives; every `card.module` resolves; `activeTab` valid).

## Promotion Checklist

- [ ] Finding 1 fixed: payload failure falls back to plain PDF download.
- [ ] Finding 2 addressed: imported strings escaped/sanitized at render or on import.
- [ ] Finding 3: quota failure surfaced to user.
- [ ] Finding 4: payload scope trimmed to visual scope or explicitly labeled — decision recorded.
- [ ] Finding 5: asset hash check before overwrite.
- [ ] Full test plan above passes in Chrome, Firefox, Safari (incl. one older-Safari import check).
- [ ] UX copy: warn that re-saving/editing the PDF elsewhere strips restore data.
- [ ] Diff v2→monthly reviewed to confirm only this feature moves.
- [ ] README / in-app help updated for the 📂 button's new `.pdf` support.

## Codex Follow-up Notes

Checked against the current repository state after commit `aa5d4a7`.

I agree with the overall verdict: this is safe to keep in `v2`, but it should not be promoted to `monthly` until the high/medium findings are addressed. Finding 1 is the first low-risk fix because restore-payload failure should never prevent a normal visual PDF download. Finding 2 is also real: raw HTML in imported titles/markdown was already possible through JSON backups, but PDF sharing makes untrusted import a normal workflow, so the risk becomes much more practical.

One checklist item was updated while reviewing this report: the note that `v2` had other unsynced changes (`fc9ceac`, `776a7b5`, `09b9d4f`) was stale for the current repo. Those changes were already copied into `monthly` by `a7258f9`; the current `monthly`/`v2` diff is the restorable-PDF feature from `aa5d4a7`.

Recommended implementation order:

1. Make payload build/attachment best-effort so PDF export falls back to a plain PDF.
2. Align restore payload scope with what the selected PDF visibly represents, or explicitly label exports that include more than the visible content.
3. Sanitize imported PDF payload strings, especially short title/badge fields and markdown fields that can carry raw HTML.
4. Surface `localStorage` quota failures from `saveData()` during import.
5. Prevent IndexedDB asset overwrite on hash mismatch by remapping colliding asset IDs and rewriting imported markdown refs.

## Notes For Implementer

- Trivial safe fix now: wrap `opts.restorePayload()` in try/catch inside `exportPdfDocument` and fall back to the plain blob (Finding 1) — isolated, no behavior change on the happy path.
- In `buildModuleSubsetRestoreData`, `tab.questions = []` for the `module_theory` case is a one-line scope fix.
- Consider `payload.data` size guard before `confirm()` (e.g. warn above ~10MB of text) to pre-empt Finding 3.
- `collectAssetIdsFromObject`'s regex matches the `a_<ts>_<rand>` id format correctly; if the asset ID scheme ever changes, this regex and the marker scan must change together.
- Long-term: move the payload into a PDF `EmbeddedFiles` attachment to survive re-saves; keep the current marker scan as a fallback reader.
