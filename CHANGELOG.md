# Changelog

All notable changes to this repository are documented in this file.

## [1.1.0] - 2026-02-24

### Added

- `clasp` deployment scaffolding (`appsscript.json`, `.clasp.json.example`) for both GAS projects.
- Release readiness tooling:
  - `npm run scan:secrets`
  - `npm run release:check`
  - GitHub workflow: `release-readiness.yml`
- Operations documentation:
  - `docs/RELEASE_CHECKLIST.md`
  - `docs/OPERATIONS_RUNBOOK.md`
- Slack sync improvements:
  - `NO_DND_KEYWORDS` (DND opt-out with higher priority than `DND_KEYWORDS`)
  - optional `FALLBACK_CAL_ID` calendar branch in decision engine
  - optional error alerts via webhook/email
- Absence sync improvement:
  - optional error alerts via webhook/email
- New unit tests for decision-engine and alerting paths.

### Changed

- CI now includes secret scanning.
