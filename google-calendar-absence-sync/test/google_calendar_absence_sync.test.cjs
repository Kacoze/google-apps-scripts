const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGasScript } = require("../../test-utils/load-gas-script.cjs");
const core = require("../core/absenceCore.cjs");

const { exports: mod, sandbox } = loadGasScript("google_calendar_absence_sync.gs");

test("syncAbsencesManual delegates to syncAbsences (shared lock path)", function () {
  let called = 0;
  sandbox.syncAbsences = function () {
    called += 1;
  };
  sandbox.syncAbsencesManual();
  assert.equal(called, 1);
});

test("removeNameFromTitle_ escapes regex characters in PERSON_NAME", function () {
  const title = "Jan (QA)+ Kowalski - vacation";
  const person = "Jan (QA)+ Kowalski";
  const result = core.removeNameFromTitle(title, person, true);
  assert.equal(result, "vacation");
});

test("removeNameFromTitle_ removes name from suffix form", function () {
  const title = "vacation - Jan Kowalski";
  const person = "Jan Kowalski";
  const result = core.removeNameFromTitle(title, person, true);
  assert.equal(result, "vacation");
});

test("isEventForPerson matches case-insensitively", function () {
  assert.equal(core.isEventForPerson("ANNA nowak - vacation", "Anna Nowak"), true);
});

test("removeNameFromTitle returns original when feature disabled", function () {
  const title = "Jan Kowalski - vacation";
  assert.equal(core.removeNameFromTitle(title, "Jan Kowalski", false), title);
});

test("removeNameFromTitle falls back to original when cleanup produces empty", function () {
  const title = "Jan Kowalski";
  assert.equal(core.removeNameFromTitle(title, "Jan Kowalski", true), title);
});

test("isEventForPerson returns false for non-matching title", function () {
  assert.equal(core.isEventForPerson("Someone else's vacation", "Anna Nowak"), false);
});

test("core helpers handle empty inputs", function () {
  assert.equal(core.escapeRegex(undefined), "");
  assert.equal(core.removeNameFromTitle(undefined, "Anna Nowak", true), "");
  assert.equal(core.isEventForPerson(undefined, undefined), true);
});

test("validateAbsenceConfig_ fails for placeholder defaults", function () {
  assert.throws(function () {
    mod.validateAbsenceConfig_();
  }, /Missing or invalid configuration/);
});

test("validateAbsenceConfig_ accepts PropertiesService overrides", function () {
  const originalGetScriptProperties = sandbox.PropertiesService.getScriptProperties;
  sandbox.PropertiesService.getScriptProperties = function () {
    return {
      getProperty: function (key) {
        const map = {
          SOURCE_CALENDAR_ID: "team@group.calendar.google.com",
          TARGET_CALENDAR_ID: "personal@group.calendar.google.com",
          PERSON_NAME: "Anna Nowak"
        };
        return map[key] || "";
      }
    };
  };

  try {
    mod.CONFIG.SOURCE_CALENDAR_ID = "your-team-absences-calendar-id@group.calendar.google.com";
    mod.CONFIG.TARGET_CALENDAR_ID = "your-personal-calendar-id@group.calendar.google.com";
    mod.CONFIG.PERSON_NAME = "your-full-name";
    assert.doesNotThrow(function () {
      mod.validateAbsenceConfig_();
    });
  } finally {
    sandbox.PropertiesService.getScriptProperties = originalGetScriptProperties;
  }
});

test("validateAbsenceConfig_ accepts configured values", function () {
  mod.CONFIG.SOURCE_CALENDAR_ID = "team@group.calendar.google.com";
  mod.CONFIG.TARGET_CALENDAR_ID = "personal@group.calendar.google.com";
  mod.CONFIG.PERSON_NAME = "Anna Nowak";
  assert.doesNotThrow(function () {
    mod.validateAbsenceConfig_();
  });
});

test("buildAbsenceSyncPlan_ creates create_ooo action for missing target event", function () {
  mod.CONFIG.SOURCE_CALENDAR_ID = "team@group.calendar.google.com";
  mod.CONFIG.TARGET_CALENDAR_ID = "personal@group.calendar.google.com";
  mod.CONFIG.PERSON_NAME = "Anna Nowak";

  const sourceEvent = {
    getTitle: function () {
      return "Anna Nowak - vacation";
    },
    getStartTime: function () {
      return new Date("2026-03-03T00:00:00Z");
    },
    getEndTime: function () {
      return new Date("2026-03-04T00:00:00Z");
    }
  };

  sandbox.CalendarApp.getCalendarById = function (id) {
    if (id === "team@group.calendar.google.com") {
      return {
        getEvents: function () {
          return [sourceEvent];
        }
      };
    }
    return {
      getEvents: function () {
        return [];
      }
    };
  };

  const plan = mod.buildAbsenceSyncPlan_(new Date("2026-03-01T00:00:00Z"));
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].type, "create_ooo");
});

test("createOutOfOfficeEvent_ uses Calendar API insert when enabled", function () {
  mod.CONFIG.USE_ADVANCED_CALENDAR = true;
  let inserted = null;
  sandbox.Calendar.Events.insert = function (resource, calId) {
    inserted = { resource, calId };
  };
  sandbox.CalendarApp.getCalendarById = function () {
    return {
      createEvent: function () {
        throw new Error("should not use CalendarApp");
      },
      createAllDayEvent: function () {
        throw new Error("should not use CalendarApp");
      }
    };
  };

  const sourceEvent = {
    getTitle: function () {
      return "Anna Nowak - vacation";
    },
    getStartTime: function () {
      return new Date("2026-03-03T10:00:00Z");
    },
    getEndTime: function () {
      return new Date("2026-03-03T12:00:00Z");
    },
    getDescription: function () {
      return "";
    },
    isAllDayEvent: function () {
      return false;
    }
  };

  mod.createOutOfOfficeEvent_("personal@group.calendar.google.com", sourceEvent, "Anna Nowak");
  assert.equal(inserted.calId, "personal@group.calendar.google.com");
  assert.equal(inserted.resource.eventType, "outOfOffice");
});

test("notifyRunErrors_ sends webhook and email when configured", function () {
  const originalGetScriptProperties = sandbox.PropertiesService.getScriptProperties;
  sandbox.PropertiesService.getScriptProperties = function () {
    return {
      getProperty: function (key) {
        const map = {
          ERROR_ALERT_WEBHOOK_URL: "https://example.test/absence-hook",
          ERROR_ALERT_EMAIL: "ops@example.test"
        };
        return map[key] || "";
      }
    };
  };

  const webhookCalls = [];
  const emailCalls = [];
  sandbox.UrlFetchApp.fetch = function (url, opts) {
    webhookCalls.push({ url: url, opts: opts });
    return {
      getResponseCode: function () {
        return 200;
      },
      getContentText: function () {
        return '{"ok":true}';
      },
      getHeaders: function () {
        return {};
      }
    };
  };
  sandbox.MailApp.sendEmail = function (to, subject, body) {
    emailCalls.push({ to: to, subject: subject, body: body });
  };

  try {
    mod.notifyRunErrors_({
      scope: "absence-sync",
      runId: "run-2",
      metrics: { errors: 1, created: 0, skipped: 0 }
    });
  } finally {
    sandbox.PropertiesService.getScriptProperties = originalGetScriptProperties;
  }

  assert.equal(webhookCalls.length, 1);
  assert.equal(webhookCalls[0].url, "https://example.test/absence-hook");
  assert.equal(emailCalls.length, 1);
  assert.equal(emailCalls[0].to, "ops@example.test");
});

test("syncAbsences reports preflight errors via alert path", function () {
  mod.CONFIG.SOURCE_CALENDAR_ID = "your-team-absences-calendar-id@group.calendar.google.com";
  mod.CONFIG.TARGET_CALENDAR_ID = "personal@group.calendar.google.com";
  mod.CONFIG.PERSON_NAME = "Anna Nowak";

  const originalGetScriptProperties = sandbox.PropertiesService.getScriptProperties;
  sandbox.PropertiesService.getScriptProperties = function () {
    return {
      getProperty: function (key) {
        if (key === "ERROR_ALERT_WEBHOOK_URL") return "https://example.test/absence-hook";
        return "";
      }
    };
  };

  const webhookCalls = [];
  sandbox.UrlFetchApp.fetch = function (url) {
    webhookCalls.push(url);
    return {
      getResponseCode: function () {
        return 200;
      },
      getContentText: function () {
        return '{"ok":true}';
      },
      getHeaders: function () {
        return {};
      }
    };
  };

  try {
    assert.throws(function () {
      mod.syncAbsences();
    }, /Missing or invalid configuration/);
  } finally {
    sandbox.PropertiesService.getScriptProperties = originalGetScriptProperties;
  }

  assert.equal(webhookCalls.length, 1);
});
