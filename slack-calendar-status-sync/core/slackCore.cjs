function containsAnyKeyword(text, keywords) {
  const source = String(text || "").toLowerCase();
  for (let i = 0; i < (keywords || []).length; i += 1) {
    const keyword = String(keywords[i] || "")
      .trim()
      .toLowerCase();
    if (!keyword) continue;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const keywordRegex = new RegExp("(^|\\b)" + escaped + "(\\b|$)", "i");
    if (keywordRegex.test(source)) return true;
  }
  return false;
}

function parseStatusTitle(title, defaultEmoji, dndKeywords) {
  const safeTitle = String(title || "").trim();
  const re = /:([a-zA-Z0-9_+\-]+):/g;
  const matches = safeTitle.match(re) || [];
  const emoji = matches.length ? matches[0] : defaultEmoji;

  let text = safeTitle.replace(re, " ").replace(/\s+/g, " ").trim();
  if (dndKeywords && dndKeywords.length > 0) {
    for (let i = 0; i < dndKeywords.length; i += 1) {
      const keyword = dndKeywords[i];
      const keywordRegex = new RegExp(
        "\\b" + keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
        "gi"
      );
      text = text.replace(keywordRegex, " ");
    }
    text = text.replace(/\s+/g, " ").trim();
  }

  return { emoji, text: text || "" };
}

function isoDow(date) {
  const js = date.getDay();
  return js === 0 ? 7 : js;
}

function isWorkDay(date, workDays) {
  if (!workDays || workDays.length === 0) return true;
  return workDays.indexOf(isoDow(date)) !== -1;
}

function parseHm(hm) {
  const m = String(hm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error("Invalid time format (HH:MM): " + hm);
  const hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("Invalid time value (HH:MM): " + hm);
  }
  return { h: hours, m: minutes };
}

function nextWorkStart(now, workStart, workDays) {
  const s = parseHm(workStart);
  const candidate = new Date(now);
  candidate.setHours(s.h, s.m, 0, 0);

  if (now.getTime() < candidate.getTime()) {
    if (!workDays || workDays.length === 0 || workDays.indexOf(isoDow(candidate)) !== -1) {
      return candidate;
    }
  }

  for (let i = 1; i <= 14; i += 1) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(s.h, s.m, 0, 0);
    if (!workDays || workDays.length === 0 || workDays.indexOf(isoDow(d)) !== -1) {
      return d;
    }
  }

  return candidate;
}

module.exports = {
  containsAnyKeyword,
  parseStatusTitle,
  isoDow,
  isWorkDay,
  nextWorkStart
};
