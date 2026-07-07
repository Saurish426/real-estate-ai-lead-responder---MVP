const { getPrismaClient } = require("../db");
const { getAgentIdFromRequest, getAgentOrDefault } = require("../services/agentService");
const { extractLeadDetails } = require("../services/aiExtractionService");
const { analyzeLeadIntelligence } = require("../services/aiIntelligenceService");
const { applyAiResponseGuardrails } = require("../services/aiResponseGuardrailService");
const { generateLeadResponse } = require("../services/aiResponseService");
const { applyBookingFlow } = require("../services/bookingFlowService");
const { createGoogleCalendarEventForLead } = require("../services/calendarService");
const {
  findConversationForLead,
  saveLeadForSubmission,
  updateConversationMemory
} = require("../services/conversationMemoryService");
const { sendAgentLeadNotificationEmail, sendLeadReplyEmail } = require("../services/emailService");
const { logEvent } = require("../services/eventLogService");
const { scheduleFollowUpReminder } = require("../services/followUpReminderService");
const { getOfficeIdFromRequest, getOfficeOrDefault } = require("../services/officeService");
const { getAgentSettings } = require("../services/settingsService");
const { normalizeLead } = require("../utils/normalizeLead");

const REQUIRED_LEAD_FIELDS = ["name", "email", "phone", "message", "source"];
const CRM_STATUSES = ["New", "Qualified", "Contacted", "Showing", "Closed", "Lost"];

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getLeadId(req) {
  const leadId = Number(req.params.id);
  return Number.isInteger(leadId) && leadId > 0 ? leadId : null;
}

function normalizeCrmStatus(value) {
  const normalizedValue = cleanString(value).toLowerCase();
  return CRM_STATUSES.find((status) => status.toLowerCase() === normalizedValue) || null;
}

function getArchiveFilter(value) {
  if (value === "true" || value === true) {
    return true;
  }

  if (value === "all") {
    return undefined;
  }

  return false;
}

function getListLimit(value) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 50;
}

function getOptionalAgentFilter(value) {
  if (!value || value === "all") {
    return null;
  }

  const agentId = Number(value);
  return Number.isInteger(agentId) && agentId > 0 ? agentId : null;
}

function buildLeadSearch(search) {
  const query = cleanString(search);

  if (!query) {
    return undefined;
  }

  return [
    {
      name: {
        contains: query,
        mode: "insensitive"
      }
    },
    {
      email: {
        contains: query,
        mode: "insensitive"
      }
    },
    {
      phone: {
        contains: query,
        mode: "insensitive"
      }
    },
    {
      message: {
        contains: query,
        mode: "insensitive"
      }
    },
    {
      source: {
        contains: query,
        mode: "insensitive"
      }
    }
  ];
}

function buildLeadWhere({ officeId, query }) {
  const where = {
    officeId
  };
  const archived = getArchiveFilter(query.archived);
  const search = buildLeadSearch(query.search || query.q);
  const crmStatus = normalizeCrmStatus(query.status);
  const agentId = getOptionalAgentFilter(query.agentId);

  if (archived !== undefined) {
    where.archived = archived;
  }

  if (crmStatus) {
    where.crmStatus = crmStatus;
  }

  if (agentId) {
    where.OR = [
      {
        agentId
      },
      {
        assignedAgentId: agentId
      }
    ];
  }

  if (search) {
    where.AND = [
      ...(where.AND || []),
      {
        OR: search
      }
    ];
  }

  return where;
}

function getSafeLeadUpdate(input = {}) {
  const data = {};

  ["name", "email", "phone", "message", "source"].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      const value = cleanString(input[field]);

      if (value) {
        data[field] = value;
      }
    }
  });

  if (Object.prototype.hasOwnProperty.call(input, "crmStatus")) {
    const crmStatus = normalizeCrmStatus(input.crmStatus);

    if (!crmStatus) {
      const error = new Error("Invalid CRM status.");
      error.statusCode = 400;
      throw error;
    }

    data.crmStatus = crmStatus;
  }

  if (Object.prototype.hasOwnProperty.call(input, "archived")) {
    data.archived = input.archived === true;
  }

  if (Object.prototype.hasOwnProperty.call(input, "assignedAgentId")) {
    if (input.assignedAgentId === null || input.assignedAgentId === "" || input.assignedAgentId === "unassigned") {
      data.assignedAgentId = null;
    } else {
      const assignedAgentId = Number(input.assignedAgentId);

      if (!Number.isInteger(assignedAgentId) || assignedAgentId <= 0) {
        const error = new Error("Invalid assigned agent id.");
        error.statusCode = 400;
        throw error;
      }

      data.assignedAgentId = assignedAgentId;
    }
  }

  return data;
}

function getNoteBody(input = {}) {
  return cleanString(input.body || input.note || input.message);
}

async function getAssignedAgentId(prisma, { officeId, input = {}, fallbackAgentId }) {
  const requestedAgentId = Number(input.assignedAgentId || input.agentId);

  if (Number.isInteger(requestedAgentId) && requestedAgentId > 0) {
    const assignedAgent = await prisma.agent.findFirst({
      where: {
        id: requestedAgentId,
        officeId,
        isActive: true
      }
    });

    if (assignedAgent) {
      return assignedAgent.id;
    }
  }

  return fallbackAgentId || null;
}

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

function formatAiIntelligenceSummary(aiIntelligence) {
  if (!aiIntelligence) {
    return "Not available";
  }

  return [
    `Score: ${aiIntelligence.leadScore ?? "unknown"}`,
    `Label: ${aiIntelligence.leadScoreLabel || "unknown"}`,
    `Sentiment: ${aiIntelligence.sentiment || "unknown"}`,
    `Urgency: ${aiIntelligence.urgency || "unknown"}`,
    `Language: ${aiIntelligence.preferredLanguage || "en"}`,
    `Recommendation: ${aiIntelligence.followUpRecommendation || "none"}`
  ].join(" | ");
}

function getAiConfidence(aiExtraction) {
  const confidence = Number(aiExtraction && aiExtraction.confidence);
  return Number.isFinite(confidence) ? confidence : null;
}

function getLeadStatus({ aiExtraction, aiIntelligence, emailSent, agentNotificationSent, conversation }) {
  const intent = aiExtraction && aiExtraction.intent ? aiExtraction.intent : "unknown";
  const confidence = getAiConfidence(aiExtraction);
  const leadScore = Number(aiIntelligence && aiIntelligence.leadScore);

  if (conversation && conversation.status === "booked") {
    return "booked";
  }

  if (conversation && (conversation.status === "showing_requested" || conversation.bookingRequested === true)) {
    return "showing_requested";
  }

  if ((intent === "buyer" || intent === "seller" || intent === "showing_request") && confidence !== null && confidence >= 0.5) {
    return "qualified";
  }

  if (Number.isFinite(leadScore) && leadScore >= 75) {
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
    const office = await getOfficeOrDefault(prisma, agent.officeId || getOfficeIdFromRequest(req));
    const leads = await prisma.lead.findMany({
      where: buildLeadWhere({
        officeId: office.id,
        query: req.query || {}
      }),
      include: {
        assignedAgent: true,
        agent: true
      },
      orderBy: {
        createdAt: req.query && req.query.sort === "oldest" ? "asc" : "desc"
      },
      take: getListLimit(req.query && req.query.limit)
    });
    const conversations = await prisma.conversation.findMany({
      where: {
        officeId: office.id,
        leadId: {
          in: leads.map((lead) => lead.id)
        }
      },
      orderBy: {
        id: "desc"
      }
    });
    const notes = await prisma.leadNote.findMany({
      where: {
        officeId: office.id,
        leadId: {
          in: leads.map((lead) => lead.id)
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    const conversationByLeadId = new Map();
    const notesByLeadId = new Map();

    conversations.forEach((conversation) => {
      if (!conversationByLeadId.has(conversation.leadId)) {
        conversationByLeadId.set(conversation.leadId, conversation);
      }
    });

    notes.forEach((note) => {
      const leadNotes = notesByLeadId.get(note.leadId) || [];
      leadNotes.push(note);
      notesByLeadId.set(note.leadId, leadNotes);
    });

    return res.json({
      agent,
      office,
      leads: leads.map((lead) => {
        const conversation = conversationByLeadId.get(lead.id) || null;
        const aiResponse = conversation ? conversation.lastMessage : null;
        const aiIntelligence = lead.aiIntelligence || null;
        const aiConfidence = getAiConfidence(lead.aiExtraction);
        const emailSent = lead.emailSent === true;
        const agentNotificationSent = lead.agentNotificationSent === true;
        const derivedStatus = getLeadStatus({
          aiExtraction: lead.aiExtraction,
          aiIntelligence,
          emailSent,
          agentNotificationSent,
          conversation
        });
        const crmStatus = normalizeCrmStatus(lead.crmStatus) || "New";
        const leadNotes = notesByLeadId.get(lead.id) || [];

        return {
          id: lead.id,
          agentId: lead.agentId,
          officeId: lead.officeId,
          assignedAgentId: lead.assignedAgentId,
          assignedAgentName: lead.assignedAgent ? lead.assignedAgent.name : null,
          ownerAgentName: lead.agent ? lead.agent.name : null,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          source: lead.source,
          status: crmStatus,
          leadStatus: crmStatus,
          derivedStatus,
          crmStatus,
          archived: lead.archived === true,
          latestMessage: lead.message,
          aiExtraction: lead.aiExtraction,
          aiIntelligence,
          aiExtractionSummary: formatAiExtractionSummary(lead.aiExtraction),
          aiIntelligenceSummary: formatAiIntelligenceSummary(aiIntelligence),
          aiIntent: lead.aiExtraction ? lead.aiExtraction.intent || "unknown" : "unknown",
          wantsShowing: lead.aiExtraction ? lead.aiExtraction.wants_showing === true : false,
          aiConfidence,
          aiLeadScore: lead.leadScore ?? (aiIntelligence ? aiIntelligence.leadScore : null),
          aiLeadScoreLabel: lead.leadScoreLabel || (aiIntelligence ? aiIntelligence.leadScoreLabel : null),
          aiSentiment: lead.sentiment || (aiIntelligence ? aiIntelligence.sentiment : null),
          aiUrgency: lead.urgency || (aiIntelligence ? aiIntelligence.urgency : null),
          preferredLanguage: lead.preferredLanguage || (aiIntelligence ? aiIntelligence.preferredLanguage : "en"),
          followUpRecommendation: conversation
            ? conversation.followUpRecommendation
            : aiIntelligence
              ? aiIntelligence.followUpRecommendation
              : null,
          longTermMemory: conversation ? conversation.longTermMemory : null,
          aiResponse,
          emailSent,
          agentNotificationSent,
          bookingStatus: conversation ? conversation.bookingStatus || "none" : "none",
          bookingRequested: conversation ? conversation.bookingRequested === true : false,
          bookingLinkSent: conversation ? conversation.bookingLinkSent === true : false,
          calendarEventId: conversation ? conversation.calendarEventId : null,
          calendarEventLink: conversation ? conversation.calendarEventLink : null,
          followUpReminderAt: conversation ? conversation.followUpReminderAt : null,
          followUpReminderStatus: conversation ? conversation.followUpReminderStatus : null,
          conversationStatus: conversation ? conversation.status : "none",
          messageCount: conversation ? conversation.messageCount : 0,
          aiSummary: conversation ? conversation.aiSummary : null,
          conversation,
          notes: leadNotes,
          notesCount: leadNotes.length,
          latestNote: leadNotes[0] || null,
          createdAt: lead.createdAt,
          updatedAt: lead.updatedAt
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

async function updateLead(req, res) {
  try {
    const leadId = getLeadId(req);

    if (!leadId) {
      return res.status(400).json({
        error: "Invalid lead id."
      });
    }

    const prisma = getPrismaClient();
    const agent = await getAgentOrDefault(prisma, getAgentIdFromRequest(req));
    const office = await getOfficeOrDefault(prisma, agent.officeId || getOfficeIdFromRequest(req));
    const data = getSafeLeadUpdate(req.body);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        error: "No lead updates provided."
      });
    }

    const existingLead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        officeId: office.id
      }
    });

    if (!existingLead) {
      return res.status(404).json({
        error: "Lead not found."
      });
    }

    if (data.assignedAgentId) {
      const assignedAgent = await prisma.agent.findFirst({
        where: {
          id: data.assignedAgentId,
          officeId: office.id,
          isActive: true
        }
      });

      if (!assignedAgent) {
        return res.status(400).json({
          error: "Assigned agent must belong to this office."
        });
      }
    }

    const lead = await prisma.lead.update({
      where: {
        id: leadId
      },
      data
    });

    await logEvent(prisma, {
      eventType: "lead_crm_updated",
      agentId: agent.id,
      officeId: office.id,
      leadId: lead.id,
      message: "Lead CRM fields updated.",
      metadata: {
        updatedFields: Object.keys(data)
      }
    });

    return res.json({
      lead
    });
  } catch (error) {
    console.error("Error updating lead:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : "Unable to update lead."
    });
  }
}

async function archiveLead(req, res) {
  req.body = {
    archived: true
  };
  return updateLead(req, res);
}

async function deleteLead(req, res) {
  try {
    const leadId = getLeadId(req);

    if (!leadId) {
      return res.status(400).json({
        error: "Invalid lead id."
      });
    }

    const prisma = getPrismaClient();
    const agent = await getAgentOrDefault(prisma, getAgentIdFromRequest(req));
    const office = await getOfficeOrDefault(prisma, agent.officeId || getOfficeIdFromRequest(req));
    const existingLead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        officeId: office.id
      }
    });

    if (!existingLead) {
      return res.status(404).json({
        error: "Lead not found."
      });
    }

    await prisma.$transaction([
      prisma.conversation.deleteMany({
        where: {
          leadId,
          officeId: office.id
        }
      }),
      prisma.leadNote.deleteMany({
        where: {
          leadId,
          officeId: office.id
        }
      }),
      prisma.lead.delete({
        where: {
          id: leadId
        }
      })
    ]);

    await logEvent(prisma, {
      eventType: "lead_deleted",
      agentId: agent.id,
      officeId: office.id,
      leadId,
      message: "Lead deleted from CRM.",
      metadata: {
        emailDomain: existingLead.email.includes("@") ? existingLead.email.split("@")[1] : "unknown"
      }
    });

    return res.json({
      deleted: true,
      leadId
    });
  } catch (error) {
    console.error("Error deleting lead:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    return res.status(500).json({
      error: "Unable to delete lead."
    });
  }
}

async function addLeadNote(req, res) {
  try {
    const leadId = getLeadId(req);
    const body = getNoteBody(req.body);

    if (!leadId) {
      return res.status(400).json({
        error: "Invalid lead id."
      });
    }

    if (!body) {
      return res.status(400).json({
        error: "Note body is required."
      });
    }

    const prisma = getPrismaClient();
    const agent = await getAgentOrDefault(prisma, getAgentIdFromRequest(req));
    const office = await getOfficeOrDefault(prisma, agent.officeId || getOfficeIdFromRequest(req));
    const existingLead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        officeId: office.id
      }
    });

    if (!existingLead) {
      return res.status(404).json({
        error: "Lead not found."
      });
    }

    const note = await prisma.leadNote.create({
      data: {
        agentId: agent.id,
        officeId: office.id,
        leadId,
        body
      }
    });

    await logEvent(prisma, {
      eventType: "lead_note_added",
      agentId: agent.id,
      officeId: office.id,
      leadId,
      message: "Lead note added.",
      metadata: {
        noteLength: body.length
      }
    });

    return res.status(201).json({
      note
    });
  } catch (error) {
    console.error("Error adding lead note:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    return res.status(500).json({
      error: "Unable to add note."
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
    const office = await getOfficeOrDefault(prisma, agent.officeId || getOfficeIdFromRequest(req));
    const assignedAgentId = await getAssignedAgentId(prisma, {
      officeId: office.id,
      input: req.body,
      fallbackAgentId: agent.id
    });
    const leadForAgent = {
      ...lead,
      agentId: agent.id,
      officeId: office.id,
      assignedAgentId
    };

    // Save a new lead, or update the existing lead when the same email returns.
    let { savedLead, isExistingLead } = await saveLeadForSubmission(prisma, leadForAgent);
    let existingConversation = null;

    await logEvent(prisma, {
      eventType: "lead_created",
      agentId: savedLead.agentId,
      officeId: savedLead.officeId,
      leadId: savedLead.id,
      message: isExistingLead ? "Existing lead updated from new submission." : "New lead created.",
      metadata: {
        source: savedLead.source,
        isExistingLead,
        assignedAgentId: savedLead.assignedAgentId
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
          officeId: savedLead.officeId,
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
        officeId: savedLead.officeId,
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
    let aiIntelligence = null;
    let bookingFlow = null;
    let conversation = null;
    let agentSettings = null;

    try {
      agentSettings = await getAgentSettings(prisma, savedLead.agentId);
      agentSettings = {
        ...agentSettings,
        office
      };
    } catch (settingsError) {
      console.error("Lead was saved, but agent settings lookup failed. Safe defaults will be used:", {
        leadId: savedLead.id,
        message: settingsError.message,
        code: settingsError.code
      });
    }

    try {
      aiIntelligence = await analyzeLeadIntelligence({
        lead: savedLead,
        aiExtraction,
        conversationMemory: existingConversation,
        agentSettings
      });

      if (aiIntelligence) {
        savedLead = await prisma.lead.update({
          where: {
            id: savedLead.id
          },
          data: {
            aiIntelligence,
            leadScore: aiIntelligence.leadScore,
            leadScoreLabel: aiIntelligence.leadScoreLabel,
            sentiment: aiIntelligence.sentiment,
            urgency: aiIntelligence.urgency,
            preferredLanguage: aiIntelligence.preferredLanguage || "en"
          }
        });

        await logEvent(prisma, {
          eventType: aiIntelligence.source === "openai" ? "ai_intelligence_success" : "ai_intelligence_fallback",
          agentId: savedLead.agentId,
          officeId: savedLead.officeId,
          leadId: savedLead.id,
          message:
            aiIntelligence.source === "openai"
              ? "AI intelligence completed."
              : "AI intelligence used heuristic fallback.",
          metadata: {
            source: aiIntelligence.source,
            leadScore: aiIntelligence.leadScore,
            leadScoreLabel: aiIntelligence.leadScoreLabel,
            sentiment: aiIntelligence.sentiment,
            urgency: aiIntelligence.urgency,
            preferredLanguage: aiIntelligence.preferredLanguage,
            aiError: aiIntelligence.aiError
          }
        });
      }
    } catch (intelligenceError) {
      console.error("Lead was saved, but AI intelligence failed:", {
        leadId: savedLead.id,
        message: intelligenceError.message,
        code: intelligenceError.code
      });

      await logEvent(prisma, {
        eventType: "ai_intelligence_failed",
        agentId: savedLead.agentId,
        officeId: savedLead.officeId,
        leadId: savedLead.id,
        message: "AI intelligence failed.",
        metadata: {
          errorMessage: intelligenceError.message,
          errorCode: intelligenceError.code
        }
      });
    }

    try {
      aiResponse = await generateLeadResponse(savedLead, aiExtraction, existingConversation, agentSettings, aiIntelligence);

      if (!aiResponse) {
        await logEvent(prisma, {
          eventType: "ai_response_failed",
          agentId: savedLead.agentId,
          officeId: savedLead.officeId,
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
          officeId: savedLead.officeId,
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
            officeId: savedLead.officeId,
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
            officeId: savedLead.officeId,
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
        officeId: savedLead.officeId,
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
        bookingFlow,
        aiIntelligence
      });

      console.log(`Conversation memory saved for lead ${savedLead.id}.`);
    } catch (memoryError) {
      console.error("Lead was saved, but conversation memory failed:", {
        leadId: savedLead.id,
        message: memoryError.message,
        code: memoryError.code
      });
    }

    let calendarIntegration = null;

    try {
      calendarIntegration = await createGoogleCalendarEventForLead({
        lead: savedLead,
        bookingFlow,
        agentSettings
      });

      if (calendarIntegration.eventCreated) {
        console.log(`Google Calendar event created for lead ${savedLead.id}.`);

        await logEvent(prisma, {
          eventType: "calendar_event_created",
          agentId: savedLead.agentId,
          officeId: savedLead.officeId,
          leadId: savedLead.id,
          message: "Google Calendar event created for showing follow-up.",
          metadata: {
            provider: calendarIntegration.provider,
            calendarId: calendarIntegration.calendarId,
            eventId: calendarIntegration.eventId,
            scheduledFor: calendarIntegration.scheduledFor
          }
        });

        if (conversation && calendarIntegration.eventId) {
          try {
            conversation = await prisma.conversation.update({
              where: {
                id: conversation.id
              },
              data: {
                calendarEventId: calendarIntegration.eventId,
                calendarEventLink: calendarIntegration.eventLink
              }
            });
          } catch (calendarMetadataError) {
            console.error("Calendar event was created, but conversation metadata update failed:", {
              leadId: savedLead.id,
              message: calendarMetadataError.message,
              code: calendarMetadataError.code
            });
          }
        }
      } else if (calendarIntegration.skippedReason !== "no_showing_request") {
        await logEvent(prisma, {
          eventType: "calendar_event_skipped",
          agentId: savedLead.agentId,
          officeId: savedLead.officeId,
          leadId: savedLead.id,
          message: "Google Calendar event creation skipped.",
          metadata: {
            provider: calendarIntegration.provider,
            enabled: calendarIntegration.enabled,
            skippedReason: calendarIntegration.skippedReason
          }
        });
      }
    } catch (calendarError) {
      calendarIntegration = {
        provider: "google_calendar",
        eventCreated: false,
        error: "calendar_event_failed"
      };

      console.error("Lead was saved, but Google Calendar event creation failed:", {
        leadId: savedLead.id,
        message: calendarError.message,
        code: calendarError.code,
        statusCode: calendarError.statusCode
      });

      await logEvent(prisma, {
        eventType: "calendar_event_failed",
        agentId: savedLead.agentId,
        officeId: savedLead.officeId,
        leadId: savedLead.id,
        message: "Google Calendar event creation failed.",
        metadata: {
          provider: calendarError.provider || "google_calendar",
          errorMessage: calendarError.message,
          statusCode: calendarError.statusCode,
          responseBody: calendarError.responseBody
        }
      });
    }

    let followUpReminderResult = null;

    try {
      followUpReminderResult = await scheduleFollowUpReminder(prisma, {
        lead: savedLead,
        conversation,
        bookingFlow,
        aiIntelligence
      });

      if (followUpReminderResult.reminderScheduled) {
        console.log(`Follow-up reminder scheduled for lead ${savedLead.id}.`);

        await logEvent(prisma, {
          eventType: "follow_up_reminder_scheduled",
          agentId: savedLead.agentId,
          officeId: savedLead.officeId,
          leadId: savedLead.id,
          message: "Follow-up reminder scheduled.",
          metadata: {
            reminderId: followUpReminderResult.reminder.id,
            reminderType: followUpReminderResult.reminder.reminderType,
            scheduledFor: followUpReminderResult.scheduledFor,
            delayHours: followUpReminderResult.delayHours
          }
        });

        if (conversation) {
          try {
            conversation = await prisma.conversation.update({
              where: {
                id: conversation.id
              },
              data: {
                followUpReminderAt: followUpReminderResult.scheduledFor,
                followUpReminderStatus: followUpReminderResult.reminder.status
              }
            });
          } catch (reminderMetadataError) {
            console.error("Reminder was scheduled, but conversation metadata update failed:", {
              leadId: savedLead.id,
              message: reminderMetadataError.message,
              code: reminderMetadataError.code
            });
          }
        }
      } else {
        await logEvent(prisma, {
          eventType: "follow_up_reminder_skipped",
          agentId: savedLead.agentId,
          officeId: savedLead.officeId,
          leadId: savedLead.id,
          message: "Follow-up reminder scheduling skipped.",
          metadata: {
            skippedReason: followUpReminderResult.skippedReason
          }
        });
      }
    } catch (reminderError) {
      followUpReminderResult = {
        reminderScheduled: false,
        error: "follow_up_reminder_failed"
      };

      console.error("Lead was saved, but follow-up reminder scheduling failed:", {
        leadId: savedLead.id,
        message: reminderError.message,
        code: reminderError.code
      });

      await logEvent(prisma, {
        eventType: "follow_up_reminder_failed",
        agentId: savedLead.agentId,
        officeId: savedLead.officeId,
        leadId: savedLead.id,
        message: "Follow-up reminder scheduling failed.",
        metadata: {
          errorMessage: reminderError.message,
          errorCode: reminderError.code
        }
      });
    }

    let emailSent = false;

    try {
      await sendLeadReplyEmail(savedLead, aiResponse);
      emailSent = true;
      console.log(`Lead reply email sent for lead ${savedLead.id}.`);

      await logEvent(prisma, {
        eventType: "email_auto_reply_sent",
        agentId: savedLead.agentId,
        officeId: savedLead.officeId,
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
        officeId: savedLead.officeId,
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
        aiIntelligence,
        aiResponse,
        conversation,
        agentSettings,
        calendarIntegration,
        followUpReminder: followUpReminderResult
      });
      agentNotificationSent = true;
      console.log(`Agent notification email sent for lead ${savedLead.id}.`);

      await logEvent(prisma, {
        eventType: "agent_notification_sent",
        agentId: savedLead.agentId,
        officeId: savedLead.officeId,
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
        officeId: savedLead.officeId,
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
      office,
      aiExtraction,
      aiIntelligence,
      aiResponse,
      aiResponseGuardrail,
      bookingFlow,
      calendarIntegration,
      followUpReminder: followUpReminderResult,
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
  addLeadNote,
  archiveLead,
  createLead,
  deleteLead,
  listLeads,
  updateLead
};
