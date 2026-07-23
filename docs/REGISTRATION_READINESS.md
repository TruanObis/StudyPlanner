# Copyright Registration Readiness

Status date: 2026-07-24

This is an engineering and evidence checklist, not legal advice. Confirm the filing
requirements in the registration portal on the actual application date.

## Candidate Boundary

- Published application: `cpa_app_timetable_monthly.html`
- Registration candidate under test: `cpa_app_timetable_monthly_v2.html`
- Protected rule: do not change or publish `monthly` until the v2 acceptance checks pass.
- Archive files are history/reference material and are not part of the candidate.

The candidate should be frozen only after the user explicitly approves promotion from
v2 to monthly.

## Decisions Required Before Freeze

- [ ] Confirm the exact author/rightsholder spelling. The repository license currently
  says `TruanObis`, while the public GitHub account/URL uses `truanobis`.
- [ ] Confirm whether the registered name is a legal name, pseudonym, or entity name,
  and use the same choice in the application, source header, release notes, and evidence.
- [ ] Confirm that the repository's MIT publication is intentional for the registration
  candidate. Registration and open-source licensing answer different questions, but
  the public license still governs recipients.
- [ ] Decide whether `cpa_content_v2.json` is included in the claimed work. Review exam,
  textbook, and other source-derived wording separately from the original program code.
- [ ] Record the claimed creation date and first-publication date with supporting commits,
  deployment history, and screenshots.
- [ ] Review the official guidance for generative-AI-assisted works and describe only the
  human-authored selection, arrangement, modification, and engineering decisions that
  can be supported by records.

## Suggested Claim Scope

Candidate program source:

- `cpa_app_timetable_monthly_v2.html`
- `app_version.json` after the final build ID is assigned
- Original project documentation that describes the program and data model

Review or exclude from the claimed original portion:

- Runtime libraries and fonts loaded from third-party CDNs
- `archive/`
- User-created planner backups, attached images, and exported PDFs
- Educational/exam content whose origin or permission is not documented
- Generated test fixtures and local test-server helpers

See `THIRD_PARTY_NOTICES.md` for the dependency boundary.

## AI-Assisted Development Record

Keep a private evidence bundle containing:

1. User-authored requirements and corrections.
2. Design choices accepted or rejected by the user.
3. Code review reports and the resulting human-approved changes.
4. Git commits showing iterative modification rather than a single opaque output.
5. Test evidence showing human-directed verification.
6. A short statement identifying the AI tools used and the user's creative and technical
   contribution.

Do not commit private conversations or personal data to the public repository merely to
create evidence. Store the private bundle beside the filing records.

The Korea Copyright Commission publishes a dedicated
[Guide to Copyright Registration for Generative AI-Assisted Works](https://www.copyright.or.kr/information-materials/publication/research-report/view.do?brdctsno=54253).
Review that guide and the current filing form immediately before submission.

## Acceptance Checklist

Already verified in Chromium staging:

- [x] Markdown links activate instead of opening their parent card.
- [x] External links use a separate tab with `noopener noreferrer`.
- [x] Legacy, schema-v3, and future-version JSON import paths.
- [x] Newer local schemas and malformed local JSON are not overwritten.
- [x] Official JSON backup contains schema metadata and referenced image bytes.
- [x] Obsidian ZIP contains linked notes, manifest, source data, and attachments.
- [x] Obsidian Markdown contains no unresolved app image URLs when assets exist.

Required before release freeze:

- [ ] Link regression test on home, detail, module theory, and question notes.
- [ ] KST rollover test around 00:00 KST for Today, calendar, daily plan, and D-Day.
- [ ] Timer start/stop and date-rollover test with a hidden/background tab.
- [ ] JSON export/import test into a clean browser profile with several images.
- [ ] PDF export/import test for home, detail, module, theory, and one question.
- [ ] Large PDF test with enough content to trigger multiple canvas chunks.
- [ ] PDF re-save warning test and a deliberate no-payload import test.
- [ ] Obsidian ZIP inspection in the desktop Obsidian app.
- [ ] Storage quota warning and failed-save rollback test.
- [ ] Current Chrome, Edge, and Firefox smoke tests.
- [ ] Mobile-width layout smoke test.
- [ ] No unexpected console errors during the full workflow.

## Freeze Procedure

1. Export a real planner JSON backup and verify it in a clean browser profile.
2. Finish the acceptance checklist and record browser versions and dates.
3. Remove local fixtures and confirm a clean worktree.
4. Review the exact v2-to-monthly diff.
5. Promote only the approved v2 code to monthly.
6. Assign the same final `APP_BUILD_ID` and `app_version.json` build ID.
7. Commit with a registration-candidate message and create an immutable Git tag.
8. Create a source archive from that tag.
9. Generate SHA-256 hashes for the source archive and principal HTML file.
10. Save screenshots, the test record, dependency notice, Git commit/tag, hashes, and
    deployment URL in a dated private evidence folder.
11. Submit the exact frozen artifact. Start later development from a new commit.

## Known Limitations To Record

- Data and images are browser-local unless the user exports a backup.
- Restorable PDF payloads may be stripped by PDF re-processing software.
- Obsidian integration is export-only in this candidate.
- The app depends on pinned CDN resources and therefore has a runtime network dependency
  unless those resources are vendored later.
- The single-file architecture has no dedicated automated test suite; the release record
  must therefore include the manual regression matrix.

## Official Timing Note

The Korea Copyright Commission describes registration as recording matters such as the
author, creation date, and first-publication date. Its registration overview also states
that the presumption tied to a registered creation date requires registration within one
year of creation. Verify how that rule applies to this specific work and development
history with the Commission or qualified counsel:

https://www.copyright.or.kr/business/registration/index.do

