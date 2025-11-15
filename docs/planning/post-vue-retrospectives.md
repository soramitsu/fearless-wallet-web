# Post-Vue Retrospectives — Plan

Updated: 2024-10-07  
Owner: Daria Smirnova

## Goal

Capture Vue 3 migration lessons, close documentation debt (Pinia, Sora loader, release checklist), and plan the next DX/tooling iteration during **Sprint 49 retro week (Dec 9–13)** with final deliverables by **2024-12-13**.

## Agenda

1. **What went well / challenges** – Gather feedback from runtime, web UI, QA, and platform DX teams on the Vue 3 rollout.
2. **Documentation debt** – Ensure outstanding docs (Pinia guide, Sora loader, release checklist) reflect post-migration learnings.
3. **Tooling roadmap** – Prioritize next DX/tooling items for Q1 (e.g., telemetry dispatcher, E2E suite refresh).
4. **Action items** – Assign owners/dates for agreed follow-ups.

## Preparation Checklist

- [ ] Collect migration metrics: PR counts, regressions, QA findings, timeline adherence.
- [ ] Survey team via Google Form/Slack to gather talking points before retro.
- [ ] Review documentation gaps (Pinia vs Vuex plan, runtime docs, release checklist) and note updates needed.
- [ ] Compile list of outstanding issues/tech debt to seed the tooling roadmap discussion.

## Retro Flow

1. Silent brainstorming (15 min) – capture “Start/Stop/Continue” items.
2. Group discussion (30 min) – cluster themes (DX, tooling, QA process, comms).
3. Action planning (15 min) – assign owners + due dates.
4. Documentation updates (async) – ensure decisions reflected in relevant docs.

## Outputs

- Retro notes doc with categorized feedback + action items.
- Updated docs:
  - Pinia guide: `docs/pinia-migration.md`
  - Runtime docs: `docs/runtime/sora-loader.md`, `docs/planning/release-readiness-drill.md`
  - Release checklist: `docs/release-checklist.md`
- DX/tooling backlog items for next quarter (telemetry, E2E automation, linting upgrades).

## Risks & Mitigation

| Risk               | Mitigation                                                        |
| ------------------ | ----------------------------------------------------------------- |
| Low participation  | Send survey + calendar invites early, keep meeting short/focused. |
| Action items stall | Track via Jira / planning calendar, sync in Sprint planning.      |

## Timeline

- **Nov 25** – Send survey + collect talking points.
- **Dec 05** – Draft agenda + pre-read.
- **Dec 11** – Run retro during Sprint 49 retro slot.
- **Dec 13** – Publish notes + doc updates.
