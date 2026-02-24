# Slack Calendar Status Sync

Automatically updates Slack status, presence, and DND based on Google Calendar.

## How It Decides Status (Priority Order)

1. Manual override (emoji outside `SAFE_EMOJIS`)
2. Holiday calendar all-day events
3. Out of Office meeting events
4. Regular meeting events
5. Status calendar events
6. Fallback calendar events (`FALLBACK_CAL_ID`, optional)
7. Work schedule fallback

## What You Need

- Slack app with user token and required scopes.
- Calendar IDs for holiday/status/meeting (and optional fallback).
- Google Apps Script project with permission to read calendars and call external APIs.

## Setup in Google Apps Script

1. Open `https://script.google.com`.
2. Create a project and paste `slack_calendar_status_sync.gs`.
3. Configure values in `PropertiesService` (recommended).

Recommended `PropertiesService` keys:

- `HOLIDAY_CAL_ID`
- `STATUS_CAL_ID`
- `MEETING_CAL_ID`
- `FALLBACK_CAL_ID` (optional)
- `SLACK_USER_TOKEN`
- `ERROR_ALERT_WEBHOOK_URL` (optional)
- `ERROR_ALERT_EMAIL` (optional)

Required Slack scopes:

- `users.profile:write`
- `users.profile:read`
- `users:write`
- `users:read`
- `dnd:write`
- `dnd:read`

## DND Controls

- `DND_KEYWORDS` enable DND.
- `NO_DND_KEYWORDS` disable DND and have higher priority than `DND_KEYWORDS`.

## Run Modes

- `syncSlackFromCalendars()` - normal run
- `planSlackFromCalendars()` - decision plan only
- `DRY_RUN: true` - no state-changing API calls

## Recommended Trigger

- Create a time-driven trigger for `syncSlackFromCalendars()`:
  - every 1 to 5 minutes (recommended)

## Manual Verification Checklist

1. Run `planSlackFromCalendars()` and inspect the planned branch.
2. Set `DRY_RUN: true` and run `syncSlackFromCalendars()`.
3. Confirm logs match expected behavior.
4. Set `DRY_RUN: false` only after checks pass.

## Troubleshooting

- `invalid_auth`:
  rotate token and confirm Slack scopes.
- No updates:
  check `DRY_RUN`, manual override, and calendar access.
- Wrong branch selected:
  run `planSlackFromCalendars()` and verify current calendar events.
- DND not behaving as expected:
  review `DND_KEYWORDS` and `NO_DND_KEYWORDS` values.

## License

MIT
