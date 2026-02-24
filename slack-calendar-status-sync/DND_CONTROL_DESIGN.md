# DND Override Design

Status: implemented in `slack_calendar_status_sync.gs`.

## Problem

DND is currently enabled automatically for meetings, OOO events, and status events with `DND_KEYWORDS`.
There is no direct way to disable DND for a specific event.

## Recommended Approach

Use title keywords to explicitly disable DND for selected events.

Example config:

```javascript
NO_DND_KEYWORDS: ["no-dnd", "no notifications", "allow-notifications"];
```

Behavior:

- If any `NO_DND_KEYWORDS` keyword is present, DND is disabled.
- Otherwise, normal DND logic applies.

## Why this approach

- No extra calendar needed.
- Works for meetings, status events, and OOO events.
- Simple operational model for end users.

## Alternative approaches

1. Dedicated no-DND calendar.
2. Description flag (for example `[NO_DND]`).

## Priority rule

`NO_DND_KEYWORDS` must have higher priority than automatic DND triggers.
