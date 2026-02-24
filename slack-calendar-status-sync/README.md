# Slack Calendar Status Sync

Automatically updates Slack status, presence, and DND based on Google Calendar.

## Architecture

- App layer: `syncSlackFromCalendars`, `planSlackFromCalendars`, `executeSlackPlan_`
- Core layer: pure logic in `core/slackCore.cjs`
- Ports layer: GAS and Slack API integrations (`CalendarApp`, `UrlFetchApp`, `PropertiesService`)

## Priority Order

1. Manual override (emoji outside `SAFE_EMOJIS`)
2. Holiday calendar all-day events
3. Out of Office meeting events
4. Regular meeting events
5. Status calendar events
6. Fallback calendar events (`FALLBACK_CAL_ID`, optional)
7. Work schedule fallback

## Setup

1. Open [Google Apps Script](https://script.google.com).
2. Create a project and paste `slack_calendar_status_sync.gs`.
3. Configure calendar IDs in `CONFIG` (or use `PropertiesService` overrides).
4. Configure Slack token in `PropertiesService` (recommended).

Recommended `PropertiesService` keys:

- `HOLIDAY_CAL_ID`
- `STATUS_CAL_ID`
- `MEETING_CAL_ID`
- `FALLBACK_CAL_ID` (optional)
- `SLACK_USER_TOKEN`
- `ERROR_ALERT_WEBHOOK_URL` (optional)
- `ERROR_ALERT_EMAIL` (optional)

DND controls:

- `DND_KEYWORDS` enable DND.
- `NO_DND_KEYWORDS` disable DND and have higher priority than `DND_KEYWORDS`.

Required Slack scopes include:

- `users.profile:write`
- `users.profile:read`
- `users:write`
- `users:read`
- `dnd:write`
- `dnd:read`

## Validation

`validateSlackConfig_` runs at startup and fails fast on missing/invalid config. Values are resolved from `PropertiesService` first, then `CONFIG`.

## Runtime Modes

- `syncSlackFromCalendars()` - normal run
- `planSlackFromCalendars()` - decision plan only
- `DRY_RUN: true` - no state-changing API calls

## Logging and Metrics

Logs are structured JSON with `scope`, `runId`, `event`, and run metrics.

## Unit Tests

From repository root:

```bash
npm run test:slack
```

## Deployment with clasp

1. Copy `.clasp.json.example` to `.clasp.json`.
2. Fill `scriptId`.
3. Run from repository root:

```bash
npm run deploy:slack
```

## Troubleshooting

- Missing calendar: verify ID and sharing permissions.
- `invalid_auth`: rotate token and verify scopes.
- No updates: check `DRY_RUN`, manual override, and execution logs.

## License

MIT
