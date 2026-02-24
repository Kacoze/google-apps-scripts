const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGasScript } = require("../../test-utils/load-gas-script.cjs");
const core = require("../core/slackCore.cjs");

const { exports: mod, sandbox } = loadGasScript("slack_calendar_status_sync.gs");

function eventMock(startIso, endIso, isAllDay, title) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return {
    getStartTime: function () {
      return start;
    },
    getEndTime: function () {
      return end;
    },
    isAllDayEvent: function () {
      return !!isAllDay;
    },
    getTitle: function () {
      return title || "";
    }
  };
}

test("isWorkDay_ returns false on Sunday for Mon-Fri config", function () {
  const sunday = new Date("2026-03-01T10:00:00Z");
  assert.equal(core.isWorkDay(sunday, [1, 2, 3, 4, 5]), false);
});

test("isWorkDay_ returns true on Monday for Mon-Fri config", function () {
  const monday = new Date("2026-03-02T10:00:00Z");
  assert.equal(core.isWorkDay(monday, [1, 2, 3, 4, 5]), true);
});

test("getCurrentEvent_ prefers timed events over all-day and picks latest start", function () {
  const now = new Date("2026-03-02T10:30:00Z");
  const allDay = eventMock("2026-03-02T00:00:00Z", "2026-03-03T00:00:00Z", true, "All day");
  const timedEarlier = eventMock("2026-03-02T09:00:00Z", "2026-03-02T11:00:00Z", false, "Earlier");
  const timedLater = eventMock("2026-03-02T10:00:00Z", "2026-03-02T12:00:00Z", false, "Later");

  sandbox.CalendarApp.getCalendarById = function () {
    return {
      getEvents: function () {
        return [allDay, timedEarlier, timedLater];
      }
    };
  };

  const selected = mod.getCurrentEvent_("calendar-id", now);
  assert.equal(selected, timedLater);
});

test("parseStatusTitle_ strips emoji and DND keyword from status text", function () {
  const parsed = core.parseStatusTitle(":brain: Focus dnd", ":memo:", ["dnd"]);
  assert.equal(parsed.emoji, ":brain:");
  assert.equal(parsed.text, "Focus");
});

test("parseStatusTitle returns default emoji when none is present", function () {
  const parsed = core.parseStatusTitle("Planning", ":memo:", ["dnd"]);
  assert.equal(parsed.emoji, ":memo:");
  assert.equal(parsed.text, "Planning");
});

test("containsAnyKeyword handles positive and negative cases", function () {
  assert.equal(core.containsAnyKeyword("this is focus time", ["focus"]), true);
  assert.equal(core.containsAnyKeyword("meeting", ["focus"]), false);
});

test("containsAnyKeyword avoids substring false positives", function () {
  assert.equal(core.containsAnyKeyword("candidate", ["dnd"]), false);
  assert.equal(core.containsAnyKeyword("Focus no-dnd", ["no-dnd"]), true);
});

test("nextWorkStart_ jumps to next Monday from Friday after hours", function () {
  const friday = new Date("2026-03-06T18:00:00Z");
  const next = core.nextWorkStart(friday, "09:00", [1, 2, 3, 4, 5]);
  assert.equal(core.isoDow(next), 1);
  assert.equal(next.getHours(), 9);
  assert.equal(next.getMinutes(), 0);
});

test("nextWorkStart returns same day when before start and workday", function () {
  const mondayMorning = new Date("2026-03-02T07:00:00Z");
  const next = core.nextWorkStart(mondayMorning, "09:00", [1, 2, 3, 4, 5]);
  assert.equal(core.isoDow(next), 1);
  assert.equal(next.getHours(), 9);
  assert.equal(next.getMinutes(), 0);
});

test("nextWorkStart works with empty workdays list", function () {
  const now = new Date("2026-03-07T12:00:00Z");
  const next = core.nextWorkStart(now, "09:00", []);
  assert.equal(next.getHours(), 9);
  assert.equal(next.getMinutes(), 0);
});

test("nextWorkStart falls back when workdays contain no valid day", function () {
  const now = new Date("2026-03-07T12:00:00Z");
  const next = core.nextWorkStart(now, "09:00", [9]);
  assert.equal(next.getHours(), 9);
  assert.equal(next.getMinutes(), 0);
});

test("nextWorkStart rejects invalid hour value", function () {
  const now = new Date("2026-03-07T12:00:00Z");
  assert.throws(function () {
    core.nextWorkStart(now, "24:00", [1, 2, 3, 4, 5]);
  }, /Invalid time value/);
});

test("validateSlackConfig_ fails for placeholders and missing token", function () {
  mod.CONFIG.HOLIDAY_CAL_ID = "your-holiday-calendar-id@group.calendar.google.com";
  mod.CONFIG.STATUS_CAL_ID = "your-status-calendar-id@group.calendar.google.com";
  mod.CONFIG.MEETING_CAL_ID = "your-meeting-calendar-id@group.calendar.google.com";
  mod.CONFIG.SLACK_USER_TOKEN = "";
  sandbox.PropertiesService.getScriptProperties = function () {
    return {
      getProperty: function () {
        return "";
      }
    };
  };
  assert.throws(function () {
    mod.validateSlackConfig_();
  }, /Missing or invalid configuration/);
});

test("validateSlackConfig_ fails for out-of-range work days", function () {
  mod.CONFIG.HOLIDAY_CAL_ID = "holiday@group.calendar.google.com";
  mod.CONFIG.STATUS_CAL_ID = "status@group.calendar.google.com";
  mod.CONFIG.MEETING_CAL_ID = "meeting@group.calendar.google.com";
  mod.CONFIG.SLACK_USER_TOKEN = "test-token";
  mod.CONFIG.WORK_DAYS = [0, 1, 2, 3, 4, 5];
  assert.throws(function () {
    mod.validateSlackConfig_();
  }, /Missing or invalid configuration/);
});

test("validateSlackConfig_ fails for invalid hour values", function () {
  mod.CONFIG.HOLIDAY_CAL_ID = "holiday@group.calendar.google.com";
  mod.CONFIG.STATUS_CAL_ID = "status@group.calendar.google.com";
  mod.CONFIG.MEETING_CAL_ID = "meeting@group.calendar.google.com";
  mod.CONFIG.SLACK_USER_TOKEN = "test-token";
  mod.CONFIG.WORK_DAYS = [1, 2, 3, 4, 5];
  mod.CONFIG.WORK_START = "24:00";
  mod.CONFIG.WORK_END = "17:00";
  assert.throws(function () {
    mod.validateSlackConfig_();
  }, /Invalid time value/);
  mod.CONFIG.WORK_START = "09:00";
});

test("validateSlackConfig_ passes when config is complete", function () {
  mod.CONFIG.HOLIDAY_CAL_ID = "holiday@group.calendar.google.com";
  mod.CONFIG.STATUS_CAL_ID = "status@group.calendar.google.com";
  mod.CONFIG.MEETING_CAL_ID = "meeting@group.calendar.google.com";
  mod.CONFIG.WORK_START = "09:00";
  mod.CONFIG.WORK_END = "17:00";
  mod.CONFIG.WORK_DAYS = [1, 2, 3, 4, 5];
  mod.CONFIG.SLACK_USER_TOKEN = "test-token";
  assert.doesNotThrow(function () {
    mod.validateSlackConfig_();
  });
});

test("validateSlackConfig_ accepts PropertiesService overrides", function () {
  const originalGetScriptProperties = sandbox.PropertiesService.getScriptProperties;
  sandbox.PropertiesService.getScriptProperties = function () {
    return {
      getProperty: function (key) {
        const map = {
          HOLIDAY_CAL_ID: "holiday@group.calendar.google.com",
          STATUS_CAL_ID: "status@group.calendar.google.com",
          MEETING_CAL_ID: "meeting@group.calendar.google.com",
          SLACK_USER_TOKEN: "test-token-from-props"
        };
        return map[key] || "";
      }
    };
  };

  try {
    mod.CONFIG.HOLIDAY_CAL_ID = "your-holiday-calendar-id@group.calendar.google.com";
    mod.CONFIG.STATUS_CAL_ID = "your-status-calendar-id@group.calendar.google.com";
    mod.CONFIG.MEETING_CAL_ID = "your-meeting-calendar-id@group.calendar.google.com";
    mod.CONFIG.SLACK_USER_TOKEN = "";
    assert.doesNotThrow(function () {
      mod.validateSlackConfig_();
    });
  } finally {
    sandbox.PropertiesService.getScriptProperties = originalGetScriptProperties;
  }
});

test("getConfigString_ prefers PropertiesService over CONFIG", function () {
  const originalGetScriptProperties = sandbox.PropertiesService.getScriptProperties;
  sandbox.PropertiesService.getScriptProperties = function () {
    return {
      getProperty: function (key) {
        if (key === "SLACK_USER_TOKEN") return "test-token-from-props";
        return "";
      }
    };
  };

  try {
    mod.CONFIG.SLACK_USER_TOKEN = "test-token-from-config";
    assert.equal(mod.getConfigString_("SLACK_USER_TOKEN"), "test-token-from-props");
  } finally {
    sandbox.PropertiesService.getScriptProperties = originalGetScriptProperties;
  }
});

test("slackApi_ sends Bearer token and retries on 429", function () {
  mod.CONFIG.SLACK_USER_TOKEN = "test-token-contract";
  mod.CONFIG.SLACK_RETRY_MAX_ATTEMPTS = 3;
  mod.CONFIG.SLACK_RETRY_BASE_DELAY_MS = 1;

  const calls = [];
  const sleeps = [];
  let attempt = 0;

  sandbox.Utilities.sleep = function (ms) {
    sleeps.push(ms);
  };
  sandbox.UrlFetchApp.fetch = function (url, options) {
    calls.push({ url, options });
    attempt += 1;
    if (attempt === 1) {
      return {
        getResponseCode: function () {
          return 429;
        },
        getContentText: function () {
          return '{"ok":false,"error":"ratelimited"}';
        },
        getHeaders: function () {
          return { "Retry-After": "1" };
        }
      };
    }
    return {
      getResponseCode: function () {
        return 200;
      },
      getContentText: function () {
        return '{"ok":true,"value":1}';
      },
      getHeaders: function () {
        return {};
      }
    };
  };

  const resp = mod.slackApi_("users.getPresence", {});
  assert.equal(resp.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-token-contract");
  assert.equal(sleeps[0], 1000);
});

test("buildSlackActionPlan_ prioritizes NO_DND_KEYWORDS over DND_KEYWORDS", function () {
  const now = new Date("2026-03-02T10:00:00Z");
  const end = new Date("2026-03-02T11:00:00Z");
  const context = {
    now: now,
    currentProfile: {},
    holidayEvent: null,
    meetingEvent: null,
    fallbackEvent: null,
    statusEvent: eventMock(now.toISOString(), end.toISOString(), false, "Focus dnd no-dnd"),
    isWorkDay: true,
    inWorkHours: true
  };

  const plan = mod.buildSlackActionPlan_(context);
  assert.equal(plan.reason, "status_calendar");
  assert.equal(plan.dndMinutes, null);
  assert.equal(plan.endDnd, true);
});

test("buildSlackActionPlan_ uses fallback calendar when no primary events", function () {
  const now = new Date("2026-03-02T10:00:00Z");
  const end = new Date("2026-03-02T12:00:00Z");
  const context = {
    now: now,
    currentProfile: {},
    holidayEvent: null,
    meetingEvent: null,
    fallbackEvent: eventMock(now.toISOString(), end.toISOString(), false, ":memo: Deep work"),
    statusEvent: null,
    isWorkDay: true,
    inWorkHours: true
  };

  const plan = mod.buildSlackActionPlan_(context);
  assert.equal(plan.reason, "fallback_calendar");
  assert.equal(plan.status.text, "Deep work");
  assert.equal(plan.status.emoji, ":memo:");
});

test("notifyRunErrors_ sends webhook and email when configured", function () {
  const originalGetScriptProperties = sandbox.PropertiesService.getScriptProperties;
  sandbox.PropertiesService.getScriptProperties = function () {
    return {
      getProperty: function (key) {
        const map = {
          ERROR_ALERT_WEBHOOK_URL: "https://example.test/hook",
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
      scope: "slack-status-sync",
      runId: "run-1",
      metrics: { errors: 2, skipped: 0, statusChanges: 1, presenceChanges: 0, dndChanges: 0 }
    });
  } finally {
    sandbox.PropertiesService.getScriptProperties = originalGetScriptProperties;
  }

  assert.equal(webhookCalls.length, 1);
  assert.equal(webhookCalls[0].url, "https://example.test/hook");
  assert.equal(emailCalls.length, 1);
  assert.equal(emailCalls[0].to, "ops@example.test");
});

test("syncSlackFromCalendars reports preflight errors via alert path", function () {
  mod.CONFIG.HOLIDAY_CAL_ID = "your-holiday-calendar-id@group.calendar.google.com";
  mod.CONFIG.STATUS_CAL_ID = "status@group.calendar.google.com";
  mod.CONFIG.MEETING_CAL_ID = "meeting@group.calendar.google.com";
  mod.CONFIG.SLACK_USER_TOKEN = "test-token";
  mod.CONFIG.WORK_DAYS = [1, 2, 3, 4, 5];
  mod.CONFIG.WORK_START = "09:00";
  mod.CONFIG.WORK_END = "17:00";

  const originalGetScriptProperties = sandbox.PropertiesService.getScriptProperties;
  sandbox.PropertiesService.getScriptProperties = function () {
    return {
      getProperty: function (key) {
        if (key === "ERROR_ALERT_WEBHOOK_URL") return "https://example.test/hook";
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
      mod.syncSlackFromCalendars();
    }, /Missing or invalid configuration/);
  } finally {
    sandbox.PropertiesService.getScriptProperties = originalGetScriptProperties;
  }

  assert.equal(webhookCalls.length, 1);
});
