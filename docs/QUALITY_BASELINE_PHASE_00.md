# Cadence quality baseline — Phase 00

**Review date:** 2026-10-17  
**Repository:** `ishanraychaudhuri2025/Tracker`  
**Production URL:** https://streako-elite.vercel.app/  
**Scope:** Read-only baseline inspection. No application behavior was changed for this baseline.

## Reproducible checkpoint

- Main commit at inspection: `ddbc13c2d5e2dbd590f01c50d366a5cdc7a43ba2`
- Commit message: `fix: isolate Cadence icon crop and separate flat wordmark`
- Production deployment: `dpl_DgVhSHUbhtHJ7LJvTXg2gTwL2JMu`
- Deployment state: `READY`
- Deployment source: `main` at the same commit SHA above.
- GitHub Actions CI for that SHA: passed.
- CI currently runs `npm install`, `npm run typecheck`, and `npm run build`. It does not run automated behavior or visual tests.
- Checkpoint branch created: `baseline/phase-00-2026-10-17`, pointing to the inspected main commit.
- No `package-lock.json` was present in the repository tree at inspection, so dependency resolution is not currently pinned by a committed npm lockfile.

Automated live-page access through the connected Vercel tool was denied (403). Therefore the deployment status is verified, but interactive/browser rendering was not independently tested as part of this baseline. User-provided screenshots were used as visual context.

## Architecture and source-of-truth map

| Area | Files | Responsibility |
| --- | --- | --- |
| Application shell / main state | `src/App.tsx` (about 1,304 lines / 96 KB) | Main navigation, habit flows, dashboard/insights/focus views, workspace hydration, client persistence and cloud upsert state |
| Styling | `src/styles.css` (6,209 lines / about 373 KB) | Shared and page-level UI styles; contains multiple historical override layers |
| Tasks | `src/TasksPage.tsx` | Task filtering, creation, deletion and completion interactions |
| Planner | `src/Planner.tsx` | Calendar navigation, per-day plans, recurring task occurrence logic |
| Authentication | `src/components/AuthScreen.tsx` | Supabase sign-in, sign-up, password reset/update |
| Supabase client | `src/lib/supabase.ts` | Public Supabase URL/publishable-key configuration |
| Data types | `src/types.ts` | Habit, task and navigation contracts |
| Workspace database | `supabase/migrations/20261014000100_tracker_workspaces.sql` | User-scoped workspace row and row-level security policies |
| Entry point | `src/main.tsx` | React root and stylesheet loading |

The application has some separation for Tasks, Planner and Authentication, but a large amount of state and multiple views remain in `App.tsx`. Shared scheduling and analytics behavior must be centralised carefully without destabilising current flows.

## Verified baseline findings

### P0 — Brand and design system

- Two different logo assets exist: `public/cadence-lockup-original.webp` (12,004 bytes) and `public/cadence-lockup.webp` (4,672 bytes).
- The sidebar uses the original horizontal lockup artwork cropped as an icon and renders a separate `CADENCE` text node beside it.
- The authentication screen uses `cadence-lockup.webp` as a complete image lockup. This gives different parts of the product different logo implementation paths.
- The stylesheet is 6,209 lines, contains 698 `!important` declarations, 75 media-query blocks and 6 `:root` blocks. A simple selector-count audit found numerous repeated rules, including `.sidebar` (27), `.main-content` (26), `.brand-lockup` (10) and `.nav-item` (9). These are signs of accumulated overrides and make future visual fixes hard to predict.
- The CSS contains 927 distinct matched hexadecimal tokens, including legacy green/cyan/orange/blue values. A single palette token system is not yet authoritative across all pages.
- The current font loading in `index.html` includes Montserrat and Playfair Display, but some stylesheet rules still reference fonts that are not loaded as web fonts.

### P0 — Product correctness

- `MomentumChart` in `src/App.tsx` emits completion values for days with no due habits as 0%. A day with no scheduled habits should not be presented as a missed-completion day.
- The `DAILY CHECK-INS` legend in that chart currently refers to markers plotted at the same percentage coordinates as the completion-rate line. That does not represent an independent count series.
- The chart control labelled `Range` only toggles between 7D and 30D; it is not currently a date-range picker.
- In `src/TasksPage.tsx`, recurring tasks can match the Completed filter based on having any historical completion, even when the occurrence relevant to the current date remains open. Task-level state and occurrence-level state need an explicit distinction.

### P1 — Information architecture / workflow

- Screenshots show Today selected while the content is titled Habit Analytics, with a secondary navigation strip offering Overview, Routines, Calendar, Focus sessions and Reports alongside the main sidebar's Today, Tasks, Planner, Habits, Insights and Focus. The page hierarchy should be simplified before adding further sections.
- The dashboard gives substantial first-screen space to metric cards and analytics. The Today page should prioritise current tasks/habits and the next action.
- Habit creation captures a useful cue and minimum version but places these alongside several advanced configuration fields. Advanced settings should be progressively disclosed.
- Save-status labels have historically differed between the top navigation and analytics header. A single shared status component should represent actual local/cloud persistence state.

### P1 — Documentation, build and test readiness

- The README describes Supabase authentication and user-scoped cloud workspaces in one section, but later retains an older paragraph saying that the app has no account system, database or cross-device sync. Its first-open/sample-data description is also inconsistent with the current empty-workspace code path.
- `PRODUCT_DECISIONS.md` says accounts and cloud sync are out of scope for the first version, which no longer matches the current implementation.
- No dedicated automated test/spec files were found in the tracked repository tree.
- CI verifies typechecking and compilation but not scheduling, recurring completion, analytics definitions, persistence/account switching, accessibility or visual regression.

## Phase 01 exit criteria

1. Sidebar and auth use explicitly defined canonical icon-only and wordmark assets; no screenshot crop or duplicated baked-in wordmark.
2. One declared palette and typography scale control the application, with no legacy accent leakage on major views.
3. Repeated global rules are consolidated rather than extended with another trailing override block.
4. A responsive logo lockup is verified at desktop, tablet and mobile widths.
5. Existing build/typecheck pass, and no page behavior or persisted data is lost.

## Planned execution order after this baseline

1. Phase 01 — Brand assets and foundational design tokens / CSS consolidation.
2. Phase 02 — Primary navigation and page hierarchy.
3. Phase 03 — Today workflow and dashboard.
4. Phase 04 — Habits page and creation flow.
5. Phase 05 — Analytics correctness and visualization.
6. Phase 06 — Recurring task and Planner correctness.
7. Phase 07 — Persistence, sync, reminders and export.
8. Phase 08 — Responsive design and accessibility.
9. Phase 09 — Automated tests, documentation and release QA.

## Change-control rules

- Make focused changes within a phase.
- Run the existing CI checks after source changes.
- Add or update tests for behavioral changes before closing the relevant phase.
- Review the rendered app at desktop and mobile sizes; a green build is not visual verification.
- Keep this checkpoint branch unchanged as a rollback reference.
- Do not begin the next phase until its exit criteria have been reviewed.
