# Quickstart: Slack Calendar Status Sync

## 1. Create Slack App and Token

1. Go to `https://api.slack.com/apps`.
2. Create an app from scratch.
3. Add required user scopes:
   - `users.profile:write`
   - `users.profile:read`
   - `users:write`
   - `users:read`
   - `dnd:write`
   - `dnd:read`
4. Install the app to your workspace.
5. Copy your Slack user token.

## 2. Collect Calendar IDs

From Google Calendar settings, copy IDs for:

- holiday calendar
- status calendar
- meeting calendar

## 3. Deploy Script

1. Open `https://script.google.com`.
2. Create a project.
3. Paste `slack_calendar_status_sync.gs`.
4. Fill `CONFIG` calendar IDs.
5. Store credentials/config in `PropertiesService`:

```javascript
const props = PropertiesService.getScriptProperties();
props.setProperty("HOLIDAY_CAL_ID", "holiday@group.calendar.google.com");
props.setProperty("STATUS_CAL_ID", "status@group.calendar.google.com");
props.setProperty("MEETING_CAL_ID", "meeting@group.calendar.google.com");
props.setProperty("FALLBACK_CAL_ID", "fallback@group.calendar.google.com"); // optional
props.setProperty("SLACK_USER_TOKEN", "YOUR_SLACK_USER_TOKEN");
props.setProperty("ERROR_ALERT_WEBHOOK_URL", "https://example.test/hook"); // optional
props.setProperty("ERROR_ALERT_EMAIL", "ops@example.test"); // optional
```

## 4. Authorize and Run

1. Run `syncSlackFromCalendars` once manually.
2. Grant requested permissions.
3. Verify logs and Slack status changes.

## 5. Add Trigger

Create a time-driven trigger for `syncSlackFromCalendars` (every 1-5 minutes).

## 6. Optional Testing

- Enable `DRY_RUN: true` for safe dry-run execution.
- Run `planSlackFromCalendars()` to inspect decisions without applying changes.

## 7. Troubleshooting

- Invalid token: regenerate and re-store token.
- No updates: check manual override and calendar access.
- Trigger not firing: confirm trigger is enabled and function name is correct.
