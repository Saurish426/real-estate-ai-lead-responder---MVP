const { getPrismaClient } = require("../db");
const { getAgentIdFromRequest, getAgentOrDefault } = require("../services/agentService");
const { extractLeadDetails } = require("../services/aiExtractionService");
const { applyAiResponseGuardrails } = require("../services/aiResponseGuardrailService");
const { generateLeadResponse } = require("../services/aiResponseService");
const { applyBookingFlow } = require("../services/bookingFlowService");
const {
  findConversationForLead,
  saveLeadForSubmission,
  updateConversationMemory
} = require("../services/conversationMemoryService");
const { sendAgentLeadNotificationEmail, sendLeadReplyEmail } = require("../services/emailService");
const { logEvent } = require("../services/eventLogService");
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

  if (conversation && conversation.status === "booked") {
    return "booked";
  }

  if (conversation && (conversation.status === "showing_requested" || conversation.bookingRequested === true)) {
    return "showing_requested";
  }

  if ((intent === "buyer" || intent === "seller" || intent === "showing_request") && confidence !== null && confidence >= 0.5) {
    return "qualified";
  }

  if (aiExtraction && aiExtraction.wants_showing === true) {
    return "needs_handoff";
  }

  if (emailSent || agentNotificationSent || conversation) {
    return "contacted";
  }

  return "new";
}

async function listLeads(req, res) {
  try {
    const prisma = getPrismaClient();
    const agent = await getAgentOrDefault(prisma, getAgentIdFromRequest(req));
    const leads = await prisma.lead.findMany({
      where: {
        agentId: agent.id
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 50
    });
    const conversations = await prisma.conversation.findMany({
      where: {
        agentId: agent.id,
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
      agent,
      leads: leads.map((lead) => {
        const conversation = conversationByLeadId.get(lead.id) || null;
        const aiResponse = conversation ? conversation.lastMessage : null;
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
          agentId: lead.agentId,
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
          bookingStatus: conversation ? conversation.bookingStatus || "none" : "none",
          bookingRequested: conversation ? conversation.bookingRequested === true : false,
          bookingLinkSent: conversation ? conversation.bookingLinkSent === true : false,
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
    const agent = await getAgentOrDefault(prisma, getAgentIdFromRequest(req));
    const leadForAgent = {
      ...lead,
      agentId: agent.id
    };

    // Save a new lead, or update the existing lead when the same email returns.
    let { savedLead, isExistingLead } = await saveLeadForSubmission(prisma, leadForAgent);
    let existingConversation = null;

    await logEvent(prisma, {
      eventType: "lead_created",
      agentId: savedLead.agentId,
      leadId: savedLead.id,
      message: isExistingLead ? "Existing lead updated from new submission." : "New lead created.",
      metadata: {
        source: savedLead.source,
        isExistingLead
      }
    });

    try {
      existingConversation = await findConversationForLead(prisma, savedLead.id, savedLead.agentId);
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

        await logEvent(prisma, {
          eventType: "ai_extraction_success",
          agentId: savedLead.agentId,
          leadId: savedLead.id,
          message: "AI extraction completed.",
          metadata: {
            intent: aiExtraction.intent,
            wants_showing: aiExtraction.wants_showing,
            confidence: aiExtraction.confidence
          }
        });
      }
    } catch (aiError) {
      console.error("Lead was saved, but AI extraction failed:", {
        leadId: savedLead.id,
        message: aiError.message,
        code: aiError.code
      });

      await logEvent(prisma, {
        eventType: "ai_extraction_failed",
        agentId: savedLead.agentId,
        leadId: savedLead.id,
        message: "AI extraction failed.",
        metadata: {
          errorMessage: aiError.message,
          errorCode: aiError.code
        }
      });
    }

    let aiResponse = null;
    let aiResponseGuardrail = null;
    let bookingFlow = null;
    let conversation = null;
    let agentSettings = null;

    try {
      agentSettings = await getAgentSettings(prisma, savedLead.agentId);
    } catch (settingsError) {
      console.error("Lead was saved, but agent settings lookup failed. Safe defaults will be used:", {
        leadId: savedLead.id,
        message: settingsError.message,
        code: settingsError.code
      });
    }

    try {
      aiResponse = await generateLeadResponse(savedLead, aiExtraction, existingConversation, agentSettings);

      if (!aiResponse) {
        await logEvent(prisma, {
          eventType: "ai_response_failed",
          agentId: savedLead.agentId,
          leadId: savedLead.id,
          message: "AI response generation returned no response.",
          metadata: {
            reason: "empty_response"
          }
        });
      } else {
        await logEvent(prisma, {
          eventType: "ai_response_generated",
          agentId: savedLead.agentId,
          leadId: savedLead.id,
          message: "AI response generated.",
          metadata: {
            responseLength: aiResponse.length
          }
        });

        aiResponseGuardrail = applyAiResponseGuardrails(aiResponse);
        aiResponse = aiResponseGuardrail.response;

        if (aiResponseGuardrail.wasBlocked) {
          console.warn("AI response was blocked by safety guardrails:", {
            leadId: savedLead.id,
            violations: aiResponseGuardrail.violations
          });

          await logEvent(prisma, {
            eventType: "guardrail_blocked",
            agentId: savedLead.agentId,
            leadId: savedLead.id,
            message: "AI response blocked and replaced with safe fallback.",
            metadata: {
              violations: aiResponseGuardrail.violations
            }
          });
        } else {
          await logEvent(prisma, {
            eventType: "guardrail_passed",
            agentId: savedLead.agentId,
            leadId: savedLead.id,
            message: "AI response passed guardrail checks.",
            metadata: {
              responseLength: aiResponse ? aiResponse.length : 0
            }
          });
        }

        bookingFlow = applyBookingFlow(aiResponse, {
          lead: savedLead,
          aiExtraction,
          agentSettings
        });
        aiResponse = bookingFlow.response;
      }
    } catch (responseError) {
      console.error("Lead was saved, but AI response generation failed:", {
        leadId: savedLead.id,
        message: responseError.message,
        code: responseError.code
      });

      await logEvent(prisma, {
        eventType: "ai_response_failed",
        agentId: savedLead.agentId,
        leadId: savedLead.id,
        message: "AI response generation failed.",
        metadata: {
          errorMessage: responseError.message,
          errorCode: responseError.code
        }
      });
    }

    try {
      conversation = await updateConversationMemory(prisma, {
        lead: savedLead,
        incomingMessage: lead.message,
        aiExtraction,
        aiResponse,
        existingConversation,
        bookingFlow
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

      await logEvent(prisma, {
        eventType: "email_auto_reply_sent",
        agentId: savedLead.agentId,
        leadId: savedLead.id,
        message: "Customer auto-reply email sent.",
        metadata: {
          recipientDomain: savedLead.email.includes("@") ? savedLead.email.split("@")[1] : "unknown"
        }
      });
    } catch (emailError) {
      console.error("Lead was saved, but reply email failed:", {
        leadId: savedLead.id,
        message: emailError.message,
        code: emailError.code
      });

      await logEvent(prisma, {
        eventType: "email_auto_reply_failed",
        agentId: savedLead.agentId,
        leadId: savedLead.id,
        message: "Customer auto-reply email failed.",
        metadata: {
          errorMessage: emailError.message,
          errorCode: emailError.code
        }
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

      await logEvent(prisma, {
        eventType: "agent_notification_sent",
        agentId: savedLead.agentId,
        leadId: savedLead.id,
        message: "Agent notification email sent.",
        metadata: {
          usedSettingsEmail: Boolean(agentSettings && agentSettings.agentEmail)
        }
      });
    } catch (notificationError) {
      console.error("Lead was saved, but agent notification failed:", {
        leadId: savedLead.id,
        message: notificationError.message,
        code: notificationError.code
      });

      await logEvent(prisma, {
        eventType: "agent_notification_failed",
        agentId: savedLead.agentId,
        leadId: savedLead.id,
        message: "Agent notification email failed.",
        metadata: {
          errorMessage: notificationError.message,
          errorCode: notificationError.code
        }
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
      agent,
      aiExtraction,
      aiResponse,
      aiResponseGuardrail,
      bookingFlow,
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
