const { getPrismaClient } = require("../db");
const { extractLeadDetails } = require("../services/aiExtractionService");
const { sendLeadReplyEmail } = require("../services/emailService");
const { normalizeLead } = require("../utils/normalizeLead");

const REQUIRED_LEAD_FIELDS = ["name", "email", "phone", "message", "source"];

async function createLead(req, res) {
  const lead = normalizeLead(req.body, {
    defaultSource: "website"
  });

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
    let savedLead = await prisma.lead.create({
      data: lead
    });

    let aiExtraction = null;

    try {
      aiExtraction = await extractLeadDetails(savedLead);

      if (aiExtraction) {
        savedLead = await prisma.lead.update({
          where: {
            id: savedLead.id
          },
          data: {
            aiExtraction
          }
        });

        console.log(`AI extraction saved for lead ${savedLead.id}.`);
      }
    } catch (aiError) {
      console.error("Lead was saved, but AI extraction failed:", {
        leadId: savedLead.id,
        message: aiError.message,
        code: aiError.code
      });
    }

    let emailSent = false;

    try {
      await sendLeadReplyEmail(savedLead);
      emailSent = true;
      console.log(`Lead reply email sent for lead ${savedLead.id}.`);
    } catch (emailError) {
      console.error("Lead was saved, but reply email failed:", {
        leadId: savedLead.id,
        message: emailError.message,
        code: emailError.code
      });
    }

    return res.status(201).json({
      lead: savedLead,
      aiExtraction,
      emailSent
    });
  } catch (error) {
    console.error("Error creating lead:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    return res.status(500).json({
      error: "Unable to create lead."
    });
  }
}

module.exports = {
  createLead
};
