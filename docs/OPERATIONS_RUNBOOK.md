# Operations Runbook

## Daily Monitoring

1. Check Apps Script execution logs for both projects.
2. Watch `run.metrics.errors` values.
3. Investigate any repeated retries or lock contention.

## Error Alerting

Both projects support optional alerting:

- `ERROR_ALERT_WEBHOOK_URL` (JSON POST payload)
- `ERROR_ALERT_EMAIL` (email subject + payload text)

Set values via `PropertiesService` to avoid committing sensitive endpoints.

## Token Rotation

1. Generate a new Slack user token with required scopes.
2. Update `SLACK_USER_TOKEN` in script properties.
3. Run `planSlackFromCalendars()` and then one manual `syncSlackFromCalendars()`.
4. Confirm profile, presence, and DND updates still work.

## Recovery from Failed Runs

1. Enable `DRY_RUN: true`.
2. Run plan/manual functions and inspect branch decisions.
3. Validate calendar IDs and property keys.
4. Re-enable writes (`DRY_RUN: false`) once output is correct.

## Onboarding a New Environment

1. Copy script source to a new Apps Script project.
2. Configure `.clasp.json` from `.clasp.json.example`.
3. Set all required `PropertiesService` keys.
4. Add time-driven trigger(s).
5. Execute manual smoke test before enabling production schedule.
