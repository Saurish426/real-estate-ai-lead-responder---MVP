function cleanString(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim();
}

function normalizeLead(input, options = {}) {
  const rawLead = input || {};
  const email = cleanString(rawLead.email) || "";
  const source = cleanString(rawLead.source) || options.defaultSource || "";

  return {
    name: cleanString(rawLead.name) || email,
    email,
    phone: cleanString(rawLead.phone) || "unknown",
    message: cleanString(rawLead.message) || "",
    source
  };
}

module.exports = {
  normalizeLead
};
