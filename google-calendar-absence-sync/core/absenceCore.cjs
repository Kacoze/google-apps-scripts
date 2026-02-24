function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeNameFromTitle(title, personName, removeNameFromTitleEnabled) {
  const source = String(title || "");
  if (!removeNameFromTitleEnabled) return source;

  const escapedName = escapeRegex(personName);
  let cleaned = source;
  cleaned = cleaned.replace(new RegExp(escapedName + "\\s*-\\s*", "gi"), "");
  cleaned = cleaned.replace(new RegExp("\\s*-\\s*" + escapedName, "gi"), "");
  cleaned = cleaned.replace(new RegExp(escapedName + "\\s+", "gi"), "");
  cleaned = cleaned.replace(new RegExp("\\s+" + escapedName, "gi"), "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned || source;
}

function isEventForPerson(title, personName) {
  return (
    String(title || "")
      .toLowerCase()
      .indexOf(String(personName || "").toLowerCase()) !== -1
  );
}

module.exports = {
  escapeRegex,
  removeNameFromTitle,
  isEventForPerson
};
