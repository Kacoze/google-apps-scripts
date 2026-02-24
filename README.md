# Google Apps Scripts Collection

Production-ready Google Apps Script automations for Google Calendar and Slack.

Automate repetitive team workflows, keep calendars clean, and keep Slack status always up to date.

## Why Use This Repo?

- Save time on manual status updates and calendar maintenance.
- Improve team visibility for absences, meetings, and availability.
- Reduce missed context in Slack with automatic presence and DND handling.
- Start quickly with practical setup guides for real-world usage.

## Keywords

Google Apps Script, Google Calendar automation, Slack status automation, out of office sync, calendar-to-Slack sync, DND automation, productivity workflows.

## Scripts

1. `google-calendar-absence-sync`

- Purpose: sync absence events from a source calendar to a target calendar as Out of Office.
- Best for: HR/team availability visibility and automatic OOO calendar hygiene.
- Full user guide:
  [README.md](/home/kamil/praca/prywatne/google-apps-scripts/google-calendar-absence-sync/README.md)

2. `slack-calendar-status-sync`

- Purpose: update Slack status, presence, and DND from calendar events.
- Best for: automatic Slack status management during meetings, focus time, holidays, and OOO.
- Full user guide:
  [README.md](/home/kamil/praca/prywatne/google-apps-scripts/slack-calendar-status-sync/README.md)
- Quickstart:
  [QUICKSTART.md](/home/kamil/praca/prywatne/google-apps-scripts/slack-calendar-status-sync/QUICKSTART.md)

## General Setup (Applies to Both)

1. Open `https://script.google.com`.
2. Create a project and paste script code.
3. Store real configuration values in `PropertiesService`.
4. Run once manually to authorize access.
5. Add a time-driven trigger.

For exact required keys, function names, and run modes, use script-specific README files above.

## Security

- Do not store production secrets in source code.
- Use `PropertiesService` for IDs/tokens.
- Do not commit `.env`, `.clasp.json`, `.clasprc.json`, or credential files.

## Use Cases

- Automatic Out of Office synchronization from team calendar to personal calendar.
- Real-time Slack status and DND updates based on current calendar events.
- Consistent availability signals across Google Calendar and Slack.

## License

MIT
