const REQUIRED_LEAD_FIELDS = ["name", "email", "phone", "message", "source"];

function createLead(req, res) {
  const lead = {
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
    message: req.body.message,
    source: req.body.source
  };

  // Collect every missing field so the user knows exactly what to fix.
  const missingFields = REQUIRED_LEAD_FIELDS.filter((field) => {
    const value = lead[field];
    return value === undefined || value === null || value === "";
  });

  if (missingFields.length > 0) {
    return res.status(400).json({
      error: "Missing required lead fields.",
      missingFields
    });
  }

  // Database saving comes later. For now, echo the lead back as JSON.
  return res.status(201).json(lead);
}

module.exports = {
  createLead
};
