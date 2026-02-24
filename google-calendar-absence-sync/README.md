# Google Calendar Absence Sync

Automatically syncs absence events (vacation/sick leave/etc.) for one person from a team calendar to a personal calendar as Out of Office events.

## What You Need

- A source calendar with team absences.
- A target calendar where Out of Office events should be created.
- Permission to read source events and write to target calendar.
- Optional: Advanced Calendar Service (`Calendar API v3`) for native `outOfOffice` event type.

## Setup in Google Apps Script

1. Open `https://script.google.com`.
2. Create a project and paste `google_calendar_absence_sync.gs`.
3. Open `Project Settings` and enable:
   - `Show "appsscript.json" manifest file in editor` (optional)
4. Enable Advanced Calendar Service (optional but recommended):
   - Editor: `Services` -> add `Calendar API`
   - Google Cloud Console: enable `Calendar API`

Configure `CONFIG`:

```javascript
SOURCE_CALENDAR_ID: "team-absences@group.calendar.google.com",
TARGET_CALENDAR_ID: "your-personal-calendar-id@group.calendar.google.com",
PERSON_NAME: "your-full-name"
```

Recommended: store values in `PropertiesService`:

```javascript
const props = PropertiesService.getScriptProperties();
props.setProperty("SOURCE_CALENDAR_ID", "team-absences@group.calendar.google.com");
props.setProperty("TARGET_CALENDAR_ID", "your-personal-calendar-id@group.calendar.google.com");
props.setProperty("PERSON_NAME", "your-full-name");
```

Optional error alerts:

```javascript
props.setProperty("ERROR_ALERT_WEBHOOK_URL", "https://example.test/hook");
props.setProperty("ERROR_ALERT_EMAIL", "ops@example.test");
```

## Run Modes

- `syncAbsences()` - normal run (with lock and writes)
- `syncAbsencesManual()` - manual trigger path
- `planAbsences()` - plan-only mode, no writes
- `DRY_RUN: true` - logs intended actions, no writes

## Recommended Trigger

- Create a time-driven trigger for `syncAbsences()`:
  - every 15 minutes, every 30 minutes, or hourly (based on your team needs)

## Troubleshooting

- `Source/target calendar not found`:
  verify calendar IDs and sharing permissions.
- Events are created without native OOO type:
  enable Advanced Calendar Service and Cloud Calendar API.
- Duplicate-looking entries:
  verify timezone consistency and source title conventions.
- Script fails at startup:
  check required properties (`SOURCE_CALENDAR_ID`, `TARGET_CALENDAR_ID`, `PERSON_NAME`).

## Integration

This project is typically used with `slack-calendar-status-sync` as a source for OOO detection.

## License

MIT
