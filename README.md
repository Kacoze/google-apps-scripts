# Google Apps Scripts Collection

A set of Google Apps Script automations for Google Calendar and Slack.

## Projects

- `google-calendar-absence-sync` - Syncs absence events from a team calendar to a personal calendar as Out of Office events.
- `slack-calendar-status-sync` - Syncs Slack status, presence, and DND based on Google Calendar events.

## Security

- The repository does not include production secrets.
- Store sensitive config in `PropertiesService` and keep placeholders in `CONFIG`.
- `google-calendar-absence-sync` reads: `SOURCE_CALENDAR_ID`, `TARGET_CALENDAR_ID`, `PERSON_NAME`.
- `slack-calendar-status-sync` reads: `HOLIDAY_CAL_ID`, `STATUS_CAL_ID`, `MEETING_CAL_ID`, `SLACK_USER_TOKEN`.
- Run a quick secret scan before publishing:

```bash
rg -n --hidden -S "(xox[pbar]-|AIza|AKIA|ghp_|github_pat_|token|secret|password|private key)"
```

## Publishing on GitHub

1. Review each `CONFIG` object and keep safe placeholders if you use `PropertiesService`.
2. Prefer storing real credentials/IDs in `PropertiesService` instead of source files.
3. Ensure MIT license files are present in root and subprojects.
4. Run `npm run release:check` before tagging a release.

## Deployment (GAS + clasp)

- Login once: `npm run clasp:login`
- Configure each project from `.clasp.json.example` to `.clasp.json`
- Push scripts:
  - `npm run deploy:absence`
  - `npm run deploy:slack`

## Tests

The repo uses npm workspaces:

- `google-calendar-absence-sync`
- `slack-calendar-status-sync`

Run all tests:

```bash
npm test
```

Run per workspace:

```bash
npm run test:absence
npm run test:slack
```

Quality and CI checks:

```bash
npm run lint
npm run format:check
npm run test:coverage
npm run scan:secrets
npm run release:check
```

## Ops Docs

- Release checklist: `docs/RELEASE_CHECKLIST.md`
- Operations runbook: `docs/OPERATIONS_RUNBOOK.md`
- Changelog: `CHANGELOG.md`

## License

MIT
