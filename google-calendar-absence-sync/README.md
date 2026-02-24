# Google Calendar Absence Sync

Automatically syncs absence events (vacation/sick leave/etc.) for one person from a team calendar to a personal calendar as Out of Office events.

## Architecture

- App layer: `syncAbsences`, `syncAbsencesManual`, `planAbsences`
- Core layer: pure logic in `core/absenceCore.cjs`
- Ports layer: Google Apps Script integrations (`CalendarApp`, `Calendar.Events`, `LockService`)

## Setup

1. Open [Google Apps Script](https://script.google.com).
2. Create or open a project.
3. Copy `google_calendar_absence_sync.gs` into the editor.
4. (Optional) add `appsscript.json` from this folder for reproducible settings.

Configure `CONFIG`:

```javascript
SOURCE_CALENDAR_ID: "team-absences@group.calendar.google.com",
TARGET_CALENDAR_ID: "your-personal-calendar-id@group.calendar.google.com",
PERSON_NAME: "your-full-name"
```

Or store them in `PropertiesService` (recommended for public repos):

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

Enable Advanced Calendar Service (Calendar API v3) if you want native `outOfOffice` events.

## Validation

`validateAbsenceConfig_` runs at startup and fails fast when placeholders or invalid values are detected. Values are resolved from `PropertiesService` first, then `CONFIG`.

## Runtime Modes

- `syncAbsences()` - normal run (with lock and writes)
- `syncAbsencesManual()` - manual trigger path
- `planAbsences()` - plan-only mode, no writes
- `DRY_RUN: true` - logs intended actions, no writes

## Unit Tests

From repository root:

```bash
npm run test:absence
```

## Deployment with clasp

1. Copy `.clasp.json.example` to `.clasp.json`.
2. Fill `scriptId`.
3. Run from repository root:

```bash
npm run deploy:absence
```

## Troubleshooting

- "Source/target calendar not found": verify calendar IDs and sharing permissions.
- No Out of Office type: enable Advanced Calendar Service.
- Duplicates: verify timezone consistency and date matching tolerance.

## Integration

This project is typically used with `slack-calendar-status-sync` as a source for OOO detection.

## License

MIT
