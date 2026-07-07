function buildAiSummary({ previousSummary, incomingMessage, aiExtraction, aiResponse, bookingFlow, aiIntelligence }) {
  const summaryParts = [];

  if (previousSummary) {
    summaryParts.push(`Previous summary: ${previousSummary}`);
  }

  summaryParts.push(`Latest lead message: ${incomingMessage}`);

  if (aiExtraction) {
    summaryParts.push(
      [
        `Intent: ${aiExtraction.intent}`,
        `Wants showing: ${aiExtraction.wants_showing}`,
        `Timeline: ${aiExtraction.timeline}`,
        `Budget: ${aiExtraction.budget}`,
        `Confidence: ${aiExtraction.confidence}`
      ].join("; ")
    );
  }

  if (aiResponse) {
    summaryParts.push(`Latest AI response: ${aiResponse}`);
  }

  if (aiIntelligence) {
    summaryParts.push(
      [
        `Lead score: ${aiIntelligence.leadScore}`,
        `Score label: ${aiIntelligence.leadScoreLabel}`,
        `Sentiment: ${aiIntelligence.sentiment}`,
        `Urgency: ${aiIntelligence.urgency}`,
        `Language: ${aiIntelligence.preferredLanguage || "en"}`,
        `Recommendation: ${aiIntelligence.followUpRecommendation}`
      ].join("; ")
    );
  }

  if (bookingFlow && bookingFlow.bookingRequested) {
    summaryParts.push(
      [
        `Booking status: ${bookingFlow.bookingStatus}`,
        `Booking requested: ${bookingFlow.bookingRequested}`,
        `Booking link sent: ${bookingFlow.bookingLinkSent}`
      ].join("; ")
    );
  }

  return summaryParts.join("\n").slice(-4000);
}

function buildLongTermMemory({ previousLongTermMemory, incomingMessage, aiExtraction, aiResponse, aiIntelligence, bookingFlow }) {
  const memoryParts = [];

  if (previousLongTermMemory) {
    memoryParts.push(previousLongTermMemory);
  }

  if (aiIntelligence && aiIntelligence.longTermMemoryUpdate) {
    memoryParts.push(aiIntelligence.longTermMemoryUpdate);
  } else {
    memoryParts.push(`Latest lead message: ${incomingMessage}`);
  }

  if (aiExtraction) {
    memoryParts.push(
      [
        `Current intent: ${aiExtraction.intent}`,
        `Wants showing: ${aiExtraction.wants_showing}`,
        `Timeline: ${aiExtraction.timeline}`,
        `Budget: ${aiExtraction.budget}`
      ].join("; ")
    );
  }

  if (bookingFlow && bookingFlow.bookingRequested) {
    memoryParts.push(`Booking workflow: ${bookingFlow.bookingStatus || "showing_requested"}`);
  }

  if (aiResponse) {
    memoryParts.push(`Latest response sent or drafted: ${aiResponse}`);
  }

  return memoryParts.join("\n---\n").slice(-6000);
}

function resolveConversationStatus({ aiResponse, bookingFlow }) {
  if (bookingFlow && bookingFlow.bookingStatus === "booked") {
    return "booked";
  }

  if (bookingFlow && bookingFlow.bookingRequested) {
    return "showing_requested";
  }

  return aiResponse ? "ai_generated" : "lead_received";
}

async function findExistingLeadByEmail(prisma, email, agentId = 1) {
  return prisma.lead.findFirst({
    where: {
      email,
      agentId
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

async function saveLeadForSubmission(prisma, lead) {
  const existingLead = await findExistingLeadByEmail(prisma, lead.email, lead.agentId);

  if (!existingLead) {
    const savedLead = await prisma.lead.create({
      data: lead
    });

    return {
      savedLead,
      isExistingLead: false
    };
  }

  const savedLead = await prisma.lead.update({
    where: {
      id: existingLead.id
    },
    data: {
      name: lead.name,
      phone: lead.phone,
      message: lead.message,
      source: lead.source
    }
  });

  return {
    savedLead,
    isExistingLead: true
  };
}

async function findConversationForLead(prisma, leadId, agentId = 1) {
  return prisma.conversation.findFirst({
    where: {
      leadId,
      agentId
    },
    orderBy: {
      id: "desc"
    }
  });
}

async function updateConversationMemory(
  prisma,
  { lead, incomingMessage, aiExtraction, aiResponse, existingConversation, bookingFlow, aiIntelligence }
) {
  const conversation = existingConversation || (await findConversationForLead(prisma, lead.id, lead.agentId));
  const messageCount = (conversation && conversation.messageCount ? conversation.messageCount : 0) + 1;
  const aiSummary = buildAiSummary({
    previousSummary: conversation && conversation.aiSummary,
    incomingMessage,
    aiExtraction,
    aiResponse,
    bookingFlow,
    aiIntelligence
  });
  const longTermMemory = buildLongTermMemory({
    previousLongTermMemory: conversation && conversation.longTermMemory,
    incomingMessage,
    aiExtraction,
    aiResponse,
    aiIntelligence,
    bookingFlow
  });
  const data = {
    agentId: lead.agentId || 1,
    leadId: lead.id,
    lastMessage: aiResponse || incomingMessage,
    status: resolveConversationStatus({
      aiResponse,
      bookingFlow
    }),
    messageCount,
    aiSummary,
    longTermMemory,
    followUpRecommendation: aiIntelligence
      ? aiIntelligence.followUpRecommendation
      : conversation && conversation.followUpRecommendation
        ? conversation.followUpRecommendation
        : null,
    bookingStatus: bookingFlow ? bookingFlow.bookingStatus : "none",
    bookingRequested: bookingFlow ? bookingFlow.bookingRequested : false,
    bookingLinkSent: bookingFlow ? bookingFlow.bookingLinkSent : false
  };

  if (!conversation) {
    return prisma.conversation.create({
      data
    });
  }

  return prisma.conversation.update({
    where: {
      id: conversation.id
    },
    data
  });
}

module.exports = {
  findConversationForLead,
  saveLeadForSubmission,
  updateConversationMemory
};
