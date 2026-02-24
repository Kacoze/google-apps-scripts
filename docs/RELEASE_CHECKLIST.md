# Release Checklist

1. Update versions and changelog

- Confirm `package.json` version is correct.
- Add an entry to `CHANGELOG.md`.

2. Validate quality gates

- Run `npm run lint`.
- Run `npm run format:check`.
- Run `npm run test:coverage`.
- Run `npm run scan:secrets`.

3. Validate deployment assets

- Verify both `appsscript.json` files are present.
- Verify both `.clasp.json.example` files are up to date.
- Confirm script property keys are documented in README files.

4. Manual smoke checks

- Run `planAbsences()` in GAS and validate plan output.
- Run `planSlackFromCalendars()` in GAS and validate decision branch.
- Verify no unexpected writes in `DRY_RUN` mode.

5. Tag and publish

- Create a release tag (for example `v1.1.0`).
- Publish release notes based on `CHANGELOG.md`.
