const fs = require("node:fs");
const path = require("node:path");

const required = [
  "CHANGELOG.md",
  "docs/RELEASE_CHECKLIST.md",
  "docs/OPERATIONS_RUNBOOK.md",
  "google-calendar-absence-sync/appsscript.json",
  "slack-calendar-status-sync/appsscript.json",
  "google-calendar-absence-sync/.clasp.json.example",
  "slack-calendar-status-sync/.clasp.json.example"
];

const missing = required.filter((file) => !fs.existsSync(path.resolve(process.cwd(), file)));

if (missing.length > 0) {
  console.error("Release readiness check failed. Missing files:");
  missing.forEach((file) => console.error(" - " + file));
  process.exit(1);
}

console.log("Release readiness check passed.");
