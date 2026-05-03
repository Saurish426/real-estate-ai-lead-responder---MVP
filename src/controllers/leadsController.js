const { getPrismaClient } = require("../db");

const REQUIRED_LEAD_FIELDS = ["name", "email", "phone", "message", "source"];

async function createLead(req, res) {
  const body = req.body || {};
  const lead = {
    name: body.name,
    email: body.email,
    phone: body.phone,
    message: body.message,
    source: body.source
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

  try {
    const prisma = getPrismaClient();

    // Save the lead in the database and return the record Prisma created.
    const savedLead = await prisma.lead.create({
      data: lead
    });

    return res.status(201).json(savedLead);
  } catch (error) {
    console.error("Error creating lead:", error);

    return res.status(500).json({
      error: "Unable to create lead."
    });
  }
}

module.exports = {
  createLead
};
