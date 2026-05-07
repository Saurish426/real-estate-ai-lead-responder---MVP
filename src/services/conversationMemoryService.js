function buildAiSummary({ previousSummary, incomingMessage, aiExtraction, aiResponse }) {
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

  return summaryParts.join("\n").slice(-4000);
}

async function findExistingLeadByEmail(prisma, email) {
  return prisma.lead.findFirst({
    where: {
      email
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

async function saveLeadForSubmission(prisma, lead) {
  const existingLead = await findExistingLeadByEmail(prisma, lead.email);

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

async function findConversationForLead(prisma, leadId) {
  return prisma.conversation.findFirst({
    where: {
      leadId
    },
    orderBy: {
      id: "desc"
    }
  });
}

async function updateConversationMemory(prisma, { lead, incomingMessage, aiExtraction, aiResponse, existingConversation }) {
  const conversation = existingConversation || (await findConversationForLead(prisma, lead.id));
  const messageCount = (conversation && conversation.messageCount ? conversation.messageCount : 0) + 1;
  const aiSummary = buildAiSummary({
    previousSummary: conversation && conversation.aiSummary,
    incomingMessage,
    aiExtraction,
    aiResponse
  });
  const data = {
    leadId: lead.id,
    lastMessage: aiResponse || incomingMessage,
    status: aiResponse ? "ai_generated" : "lead_received",
    messageCount,
    aiSummary
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
