# Hierarchical allocation and continuous plan cards

Implement the user's approved V2 corrections in place; keep the main app unchanged.

1. Monthly allocation creates individual learning-card plans in source order on
   eligible dates. Group those assignments by calendar week and owning topic to
   create linked weekly goals. A long topic may continue in the next week.
   Weekly allocations also create individual learning-card plans.
2. Migrate schema-6 generated, untimed parent wrappers into their assigned cards
   at the same dates. Preserve timed/running/recorded plans and all execution
   history. Stable plan IDs and schema-7 parent goal links survive backups.
3. Display weekly topic goals in the weekly tab, monthly roots in the monthly
   tab, and actual learning cards in every diary. Keep new-card discovery on the
   parent scope, and preview both weekly goals and daily assignments.
4. Render each multi-hour planned card as one connected shape with one label,
   retaining hover edge handles and ten-minute interactions.
5. Give weekly/monthly diary cards right-click and touch-hold edit menus, with
   existing daily plan editing/removal semantics.

Validation: failing behavioral regressions first, all planning/timeline suites,
backup/migration idempotence, existing real QA-origin data in browser, calendar
menus and continuous shapes, then an independent review and README/data docs.

Completed in V2 build `2026-10-17-planning-workspace-6` (schema 7).
Validation: 111 V2 regressions pass; the unchanged main app's 59 regressions pass.
Browser checks cover existing schema-6 QA data migration, weekly topic goals,
monthly leaf-card titles, cross-date context editing, a continuous 250-minute
card, overlapping cards, ten-minute endpoint edits, and visible menus at 390px.
Review fixes preserve canonical running-source wrappers and ensure short
cross-hour polygons have a positive-area connection. Both have RED/GREEN tests.
