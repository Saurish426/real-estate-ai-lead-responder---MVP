const { getPrismaClient } = require("../db");
const { extractLeadDetails } = require("../services/aiExtractionService");
const { generateLeadResponse } = require("../services/aiResponseService");
const {
  findConversationForLead,
  saveLeadForSubmission,
  updateConversationMemory
} = require("../services/conversationMemoryService");
const { sendAgentLeadNotificationEmail, sendLeadReplyEmail } = require("../services/emailService");
const { getAgentSettings } = require("../services/settingsService");
const { normalizeLead } = require("../utils/normalizeLead");

const REQUIRED_LEAD_FIELDS = ["name", "email", "phone", "message", "source"];

function formatAiExtractionSummary(aiExtraction) {
  if (!aiExtraction) {
    return "Not available";
  }

  return [
    `Intent: ${aiExtraction.intent || "unknown"}`,
    `Showing: ${aiExtraction.wants_showing === true ? "yes" : "no"}`,
    `Timeline: ${aiExtraction.timeline || "unknown"}`,
    `Budget: ${aiExtraction.budget || "unknown"}`,
    `Confidence: ${aiExtraction.confidence ?? "unknown"}`
  ].join(" | ");
}

function getAiConfidence(aiExtraction) {
  const confidence = Number(aiExtraction && aiExtraction.confidence);
  return Number.isFinite(confidence) ? confidence : null;
}

function getLeadStatus({ aiExtraction, emailSent, agentNotificationSent, conversation }) {
  const intent = aiExtraction && aiExtraction.intent ? aiExtraction.intent : "unknown";
  const confidence = getAiConfidence(aiExtraction);

  if (aiExtraction && aiExtraction.wants_showing === true) {
    return "needs_handoff";
  }

  if ((intent === "buyer" || intent === "seller" || intent === "showing_request") && confidence !== null && confidence >= 0.5) {
    return "qualified";
  }

  if (emailSent || agentNotificationSent || conversation) {
    return "contacted";
  }

  return "new";
}

async function listLeads(req, res) {
  try {
    const prisma = getPrismaClient();
    const leads = await prisma.lead.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: 50
    });
    const conversations = await prisma.conversation.findMany({
      where: {
        leadId: {
          in: leads.map((lead) => lead.id)
        }
      },
      orderBy: {
        id: "desc"
      }
    });
    const conversationByLeadId = new Map();

    conversations.forEach((conversation) => {
      if (!conversationByLeadId.has(conversation.leadId)) {
        conversationByLeadId.set(conversation.leadId, conversation);
      }
    });

    return res.json({
      leads: leads.map((lead) => {
        const conversation = conversationByLeadId.get(lead.id) || null;
        const aiResponse = conversation && conversation.status === "ai_generated" ? conversation.lastMessage : null;
        const aiConfidence = getAiConfidence(lead.aiExtraction);
        const emailSent = lead.emailSent === true;
        const agentNotificationSent = lead.agentNotificationSent === true;
        const leadStatus = getLeadStatus({
          aiExtraction: lead.aiExtraction,
          emailSent,
          agentNotificationSent,
          conversation
        });

        return {
          id: lead.id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          source: lead.source,
          status: leadStatus,
          leadStatus,
          latestMessage: lead.message,
          aiExtraction: lead.aiExtraction,
          aiExtractionSummary: formatAiExtractionSummary(lead.aiExtraction),
          aiIntent: lead.aiExtraction ? lead.aiExtraction.intent || "unknown" : "unknown",
          wantsShowing: lead.aiExtraction ? lead.aiExtraction.wants_showing === true : false,
          aiConfidence,
          aiResponse,
          emailSent,
          agentNotificationSent,
          conversationStatus: conversation ? conversation.status : "none",
          messageCount: conversation ? conversation.messageCount : 0,
          aiSummary: conversation ? conversation.aiSummary : null,
          conversation,
          createdAt: lead.createdAt
        };
      })
    });
  } catch (error) {
    console.error("Error listing leads:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    return res.status(500).json({
      error: "Unable to list leads."
    });
  }
}

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

    // Save a new lead, or update the existing lead when the same email returns.
    let { savedLead, isExistingLead } = await saveLeadForSubmission(prisma, lead);
    let existingConversation = null;

    try {
      existingConversation = await findConversationForLead(prisma, savedLead.id);
    } catch (memoryLookupError) {
      console.error("Lead was saved, but conversation lookup failed:", {
        leadId: savedLead.id,
        message: memoryLookupError.message,
        code: memoryLookupError.code
      });
    }

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

    let aiResponse = null;
    let conversation = null;
    let agentSettings = null;

    try {
      agentSettings = await getAgentSettings(prisma);
    } catch (settingsError) {
      console.error("Lead was saved, but agent settings lookup failed. Safe defaults will be used:", {
        leadId: savedLead.id,
        message: settingsError.message,
        code: settingsError.code
      });
    }

    try {
      aiResponse = await generateLeadResponse(savedLead, aiExtraction, existingConversation, agentSettings);
    } catch (responseError) {
      console.error("Lead was saved, but AI response generation failed:", {
        leadId: savedLead.id,
        message: responseError.message,
        code: responseError.code
      });
    }

    try {
      conversation = await updateConversationMemory(prisma, {
        lead: savedLead,
        incomingMessage: lead.message,
        aiExtraction,
        aiResponse,
        existingConversation
      });

      console.log(`Conversation memory saved for lead ${savedLead.id}.`);
    } catch (memoryError) {
      console.error("Lead was saved, but conversation memory failed:", {
        leadId: savedLead.id,
        message: memoryError.message,
        code: memoryError.code
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

    let agentNotificationSent = false;

    try {
      await sendAgentLeadNotificationEmail({
        lead: savedLead,
        aiExtraction,
        aiResponse,
        conversation,
        agentSettings
      });
      agentNotificationSent = true;
      console.log(`Agent notification email sent for lead ${savedLead.id}.`);
    } catch (notificationError) {
      console.error("Lead was saved, but agent notification failed:", {
        leadId: savedLead.id,
        message: notificationError.message,
        code: notificationError.code
      });
    }

    try {
      savedLead = await prisma.lead.update({
        where: {
          id: savedLead.id
        },
        data: {
          emailSent,
          agentNotificationSent
        }
      });
    } catch (statusUpdateError) {
      console.error("Lead was saved, but email status update failed:", {
        leadId: savedLead.id,
        message: statusUpdateError.message,
        code: statusUpdateError.code
      });
    }

    return res.status(201).json({
      lead: savedLead,
      aiExtraction,
      aiResponse,
      conversation,
      isExistingLead,
      emailSent,
      agentNotificationSent
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
  createLead,
  listLeads
};
