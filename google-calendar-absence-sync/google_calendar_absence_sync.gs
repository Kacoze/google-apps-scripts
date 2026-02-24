/**
 * Google Calendar Absence Sync — Google Apps Script
 * SPDX-License-Identifier: MIT
 * Synchronizes absence events from a team calendar to a personal calendar
 * as native "Out of Office" events.
 *
 * Required permissions:
 * - Calendar (read source calendar, write to target calendar)
 * - Advanced Calendar Service (Calendar API v3) for eventType "outOfOffice"
 *
 * IMPORTANT: To create native "Out of Office" events, enable Advanced Calendar Service:
 * 1. In the GAS editor: Resources > Advanced Google Services
 * 2. Enable "Calendar API v3"
 * 3. Also enable it in Google Cloud Console (editor link)
 */

const CONFIG = {
  // Calendar IDs (can be overridden by PropertiesService keys with same names)
  SOURCE_CALENDAR_ID: "your-team-absences-calendar-id@group.calendar.google.com", // Team calendar
  TARGET_CALENDAR_ID: "your-personal-calendar-id@group.calendar.google.com", // Personal calendar (MEETING_CAL_ID used by slack-calendar-status-sync)

  // Person identification (can be overridden by PERSON_NAME script property)
  PERSON_NAME: "your-full-name", // Full name to match in event title

  // Sync window
  SYNC_DAYS_BACK: 0, // Days back (0 = current and future only)
  SYNC_DAYS_FORWARD: 365, // Days forward (for example, one year)

  // Options
  REMOVE_NAME_FROM_TITLE: true, // Remove full name from title
  COPY_DESCRIPTION: false, // Do not copy description

  // Advanced Calendar Service
  USE_ADVANCED_CALENDAR: true, // Required for eventType "outOfOffice"

  // Diagnostic mode
  DRY_RUN: false, // true = log only, no event creation

  // Logging
  LOG_LEVEL: "INFO", // "DEBUG", "INFO", "ERROR"

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

function resolveAbsenceConfig_() {
  return {
    sourceCalendarId: getConfigString_("SOURCE_CALENDAR_ID"),
    targetCalendarId: getConfigString_("TARGET_CALENDAR_ID"),
    personName: getConfigString_("PERSON_NAME"),
    syncDaysBack: CONFIG.SYNC_DAYS_BACK,
    syncDaysForward: CONFIG.SYNC_DAYS_FORWARD
  };
}

/**
 * Main function for time-driven trigger.
 */
function syncAbsences() {
  const now = new Date();
  const cfg = resolveAbsenceConfig_();
  const run = createRunContext_("absence-sync");
  logEvent_(run, "INFO", "run_start", { dryRun: CONFIG.DRY_RUN });
  let lock = null;
  let lockAcquired = false;

  try {
    validateAbsenceConfig_(cfg);

    // Locking: prevents concurrent runs
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) { // 10-second timeout
      run.metrics.skipped++;
      logEvent_(run, "WARN", "lock_busy", {});
      return;
    }
    lockAcquired = true;
    _syncAbsencesImpl(now, run, cfg);
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

/**
 * Manual sync entrypoint (for testing).
 */
function syncAbsencesManual() {
  syncAbsences();
}

/**
 * Plan-only mode: no writes, returns action plan.
 */
function planAbsences() {
  const now = new Date();
  const cfg = resolveAbsenceConfig_();
  validateAbsenceConfig_(cfg);
  const plan = buildAbsenceSyncPlan_(now, cfg);
  Logger.log(JSON.stringify({ plan: plan }, null, 2));
  return plan;
}

/**
 * Main synchronization flow.
 */
function _syncAbsencesImpl(now, run, cfg) {
  const plan = buildAbsenceSyncPlan_(now, cfg);
  logEvent_(run, "INFO", "plan_ready", {
    totalActions: plan.actions.length,
    sourceEvents: plan.sourceEvents
  });

  for (var i = 0; i < plan.actions.length; i++) {
    const action = plan.actions[i];
    try {
      if (action.type === "skip_existing") {
        run.metrics.skipped++;
        logEvent_(run, "DEBUG", "skip_existing", { title: action.title });
        continue;
      }

      if (CONFIG.DRY_RUN) {
        run.metrics.created++;
        logEvent_(run, "INFO", "dry_run_create", { title: action.title });
        continue;
      }

      createOutOfOfficeEvent_(cfg.targetCalendarId, action.sourceEvent, cfg.personName);
      run.metrics.created++;
      logEvent_(run, "INFO", "created", { title: action.title });
    } catch (e) {
      run.metrics.errors++;
      logEvent_(run, "ERROR", "action_error", {
        title: action.title,
        error: String(e)
      });
    }
  }
}

function buildAbsenceSyncPlan_(now, resolvedCfg) {
  const cfg = resolvedCfg || resolveAbsenceConfig_();
  // Ports: calendar access and duplicate detection
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - cfg.syncDaysBack);

  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + cfg.syncDaysForward);

  const absenceEvents = getAbsenceEvents_(cfg.sourceCalendarId, cfg.personName, startDate, endDate);
  const actions = [];

  for (var i = 0; i < absenceEvents.length; i++) {
    const sourceEvent = absenceEvents[i];
    const existingEvent = findMatchingEvent_(cfg.targetCalendarId, sourceEvent, cfg.personName);
    const title = sourceEvent.getTitle() || "";
    if (existingEvent) {
      actions.push({ type: "skip_existing", title: title, sourceEvent: sourceEvent });
    } else {
      actions.push({ type: "create_ooo", title: title, sourceEvent: sourceEvent });
    }
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    sourceEvents: absenceEvents.length,
    actions: actions
  };
}

function validateAbsenceConfig_(resolvedCfg) {
  const cfg = resolvedCfg || resolveAbsenceConfig_();
  const errors = [];
  if (!cfg.sourceCalendarId || cfg.sourceCalendarId.indexOf("your-") === 0) {
    errors.push("SOURCE_CALENDAR_ID");
  }
  if (!cfg.targetCalendarId || cfg.targetCalendarId.indexOf("your-") === 0) {
    errors.push("TARGET_CALENDAR_ID");
  }
  if (!cfg.personName || cfg.personName.indexOf("your-") === 0) {
    errors.push("PERSON_NAME");
  }
  if (typeof cfg.syncDaysBack !== "number" || cfg.syncDaysBack < 0) {
    errors.push("SYNC_DAYS_BACK");
  }
  if (typeof cfg.syncDaysForward !== "number" || cfg.syncDaysForward < 0) {
    errors.push("SYNC_DAYS_FORWARD");
  }
  if (errors.length > 0) {
    throw new Error("Missing or invalid configuration: " + errors.join(", "));
  }
}

function createRunContext_(scope) {
  const rid = "run-" + new Date().toISOString() + "-" + Math.floor(Math.random() * 100000);
  return {
    scope: scope,
    runId: rid,
    metrics: {
      created: 0,
      skipped: 0,
      errors: 0
    }
  };
}

function logEvent_(run, level, event, details) {
  log_(level, JSON.stringify({
    scope: run.scope,
    runId: run.runId,
    event: event,
    details: details || {}
  }));
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
  const message = "Absence sync run reported errors: " + JSON.stringify(payload);

  if (webhookUrl) {
    try {
      UrlFetchApp.fetch(webhookUrl, {
        method: "post",
        contentType: "application/json; charset=utf-8",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
    } catch (e) {
      log_("ERROR", "Error alert webhook failed: " + e.toString());
    }
  }

  if (email && typeof MailApp !== "undefined" && MailApp.sendEmail) {
    try {
      MailApp.sendEmail(email, "Google Calendar Absence Sync error alert", message);
    } catch (e) {
      log_("ERROR", "Error alert email failed: " + e.toString());
    }
  }
}

/* =========================
 *  Helper Functions
 * ========================= */

/**
 * Fetches absence events for one person from source calendar.
 */
function getAbsenceEvents_(sourceCalId, personName, startDate, endDate) {
  try {
    const cal = CalendarApp.getCalendarById(sourceCalId);
    if (!cal) {
      throw new Error("Source calendar not found: " + sourceCalId);
    }
    
    const events = cal.getEvents(startDate, endDate) || [];
    const filteredEvents = [];
    
    for (var i = 0; i < events.length; i++) {
      if (isEventForPerson_(events[i], personName)) {
        filteredEvents.push(events[i]);
      }
    }
    
    return filteredEvents;
  } catch (e) {
    log_("ERROR", "Error while fetching source calendar events: " + e.toString());
    throw e;
  }
}

/**
 * Checks whether event matches person name (based on title).
 */
function isEventForPerson_(event, personName) {
  const title = (event.getTitle() || "").toLowerCase();
  const name = personName.toLowerCase();
  return title.indexOf(name) !== -1;
}

/**
 * Checks if matching event already exists in target calendar.
 * Compares start time, end time and cleaned title.
 */
function findMatchingEvent_(targetCalId, sourceEvent, personName) {
  try {
    const cal = CalendarApp.getCalendarById(targetCalId);
    if (!cal) {
      throw new Error("Target calendar not found: " + targetCalId);
    }
    
    const sourceStart = sourceEvent.getStartTime();
    const sourceEnd = sourceEvent.getEndTime();
    const sourceTitle = removeNameFromTitle_(sourceEvent.getTitle(), personName);
    
    // Search events in a +/-1 day window (timezone-safe)
    const searchStart = new Date(sourceStart.getTime() - 24 * 60 * 60 * 1000);
    const searchEnd = new Date(sourceEnd.getTime() + 24 * 60 * 60 * 1000);
    
    const events = cal.getEvents(searchStart, searchEnd) || [];
    
    for (var i = 0; i < events.length; i++) {
      const ev = events[i];
      const evStart = ev.getStartTime();
      const evEnd = ev.getEndTime();
      const evTitle = ev.getTitle() || "";
      
      // Compare timestamps (1-minute tolerance) and title
      const startDiff = Math.abs(evStart.getTime() - sourceStart.getTime());
      const endDiff = Math.abs(evEnd.getTime() - sourceEnd.getTime());
      
      if (startDiff < 60000 && endDiff < 60000 && evTitle === sourceTitle) {
        return ev;
      }
    }
    
    return null;
  } catch (e) {
    log_("ERROR", "Error while checking duplicates: " + e.toString());
    return null; // Do not block sync on duplicate-check error
  }
}

/**
 * Removes full name from event title.
 */
function removeNameFromTitle_(title, personName) {
  if (!CONFIG.REMOVE_NAME_FROM_TITLE) {
    return title;
  }
  
  const escapedName = escapeRegex_(personName);

  // Remove full name in common title patterns
  let cleaned = title;
  
  // "John Doe - vacation" -> "vacation"
  cleaned = cleaned.replace(new RegExp(escapedName + "\\s*-\\s*", "gi"), "");
  
  // "vacation - John Doe" -> "vacation"
  cleaned = cleaned.replace(new RegExp("\\s*-\\s*" + escapedName, "gi"), "");
  
  // "John Doe vacation" -> "vacation"
  cleaned = cleaned.replace(new RegExp(escapedName + "\\s+", "gi"), "");
  
  // "vacation John Doe" -> "vacation"
  cleaned = cleaned.replace(new RegExp("\\s+" + escapedName, "gi"), "");
  
  // Normalize repeated whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  
  return cleaned || title; // If cleanup produces empty text, keep original title
}

function escapeRegex_(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Creates an "Out of Office" event in the target calendar.
 */
function createOutOfOfficeEvent_(targetCalId, sourceEvent, personName) {
  try {
    const cal = CalendarApp.getCalendarById(targetCalId);
    if (!cal) {
      throw new Error("Target calendar not found: " + targetCalId);
    }
    
    const title = removeNameFromTitle_(sourceEvent.getTitle(), personName);
    const startTime = sourceEvent.getStartTime();
    const endTime = sourceEvent.getEndTime();
    const description = CONFIG.COPY_DESCRIPTION ? (sourceEvent.getDescription() || "") : "";
    const isAllDay = sourceEvent.isAllDayEvent();
    
    if (CONFIG.USE_ADVANCED_CALENDAR) {
      // Use Calendar API v3 to create an outOfOffice event
      try {
        const eventResource = {
          summary: title,
          description: description,
          eventType: "outOfOffice",
          start: isAllDay ? {
            date: formatDateForAPI_(startTime)
          } : {
            dateTime: startTime.toISOString(),
            timeZone: Session.getScriptTimeZone()
          },
          end: isAllDay ? {
            date: formatDateForAPI_(endTime)
          } : {
            dateTime: endTime.toISOString(),
            timeZone: Session.getScriptTimeZone()
          }
        };
        
        Calendar.Events.insert(eventResource, targetCalId);
        log_("DEBUG", "Created OOO event via Calendar API: " + title);
        return;
      } catch (apiError) {
        log_("WARN", "Calendar API unavailable, falling back to CalendarApp: " + apiError.toString());
        // Fallback to CalendarApp (without OOO eventType)
      }
    }
    
    // Fallback: use CalendarApp (no eventType support)
    if (isAllDay) {
      cal.createAllDayEvent(title, startTime, endTime, {
        description: description
      });
    } else {
      cal.createEvent(title, startTime, endTime, {
        description: description
      });
    }
    
    log_("DEBUG", "Created event via CalendarApp: " + title);
    
  } catch (e) {
    log_("ERROR", "Error while creating OOO event: " + e.toString());
    throw e;
  }
}

/**
 * Formats date for Calendar API (YYYY-MM-DD for all-day).
 */
function formatDateForAPI_(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

/**
 * Logging with levels.
 */
function log_(level, message) {
  const levels = { "DEBUG": 0, "INFO": 1, "WARN": 2, "ERROR": 3 };
  const configLevel = levels[CONFIG.LOG_LEVEL] || 1;
  const msgLevel = levels[level] || 1;
  
  if (msgLevel >= configLevel) {
    Logger.log("[" + level + "] " + message);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CONFIG: CONFIG,
    syncAbsences: syncAbsences,
    syncAbsencesManual: syncAbsencesManual,
    planAbsences: planAbsences,
    buildAbsenceSyncPlan_: buildAbsenceSyncPlan_,
    validateAbsenceConfig_: validateAbsenceConfig_,
    resolveAbsenceConfig_: resolveAbsenceConfig_,
    getConfigString_: getConfigString_,
    notifyRunErrors_: notifyRunErrors_,
    createOutOfOfficeEvent_: createOutOfOfficeEvent_,
    removeNameFromTitle_: removeNameFromTitle_,
    escapeRegex_: escapeRegex_,
    isEventForPerson_: isEventForPerson_,
    formatDateForAPI_: formatDateForAPI_
  };
}
