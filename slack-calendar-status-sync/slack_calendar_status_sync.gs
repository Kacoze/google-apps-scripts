/**
 * Slack Calendar Status Sync — Google Apps Script
 * SPDX-License-Identifier: MIT
 * Automates Slack status, presence, and DND based on Google Calendar.
 * 
 * Required permissions:
 * - Calendar (calendar reads)
 * - UrlFetch (Slack API calls)
 * - LockService (prevent concurrent run conflicts)
 * - PropertiesService (optional, for secure config/token storage)
 * 
 * IMPORTANT: To detect "Out of Office" by event type
 * (not only title keywords), enable Advanced Calendar Service:
 * 1. In the GAS editor: Resources > Advanced Google Services
 * 2. Enable "Calendar API v3"
 * 3. Also enable it in Google Cloud Console (editor link)
 * 
 * Without Advanced Calendar Service the script falls back to title keywords
 * in event titles for OOO detection.
 */

const CONFIG = {
  // 1) Slack token
  // NOTE: You can store token in PropertiesService using:
  // PropertiesService.getScriptProperties().setProperty('SLACK_USER_TOKEN', 'YOUR_SLACK_USER_TOKEN');
  // Then keep SLACK_USER_TOKEN empty below.
  SLACK_USER_TOKEN: "", // Keep empty and store token in PropertiesService (recommended)

  // 2) Calendar IDs (can be overridden by PropertiesService keys with same names)
  HOLIDAY_CAL_ID: "your-holiday-calendar-id@group.calendar.google.com",
  STATUS_CAL_ID: "your-status-calendar-id@group.calendar.google.com",
  MEETING_CAL_ID: "your-meeting-calendar-id@group.calendar.google.com",
  FALLBACK_CAL_ID: "", // Optional calendar for fallback status events

  // 3) Work hours (script local timezone)
  WORK_START: "06:00",
  WORK_END: "14:00",
  // Working days (1=Monday ... 7=Sunday)
  WORK_DAYS: [1, 2, 3, 4, 5],

  // 4) SAFE_EMOJIS - emojis treated as managed by script (manual override otherwise)
  SAFE_EMOJIS: [":calendar:", ":house:", ":office:", ":memo:", ":holiday:", ":octagonal_sign:", ":hamburger:"],

  // Default emoji when status title has none
  DEFAULT_STATUS_EMOJI: ":memo:",

  // Static status values
  HOLIDAY_STATUS_TEXT: "Holiday",
  HOLIDAY_STATUS_EMOJI: ":holiday:",
  MEETING_STATUS_TEXT: "In a meeting",
  MEETING_STATUS_EMOJI: ":calendar:",

  // Status title keywords that force DND
  DND_KEYWORDS: ["dnd"],
  // Status title keywords that explicitly disable DND (higher priority)
  NO_DND_KEYWORDS: ["no-dnd", "no notifications", "allow-notifications"],

  // Event title keywords treated as Out of Office
  OOO_KEYWORDS: ["out of office", "ooo", "vacation", "sick", "leave", "absence"],

  // Diagnostic mode (no writes, logs only)
  DRY_RUN: false,

  // Retry configuration for Slack API
  SLACK_RETRY_MAX_ATTEMPTS: 3,
  SLACK_RETRY_BASE_DELAY_MS: 1000,

  // Optional error notifications
  ERROR_ALERT_WEBHOOK_URL: "",
  ERROR_ALERT_EMAIL: ""
};

function getScriptProperty_(key) {
  try {
    const props = PropertiesService.getScriptProperties();
    if (!props || !props.getProperty) return "";
    return String(props.getProperty(key) || "").trim();
  } catch (e) {
    return "";
  }
}

function getConfigString_(key) {
  const fromProps = getScriptProperty_(key);
  if (fromProps) return fromProps;
  return String(CONFIG[key] || "").trim();
}

/**
 * Main function for a time-driven trigger (for example every 1–5 minutes).
 */
function syncSlackFromCalendars() {
  const now = new Date();
  const run = createRunContext_("slack-status-sync");
  logEvent_(run, "INFO", "run_start", { dryRun: CONFIG.DRY_RUN });
  let lock = null;
  let lockAcquired = false;

  try {
    validateSlackConfig_();

    // Locking: prevents concurrent runs
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) { // 10-second timeout
      run.metrics.skipped++;
      logEvent_(run, "WARN", "lock_busy", {});
      return;
    }
    lockAcquired = true;
    _syncSlackFromCalendarsImpl(now, run);
  } catch (e) {
    run.metrics.errors++;
    logEvent_(run, "ERROR", "run_error", { error: String(e) });
    throw e;
  } finally {
    if (lockAcquired && lock) {
      lock.releaseLock();
    }
    logEvent_(run, "INFO", "run_end", run.metrics);
    notifyRunErrors_(run);
  }
}

function planSlackFromCalendars() {
  const now = new Date();
  validateSlackConfig_();
  const context = buildSlackSyncContext_(now);
  const plan = buildSlackActionPlan_(context);
  Logger.log(JSON.stringify(plan, null, 2));
  return plan;
}

/**
 * Main synchronization flow.
 */
function _syncSlackFromCalendarsImpl(now, run) {
  const context = buildSlackSyncContext_(now);
  const plan = buildSlackActionPlan_(context);
  logEvent_(run, "INFO", "plan_ready", {
    reason: plan.reason,
    summary: plan.summary
  });

  if (CONFIG.DRY_RUN || plan.skip) {
    run.metrics.skipped++;
    logEvent_(run, "INFO", "dry_run_or_skip", { plan: plan });
    return;
  }

  executeSlackPlan_(plan, context.currentProfile, run);
}

function buildSlackSyncContext_(now) {
  const holidayCalId = getConfigString_("HOLIDAY_CAL_ID");
  const meetingCalId = getConfigString_("MEETING_CAL_ID");
  const statusCalId = getConfigString_("STATUS_CAL_ID");
  const fallbackCalId = getConfigString_("FALLBACK_CAL_ID");
  let currentProfile;
  try {
    currentProfile = slackGetProfile_();
  } catch (e) {
    Logger.log("Failed to fetch profile (manual override check): " + e.toString());
    currentProfile = {};
  }

  const holidayEvent = getTodayAllDayHolidayEvent_(holidayCalId, now);
  const meetingEvent = getCurrentEvent_(meetingCalId, now);
  const statusEvent = getCurrentEvent_(statusCalId, now);
  const fallbackEvent = fallbackCalId ? getCurrentEvent_(fallbackCalId, now) : null;
  const isWorkDay = isWorkDay_(now, CONFIG.WORK_DAYS);
  const inWorkHours = isWithinWorkHours_(now, CONFIG.WORK_START, CONFIG.WORK_END);

  return {
    now: now,
    currentProfile: currentProfile,
    holidayEvent: holidayEvent,
    meetingEvent: meetingEvent,
    meetingCalId: meetingCalId,
    statusEvent: statusEvent,
    fallbackEvent: fallbackEvent,
    isWorkDay: isWorkDay,
    inWorkHours: inWorkHours
  };
}

function buildSlackActionPlan_(context) {
  const now = context.now;
  const currentEmoji = (context.currentProfile.status_emoji || "").trim();

  if (currentEmoji && !CONFIG.SAFE_EMOJIS.includes(currentEmoji)) {
    return {
      reason: "manual_override",
      skip: true,
      summary: "Manual override detected"
    };
  }

  if (context.holidayEvent) {
    const nextMidnight = nextMidnight_(now);
    return {
      reason: "holiday",
      skip: false,
      status: {
        text: CONFIG.HOLIDAY_STATUS_TEXT,
        emoji: CONFIG.HOLIDAY_STATUS_EMOJI,
        expirationEpochSec: epochSeconds_(nextMidnight)
      },
      presence: "away",
      dndMinutes: minutesUntilNextMidnight_(now),
      endDnd: false,
      clearStatus: false,
      summary: "Holiday event active"
    };
  }

  if (context.meetingEvent) {
    const meetingTitle = context.meetingEvent.getTitle() || "";
    const endTime = context.meetingEvent.getEndTime();
    const mins = minutesUntil_(now, endTime);
    const disableDnd = containsAnyKeyword_(meetingTitle, CONFIG.NO_DND_KEYWORDS);
    if (isOutOfOfficeEvent_(context.meetingEvent, meetingTitle, context.meetingCalId)) {
      const parsed = parseStatusTitle_(meetingTitle, CONFIG.DEFAULT_STATUS_EMOJI);
      return {
        reason: "meeting_ooo",
        skip: false,
        status: {
          text: addDateRangeToStatus_(parsed.text, context.meetingEvent.getStartTime(), endTime),
          emoji: parsed.emoji,
          expirationEpochSec: epochSeconds_(endTime)
        },
        presence: "away",
        dndMinutes: disableDnd ? null : mins,
        endDnd: disableDnd,
        clearStatus: false,
        summary: "Out-of-office meeting active"
      };
    }

    return {
      reason: "meeting",
      skip: false,
      status: {
        text: CONFIG.MEETING_STATUS_TEXT,
        emoji: CONFIG.MEETING_STATUS_EMOJI,
        expirationEpochSec: epochSeconds_(endTime)
      },
      presence: "auto",
      dndMinutes: disableDnd ? null : mins,
      endDnd: disableDnd,
      clearStatus: false,
      summary: "Regular meeting active"
    };
  }

  if (context.statusEvent) {
    const title = context.statusEvent.getTitle() || "";
    const parsed = parseStatusTitle_(title, CONFIG.DEFAULT_STATUS_EMOJI);
    const mins = minutesUntil_(now, context.statusEvent.getEndTime());
    const disableDnd = containsAnyKeyword_(title, CONFIG.NO_DND_KEYWORDS);
    const needsDnd = containsAnyKeyword_(title, CONFIG.DND_KEYWORDS);
    return {
      reason: "status_calendar",
      skip: false,
      status: {
        text: parsed.text,
        emoji: parsed.emoji,
        expirationEpochSec: epochSeconds_(context.statusEvent.getEndTime())
      },
      presence: "auto",
      dndMinutes: !disableDnd && needsDnd ? mins : null,
      endDnd: disableDnd || !needsDnd,
      clearStatus: false,
      summary: "Status calendar event active"
    };
  }

  if (context.fallbackEvent) {
    const title = context.fallbackEvent.getTitle() || "";
    const parsed = parseStatusTitle_(title, CONFIG.DEFAULT_STATUS_EMOJI);
    const mins = minutesUntil_(now, context.fallbackEvent.getEndTime());
    const disableDnd = containsAnyKeyword_(title, CONFIG.NO_DND_KEYWORDS);
    const needsDnd = containsAnyKeyword_(title, CONFIG.DND_KEYWORDS);
    return {
      reason: "fallback_calendar",
      skip: false,
      status: {
        text: parsed.text,
        emoji: parsed.emoji,
        expirationEpochSec: epochSeconds_(context.fallbackEvent.getEndTime())
      },
      presence: "auto",
      dndMinutes: !disableDnd && needsDnd ? mins : null,
      endDnd: disableDnd || !needsDnd,
      clearStatus: false,
      summary: "Fallback calendar event active"
    };
  }

  if (context.isWorkDay && context.inWorkHours) {
    return {
      reason: "work_hours",
      skip: false,
      status: null,
      presence: "auto",
      dndMinutes: null,
      endDnd: true,
      clearStatus: true,
      summary: "Within configured work hours"
    };
  }

  const nextStart = nextWorkStart_(now, CONFIG.WORK_START, CONFIG.WORK_DAYS);
  return {
    reason: "outside_work_hours",
    skip: false,
    status: null,
    presence: "away",
    dndMinutes: minutesUntil_(now, nextStart),
    endDnd: false,
    clearStatus: true,
    summary: "Outside configured work hours"
  };
}

function executeSlackPlan_(plan, currentProfile, run) {
  if (plan.clearStatus) {
    if (slackClearStatus_(currentProfile)) run.metrics.statusChanges++;
  } else if (plan.status) {
    if (slackSetStatus_(plan.status, currentProfile)) run.metrics.statusChanges++;
  }

  if (plan.presence && slackSetPresence_(plan.presence)) {
    run.metrics.presenceChanges++;
  }

  if (plan.dndMinutes != null) {
    if (slackSetDndSnoozeMinutes_(plan.dndMinutes)) run.metrics.dndChanges++;
  } else if (plan.endDnd) {
    if (slackEndDnd_()) run.metrics.dndChanges++;
  }
}

function validateSlackConfig_() {
  const holidayCalId = getConfigString_("HOLIDAY_CAL_ID");
  const statusCalId = getConfigString_("STATUS_CAL_ID");
  const meetingCalId = getConfigString_("MEETING_CAL_ID");
  const errors = [];
  if (!holidayCalId || holidayCalId.indexOf("your-") === 0) errors.push("HOLIDAY_CAL_ID");
  if (!statusCalId || statusCalId.indexOf("your-") === 0) errors.push("STATUS_CAL_ID");
  if (!meetingCalId || meetingCalId.indexOf("your-") === 0) errors.push("MEETING_CAL_ID");

  parseHm_(CONFIG.WORK_START);
  parseHm_(CONFIG.WORK_END);

  if (!Array.isArray(CONFIG.WORK_DAYS) || CONFIG.WORK_DAYS.length === 0) {
    errors.push("WORK_DAYS");
  } else {
    const invalidWorkDay = CONFIG.WORK_DAYS.some(function (d) {
      return !Number.isInteger(d) || d < 1 || d > 7;
    });
    if (invalidWorkDay) {
      errors.push("WORK_DAYS");
    }
  }

  if (!getSlackToken_()) errors.push("SLACK_USER_TOKEN");

  if (errors.length > 0) {
    throw new Error("Missing or invalid configuration: " + errors.join(", "));
  }
}

function notifyRunErrors_(run) {
  if (!run || !run.metrics || run.metrics.errors <= 0) return;

  const webhookUrl = getConfigString_("ERROR_ALERT_WEBHOOK_URL");
  const email = getConfigString_("ERROR_ALERT_EMAIL");
  const payload = {
    scope: run.scope,
    runId: run.runId,
    errors: run.metrics.errors,
    metrics: run.metrics,
    timestamp: new Date().toISOString()
  };
  const message = "Slack sync run reported errors: " + JSON.stringify(payload);

  if (webhookUrl) {
    try {
      UrlFetchApp.fetch(webhookUrl, {
        method: "post",
        contentType: "application/json; charset=utf-8",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
    } catch (e) {
      Logger.log("Error alert webhook failed: " + e.toString());
    }
  }

  if (email && typeof MailApp !== "undefined" && MailApp.sendEmail) {
    try {
      MailApp.sendEmail(email, "Slack Calendar Status Sync error alert", message);
    } catch (e) {
      Logger.log("Error alert email failed: " + e.toString());
    }
  }
}

function createRunContext_(scope) {
  const rid = "run-" + new Date().toISOString() + "-" + Math.floor(Math.random() * 100000);
  return {
    scope: scope,
    runId: rid,
    metrics: {
      statusChanges: 0,
      presenceChanges: 0,
      dndChanges: 0,
      skipped: 0,
      errors: 0
    }
  };
}

function logEvent_(run, level, event, details) {
  Logger.log(JSON.stringify({
    scope: run.scope,
    runId: run.runId,
    level: level,
    event: event,
    details: details || {}
  }));
}

/* =========================
 *  Status title parsing
 * ========================= */

/**
 * Extracts the first :code: emoji from title (any position),
 * removes all :code: occurrences from text, removes DND keywords, and normalizes whitespace.
 * If no emoji is found, uses defaultEmoji and the full title text after DND cleanup.
 */
function parseStatusTitle_(title, defaultEmoji) {
  const safeTitle = String(title || "").trim();

  // Slack emoji names support letters/digits/_/+/-.
  const re = /:([a-zA-Z0-9_+\-]+):/g;
  const matches = safeTitle.match(re) || [];
  const emoji = matches.length ? matches[0] : defaultEmoji;

  // Remove ALL emoji codes from text (works for prefix/suffix emoji)
  let text = safeTitle
    .replace(re, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Remove DND keywords from displayed status text (keep original title for DND decisions)
  if (CONFIG.DND_KEYWORDS && CONFIG.DND_KEYWORDS.length > 0) {
    for (var i = 0; i < CONFIG.DND_KEYWORDS.length; i++) {
      const keyword = CONFIG.DND_KEYWORDS[i];
      // Remove keyword (case-insensitive, whole word)
      const keywordRegex = new RegExp("\\b" + keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
      text = text.replace(keywordRegex, " ");
    }
    // Normalize whitespace after keyword removal
    text = text.replace(/\s+/g, " ").trim();
  }

  return {
    emoji: emoji,
    text: text || "" // if title only contains emoji, keep empty text
  };
}

/**
 * Formats date as DD/MM.
 */
function formatDateDDMM_(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return day + "/" + month;
}

/**
 * Adds a date suffix to status text as "Text (DD/MM - DD/MM)".
 * If start and end are on same day, returns "Text (DD/MM)".
 */
function addDateRangeToStatus_(text, startDate, endDate) {
  if (!startDate || !endDate) return text;
  
  const startStr = formatDateDDMM_(startDate);
  const endStr = formatDateDDMM_(endDate);
  
  // Same day: append a single date
  if (startStr === endStr) {
    return text ? (text + " (" + startStr + ")") : startStr;
  }
  
  // Different days: append date range
  return text ? (text + " (" + startStr + " - " + endStr + ")") : (startStr + " - " + endStr);
}

function containsAnyKeyword_(text, keywords) {
  const source = String(text || "").toLowerCase();
  for (var i = 0; i < (keywords || []).length; i++) {
    const keyword = String(keywords[i] || "").trim().toLowerCase();
    if (!keyword) continue;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const keywordRegex = new RegExp("(^|\\b)" + escaped + "(\\b|$)", "i");
    if (keywordRegex.test(source)) return true;
  }
  return false;
}

/**
 * Checks whether event is Out of Office.
 * First tries event type detection via Calendar API,
 * then falls back to title keywords.
 */
function isOutOfOfficeEvent_(event, title, calId) {
  // Attempt 1: detect by Calendar API event type
  // CalendarApp does not expose eventType, so we use Calendar API
  try {
    if (event && calId) {
      // CalendarApp has no direct eventType getter; query Calendar API in event time range
      const startTime = event.getStartTime();
      const endTime = event.getEndTime();
      
      // Query event via Calendar API (Advanced Calendar Service)
      // Requires Advanced Calendar Service enabled in project
      try {
        const calendarApiEvents = Calendar.Events.list(calId, {
          timeMin: startTime.toISOString(),
          timeMax: new Date(endTime.getTime() + 1000).toISOString(), // +1s safety margin
          singleEvents: true,
          maxResults: 10
        });
        
        if (calendarApiEvents.items && calendarApiEvents.items.length > 0) {
          // Match by start time and title
          for (var i = 0; i < calendarApiEvents.items.length; i++) {
            const apiEvent = calendarApiEvents.items[i];
            const apiStart = apiEvent.start.dateTime ? new Date(apiEvent.start.dateTime) : new Date(apiEvent.start.date);
            const apiTitle = apiEvent.summary || "";
            
            // Compare start time (1-minute tolerance) and title
            const timeDiff = Math.abs(apiStart.getTime() - startTime.getTime());
            if (timeDiff < 60000 && apiTitle === title) {
              // Matching event found - check type
              if (apiEvent.eventType === "outOfOffice") {
                Logger.log("OOO detected via eventType: " + title);
                return true;
              }
            }
          }
        }
      } catch (apiError) {
        // Calendar API may be unavailable - fall back to keywords
        Logger.log("Calendar API unavailable, using keyword fallback: " + apiError.toString());
      }
    }
  } catch (e) {
    Logger.log("Error while checking event type: " + e.toString());
  }

  // Attempt 2: keyword-based fallback
  return containsAnyKeyword_(title, CONFIG.OOO_KEYWORDS);
}

/* =========================
 *  Calendar Helpers
 * ========================= */

function getCalendarOrThrow_(calId) {
  const cal = CalendarApp.getCalendarById(calId);
  if (!cal) throw new Error("Calendar not found for ID: " + calId);
  return cal;
}

function getTodayAllDayHolidayEvent_(holidayCalId, now) {
  try {
    const cal = getCalendarOrThrow_(holidayCalId);
    const events = cal.getEventsForDay(now) || [];
    for (var i = 0; i < events.length; i++) {
      if (events[i].isAllDayEvent && events[i].isAllDayEvent()) return events[i];
    }
  } catch (e) {
    Logger.log("Error while reading holiday events: " + e.toString());
  }
  return null;
}

/**
 * Gets active event using time window (handles events crossing midnight).
 */
function getCurrentEvent_(calId, now) {
  try {
    const cal = getCalendarOrThrow_(calId);
    
    // Search window: 24h back and 24h forward (midnight-safe)
    const searchStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const searchEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const events = cal.getEvents(searchStart, searchEnd) || [];
    const activeEvents = [];
    for (var i = 0; i < events.length; i++) {
      const ev = events[i];
      const start = ev.getStartTime();
      const end = ev.getEndTime();
      if (start && end && start.getTime() <= now.getTime() && now.getTime() < end.getTime()) {
        activeEvents.push(ev);
      }
    }
    if (activeEvents.length === 0) {
      return null;
    }

    // Deterministic selection:
    // 1) timed events before all-day,
    // 2) later start first,
    // 3) earlier end as tie-breaker.
    activeEvents.sort(function (a, b) {
      const aAllDay = a.isAllDayEvent && a.isAllDayEvent();
      const bAllDay = b.isAllDayEvent && b.isAllDayEvent();
      if (aAllDay !== bAllDay) return aAllDay ? 1 : -1;

      const startDiff = b.getStartTime().getTime() - a.getStartTime().getTime();
      if (startDiff !== 0) return startDiff;

      return a.getEndTime().getTime() - b.getEndTime().getTime();
    });

    return activeEvents[0];
  } catch (e) {
    Logger.log("Error while reading events from calendar %s: %s", calId, e.toString());
  }
  return null;
}

/* =========================
 *  Work-hours helpers
 * ========================= */

function parseHm_(hm) {
  const m = String(hm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error("Invalid time format (HH:MM): " + hm);
  const hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("Invalid time value (HH:MM): " + hm);
  }
  return { h: hours, m: minutes };
}

function isWithinWorkHours_(now, workStart, workEnd) {
  const s = parseHm_(workStart);
  const e = parseHm_(workEnd);

  const start = new Date(now);
  start.setHours(s.h, s.m, 0, 0);

  const end = new Date(now);
  end.setHours(e.h, e.m, 0, 0);

  return now.getTime() >= start.getTime() && now.getTime() < end.getTime();
}

function nextWorkStart_(now, workStart, workDays) {
  const s = parseHm_(workStart);
  const candidate = new Date(now);
  candidate.setHours(s.h, s.m, 0, 0);

  // If before today's start time, try today first.
  if (now.getTime() < candidate.getTime()) {
    if (!workDays || workDays.length === 0 || workDays.indexOf(isoDow_(candidate)) !== -1) {
      return candidate;
    }
  }

  // Otherwise, search for the next configured work day.
  for (var i = 1; i <= 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(s.h, s.m, 0, 0);
    if (!workDays || workDays.length === 0 || workDays.indexOf(isoDow_(d)) !== -1) {
      return d;
    }
  }

  // Fallback (should not happen)
  return candidate;
}

// ISO day-of-week: 1=Mon ... 7=Sun
function isoDow_(d) {
  const js = d.getDay(); // 0=Sun ... 6=Sat
  return js === 0 ? 7 : js;
}

function isWorkDay_(date, workDays) {
  if (!workDays || workDays.length === 0) return true;
  return workDays.indexOf(isoDow_(date)) !== -1;
}

/* =========================
 *  Time Helpers
 * ========================= */

function epochSeconds_(date) {
  return Math.floor(date.getTime() / 1000);
}

function minutesUntil_(from, to) {
  const ms = to.getTime() - from.getTime();
  // Slack requires positive minutes.
  return Math.max(1, Math.ceil(ms / 60000));
}

function nextMidnight_(now) {
  // Timezone-safe approach across all script timezones.
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function minutesUntilNextMidnight_(now) {
  return minutesUntil_(now, nextMidnight_(now));
}

/* =========================
 *  Slack API helpers with retry and idempotency
 * ========================= */

/**
 * Gets Slack token from PropertiesService or CONFIG.
 */
function getSlackToken_() {
  return getConfigString_("SLACK_USER_TOKEN");
}

/**
 * Slack API call with retry and HTTP 429 handling.
 */
function slackApi_(method, payload) {
  const token = getSlackToken_();
  if (!token) {
    throw new Error("Missing Slack token (set SLACK_USER_TOKEN in CONFIG or PropertiesService)");
  }

  const url = "https://slack.com/api/" + method;
  const maxAttempts = CONFIG.SLACK_RETRY_MAX_ATTEMPTS || 3;
  let lastError = null;

  for (var attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json; charset=utf-8",
        headers: {
          Authorization: "Bearer " + token
        },
        payload: JSON.stringify(payload || {}),
        muteHttpExceptions: true
      });

      const code = resp.getResponseCode();
      const body = resp.getContentText() || "";
      let json;
      try {
        json = JSON.parse(body);
      } catch (e) {
        throw new Error("Slack API parse error (" + method + "), HTTP " + code + ": " + body);
      }

      // Rate limit (HTTP 429)
      if (code === 429) {
        const retryAfter = parseInt(resp.getHeaders()["Retry-After"] || "60", 10);
        const delayMs = retryAfter * 1000;
        Logger.log("Rate limit (429) for %s, retry in %d seconds (attempt %d/%d)", 
          method, retryAfter, attempt, maxAttempts);
        
        if (attempt < maxAttempts) {
          Utilities.sleep(delayMs);
          continue;
        } else {
          throw new Error("Rate limit reached after " + maxAttempts + " attempts");
        }
      }

      if (code < 200 || code >= 300 || !json.ok) {
        throw new Error("Slack API error (" + method + "), HTTP " + code + ": " + 
          (json.error || body));
      }

      return json;
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        const delayMs = CONFIG.SLACK_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        Logger.log("Error calling %s (attempt %d/%d): %s, retry in %d ms", 
          method, attempt, maxAttempts, e.toString(), delayMs);
        Utilities.sleep(delayMs);
      }
    }
  }

  throw lastError || new Error("Failed to call " + method);
}

/**
 * Reads user profile from cache or API.
 * Cache TTL: 30s (profile may change often due to manual override).
 */
function slackGetProfile_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = "slack_profile";
  const cached = cache.get(cacheKey);
  
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      Logger.log("Profile cache parse error: " + e.toString());
    }
  }
  
  try {
    const json = slackApi_("users.profile.get", {});
    const profile = json.profile || {};
    // Cache for 30 seconds.
    cache.put(cacheKey, JSON.stringify(profile), 30);
    return profile;
  } catch (e) {
    Logger.log("Failed to fetch Slack profile: " + e.toString());
    // Return empty profile to avoid blocking the full run
    return {};
  }
}

/**
 * Sets status only when it differs (idempotent).
 * @param {Object} opts - Status options
 * @param {Object} cachedProfile - Optional cached profile (avoid extra API call)
 */
function slackSetStatus_(opts, cachedProfile) {
  const text = (opts && opts.text) ? String(opts.text) : "";
  const emoji = (opts && opts.emoji) ? String(opts.emoji) : "";
  const exp = (opts && opts.expirationEpochSec) ? Number(opts.expirationEpochSec) : 0;

  // Idempotency: compare against current profile (use cache when available)
  const current = cachedProfile || slackGetProfile_();
  const currentText = (current.status_text || "").trim();
  const currentEmoji = (current.status_emoji || "").trim();
  const currentExp = current.status_expiration || 0;

  if (currentText === text && currentEmoji === emoji && currentExp === exp) {
    Logger.log("Status already set, skipping.");
    return false;
  }

  slackApi_("users.profile.set", {
    profile: {
      status_text: text,
      status_emoji: emoji,
      status_expiration: exp
    }
  });
  
  // Invalidate cache after status change.
  const cache = CacheService.getScriptCache();
  cache.remove("slack_profile");
  return true;
}

function slackClearStatus_(cachedProfile) {
  return slackSetStatus_({ text: "", emoji: "", expirationEpochSec: 0 }, cachedProfile);
}

/**
 * Sets presence only when different (idempotent).
 */
function slackSetPresence_(presence) {
  // presence: "auto" or "away"
  const current = slackApi_("users.getPresence", {});
  const currentPresence = (current.presence || "").toLowerCase();
  
  if (currentPresence === presence.toLowerCase()) {
    Logger.log("Presence already set to '%s', skipping.", presence);
    return false;
  }

  slackApi_("users.setPresence", { presence: presence });
  return true;
}

function slackSetDndSnoozeMinutes_(minutes) {
  // Slack caps DND snooze at 1440 minutes (24h).
  const MAX_DND_MINUTES = 1440;
  const mins = Math.min(MAX_DND_MINUTES, Math.max(1, parseInt(minutes, 10) || 1));
  slackApi_("dnd.setSnooze", { num_minutes: mins });
  return true;
}

function slackEndDnd_() {
  // Check whether DND is currently enabled (idempotent)
  const dndInfo = slackApi_("dnd.info", {});
  if (!dndInfo.snooze_enabled && !dndInfo.dnd_enabled) {
    Logger.log("DND already disabled, skipping.");
    return false;
  }

  slackApi_("dnd.endDnd", {});
  return true;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CONFIG: CONFIG,
    syncSlackFromCalendars: syncSlackFromCalendars,
    planSlackFromCalendars: planSlackFromCalendars,
    buildSlackSyncContext_: buildSlackSyncContext_,
    buildSlackActionPlan_: buildSlackActionPlan_,
    executeSlackPlan_: executeSlackPlan_,
    validateSlackConfig_: validateSlackConfig_,
    parseStatusTitle_: parseStatusTitle_,
    containsAnyKeyword_: containsAnyKeyword_,
    getCurrentEvent_: getCurrentEvent_,
    isWithinWorkHours_: isWithinWorkHours_,
    nextWorkStart_: nextWorkStart_,
    isoDow_: isoDow_,
    isWorkDay_: isWorkDay_,
    minutesUntil_: minutesUntil_,
    addDateRangeToStatus_: addDateRangeToStatus_,
    getConfigString_: getConfigString_,
    notifyRunErrors_: notifyRunErrors_,
    getSlackToken_: getSlackToken_,
    slackApi_: slackApi_
  };
}
