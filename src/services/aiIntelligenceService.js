const SCORE_LABELS = ["unqualified", "cold", "warm", "hot"];
const SENTIMENTS = ["positive", "neutral", "negative", "mixed"];
const URGENCY_LEVELS = ["low", "medium", "high"];

const INTELLIGENCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    leadScore: {
      type: "integer",
      minimum: 0,
      maximum: 100
    },
    leadScoreLabel: {
      type: "string",
      enum: SCORE_LABELS
    },
    sentiment: {
      type: "string",
      enum: SENTIMENTS
    },
    urgency: {
      type: "string",
      enum: URGENCY_LEVELS
    },
    urgencyReason: {
      type: "string"
    },
    followUpRecommendation: {
      type: "string"
    },
    recommendedNextAction: {
      type: "string"
    },
    followUpDelayHours: {
      type: "integer",
      minimum: 1,
      maximum: 168
    },
    preferredLanguage: {
      type: "string"
    },
    responseLanguage: {
      type: "string"
    },
    multilingualReady: {
      type: "boolean"
    },
    longTermMemoryUpdate: {
      type: "string"
    },
    keyFacts: {
      type: "array",
      items: {
        type: "string"
      }
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1
    }
  },
  required: [
    "leadScore",
    "leadScoreLabel",
    "sentiment",
    "urgency",
    "urgencyReason",
    "followUpRecommendation",
    "recommendedNextAction",
    "followUpDelayHours",
    "preferredLanguage",
    "responseLanguage",
    "multilingualReady",
    "longTermMemoryUpdate",
    "keyFacts",
    "confidence"
  ]
};

function getOpenAiModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getOutputText(responseBody) {
  if (typeof responseBody.output_text === "string") {
    return responseBody.output_text;
  }

  const outputText = [];

  (responseBody.output || []).forEach((item) => {
    (item.content || []).forEach((content) => {
      if (content.type === "output_text" && content.text) {
        outputText.push(content.text);
      }
    });
  });

  return outputText.join("");
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, number));
}

function roundConfidence(value) {
  return Math.round(clampNumber(value, 0.05, 0.99, 0.65) * 100) / 100;
}

function getLeadScoreLabel(score) {
  if (score >= 75) {
    return "hot";
  }

  if (score >= 50) {
    return "warm";
  }

  if (score >= 25) {
    return "cold";
  }

  return "unqualified";
}

function detectSentiment(message) {
  const text = cleanString(message).toLowerCase();
  const positive = /\b(interested|love|great|excited|perfect|thanks|thank you|available|like)\b/.test(text);
  const negative = /\b(frustrated|angry|upset|bad|terrible|confused|not happy|complaint)\b/.test(text);

  if (positive && negative) {
    return "mixed";
  }

  if (negative) {
    return "negative";
  }

  if (positive) {
    return "positive";
  }

  return "neutral";
}

function detectUrgency(message) {
  const text = cleanString(message).toLowerCase();

  if (/\b(asap|urgent|today|tonight|tomorrow|this weekend|weekend|immediately|right away)\b/.test(text)) {
    return {
      urgency: "high",
      urgencyReason: "Lead used time-sensitive language."
    };
  }

  if (/\b(soon|this week|next week|schedule|showing|tour|visit)\b/.test(text)) {
    return {
      urgency: "medium",
      urgencyReason: "Lead is asking about next steps or scheduling."
    };
  }

  return {
    urgency: "low",
    urgencyReason: "Lead did not include a time-sensitive request."
  };
}

function detectLanguage(message) {
  const text = cleanString(message).toLowerCase();

  if (/\b(hola|gracias|casa|propiedad|mostrar|visita)\b/.test(text)) {
    return "es";
  }

  if (/\b(bonjour|merci|maison|propriete|visite)\b/.test(text)) {
    return "fr";
  }

  return "en";
}

function getFollowUpDelayHours(urgency) {
  if (urgency === "high") {
    return 1;
  }

  if (urgency === "medium") {
    return 4;
  }

  return 24;
}

function buildKeyFacts(lead, aiExtraction) {
  const facts = [
    `Source: ${lead.source}`,
    `Intent: ${aiExtraction && aiExtraction.intent ? aiExtraction.intent : "unknown"}`
  ];

  if (aiExtraction && aiExtraction.wants_showing) {
    facts.push("Lead wants a showing.");
  }

  if (aiExtraction && aiExtraction.timeline && aiExtraction.timeline !== "unknown") {
    facts.push(`Timeline: ${aiExtraction.timeline}`);
  }

  if (aiExtraction && aiExtraction.budget && aiExtraction.budget !== "unknown") {
    facts.push(`Budget: ${aiExtraction.budget}`);
  }

  return facts;
}

function scoreLead(lead, aiExtraction, urgency) {
  const message = cleanString(lead.message).toLowerCase();
  let score = 25;

  if (aiExtraction && aiExtraction.intent && aiExtraction.intent !== "unknown") {
    score += 15;
  }

  if (aiExtraction && aiExtraction.wants_showing) {
    score += 25;
  }

  if (/\b(showing|tour|schedule|visit|see it|see the house|book)\b/.test(message)) {
    score += 15;
  }

  if (urgency === "high") {
    score += 15;
  } else if (urgency === "medium") {
    score += 8;
  }

  if (aiExtraction && aiExtraction.timeline && aiExtraction.timeline !== "unknown") {
    score += 7;
  }

  if (aiExtraction && aiExtraction.budget && aiExtraction.budget !== "unknown") {
    score += 5;
  }

  if (lead.phone && lead.phone !== "unknown") {
    score += 3;
  }

  return Math.round(clampNumber(score, 0, 100, 25));
}

function buildFollowUpRecommendation({ lead, aiExtraction, urgency, score }) {
  if (aiExtraction && aiExtraction.wants_showing) {
    return urgency === "high"
      ? "Prioritize this lead and ask for the best showing time today."
      : "Ask for preferred showing times and confirm the agent will follow up.";
  }

  if (score >= 75) {
    return "Send a personal follow-up and qualify timing, location, and budget.";
  }

  if (score >= 50) {
    return "Ask one clear qualifying question and offer next steps.";
  }

  return "Send a helpful follow-up and ask what information would be most useful.";
}

function buildRecommendedNextAction(aiExtraction, urgency) {
  if (aiExtraction && aiExtraction.wants_showing) {
    return urgency === "high" ? "Call or email quickly to coordinate showing times." : "Offer available showing windows.";
  }

  if (aiExtraction && aiExtraction.intent === "seller") {
    return "Ask about property address, timeline, and listing goals.";
  }

  if (aiExtraction && aiExtraction.intent === "buyer") {
    return "Ask about target area, budget, and timeline.";
  }

  return "Ask what the lead would like to do next.";
}

function buildLongTermMemoryUpdate({ lead, aiExtraction, score, label, sentiment, urgency, recommendation, keyFacts }) {
  return [
    `Lead ${lead.name} (${lead.email}) is a ${label} lead with score ${score}.`,
    `Sentiment: ${sentiment}. Urgency: ${urgency}.`,
    `Latest message: ${cleanString(lead.message)}`,
    `Recommended follow-up: ${recommendation}`,
    `Known facts: ${keyFacts.join(" ")}`,
    `Intent: ${aiExtraction && aiExtraction.intent ? aiExtraction.intent : "unknown"}`
  ].join("\n").slice(0, 3000);
}

function buildFallbackIntelligence({ lead, aiExtraction }) {
  const sentiment = detectSentiment(lead.message);
  const urgencyResult = detectUrgency(lead.message);
  const preferredLanguage = detectLanguage(lead.message);
  const score = scoreLead(lead, aiExtraction, urgencyResult.urgency);
  const leadScoreLabel = getLeadScoreLabel(score);
  const keyFacts = buildKeyFacts(lead, aiExtraction);
  const followUpRecommendation = buildFollowUpRecommendation({
    lead,
    aiExtraction,
    urgency: urgencyResult.urgency,
    score
  });

  return {
    leadScore: score,
    leadScoreLabel,
    sentiment,
    urgency: urgencyResult.urgency,
    urgencyReason: urgencyResult.urgencyReason,
    followUpRecommendation,
    recommendedNextAction: buildRecommendedNextAction(aiExtraction, urgencyResult.urgency),
    followUpDelayHours: getFollowUpDelayHours(urgencyResult.urgency),
    preferredLanguage,
    responseLanguage: preferredLanguage,
    multilingualReady: true,
    longTermMemoryUpdate: buildLongTermMemoryUpdate({
      lead,
      aiExtraction,
      score,
      label: leadScoreLabel,
      sentiment,
      urgency: urgencyResult.urgency,
      recommendation: followUpRecommendation,
      keyFacts
    }),
    keyFacts,
    confidence: roundConfidence(aiExtraction && aiExtraction.confidence ? aiExtraction.confidence : 0.68),
    source: "heuristic"
  };
}

function normalizeStringEnum(value, allowed, fallback) {
  const normalized = cleanString(value).toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeIntelligence(aiIntelligence, fallback) {
  const leadScore = Math.round(clampNumber(aiIntelligence.leadScore, 0, 100, fallback.leadScore));
  const leadScoreLabel = normalizeStringEnum(aiIntelligence.leadScoreLabel, SCORE_LABELS, getLeadScoreLabel(leadScore));
  const sentiment = normalizeStringEnum(aiIntelligence.sentiment, SENTIMENTS, fallback.sentiment);
  const urgency = normalizeStringEnum(aiIntelligence.urgency, URGENCY_LEVELS, fallback.urgency);
  const keyFacts = Array.isArray(aiIntelligence.keyFacts)
    ? aiIntelligence.keyFacts.map(cleanString).filter(Boolean).slice(0, 8)
    : fallback.keyFacts;

  return {
    leadScore,
    leadScoreLabel,
    sentiment,
    urgency,
    urgencyReason: cleanString(aiIntelligence.urgencyReason) || fallback.urgencyReason,
    followUpRecommendation: cleanString(aiIntelligence.followUpRecommendation) || fallback.followUpRecommendation,
    recommendedNextAction: cleanString(aiIntelligence.recommendedNextAction) || fallback.recommendedNextAction,
    followUpDelayHours: Math.round(clampNumber(aiIntelligence.followUpDelayHours, 1, 168, fallback.followUpDelayHours)),
    preferredLanguage: cleanString(aiIntelligence.preferredLanguage).toLowerCase() || fallback.preferredLanguage,
    responseLanguage: cleanString(aiIntelligence.responseLanguage).toLowerCase() || fallback.responseLanguage,
    multilingualReady: aiIntelligence.multilingualReady !== false,
    longTermMemoryUpdate: cleanString(aiIntelligence.longTermMemoryUpdate) || fallback.longTermMemoryUpdate,
    keyFacts,
    confidence: roundConfidence(aiIntelligence.confidence || fallback.confidence),
    source: "openai"
  };
}

function formatMemoryForPrompt(conversationMemory) {
  if (!conversationMemory) {
    return "No previous conversation memory.";
  }

  return [
    `Message count: ${conversationMemory.messageCount || 0}`,
    `Status: ${conversationMemory.status || "unknown"}`,
    `Summary: ${conversationMemory.aiSummary || "none"}`,
    `Long-term memory: ${conversationMemory.longTermMemory || "none"}`,
    `Follow-up recommendation: ${conversationMemory.followUpRecommendation || "none"}`
  ].join("\n");
}

async function analyzeLeadIntelligence({ lead, aiExtraction, conversationMemory, agentSettings } = {}) {
  const fallback = buildFallbackIntelligence({
    lead,
    aiExtraction
  });

  if (!process.env.OPENAI_API_KEY) {
    return fallback;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: getOpenAiModel(),
        input: [
          {
            role: "system",
            content:
              "Analyze this real estate lead for CRM intelligence. Return concise, safe JSON only. Score from 0 to 100. Detect sentiment, urgency, follow-up recommendation, response language, and a durable long-term memory update. Do not invent facts."
          },
          {
            role: "user",
            content: [
              `Lead: ${JSON.stringify(lead)}`,
              `Existing extraction: ${JSON.stringify(aiExtraction || {})}`,
              `Conversation memory:\n${formatMemoryForPrompt(conversationMemory)}`,
              `Preferred reply tone: ${agentSettings && agentSettings.preferredReplyTone ? agentSettings.preferredReplyTone : "friendly and professional"}`,
              `Heuristic baseline: ${JSON.stringify(fallback)}`
            ].join("\n")
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "lead_intelligence",
            strict: true,
            schema: INTELLIGENCE_SCHEMA
          }
        }
      })
    });
    const responseBody = await response.json();

    if (!response.ok) {
      throw new Error(responseBody.error && responseBody.error.message ? responseBody.error.message : "OpenAI intelligence request failed.");
    }

    const outputText = getOutputText(responseBody);

    if (!outputText) {
      throw new Error("OpenAI response did not include intelligence JSON.");
    }

    return normalizeIntelligence(JSON.parse(outputText), fallback);
  } catch (error) {
    return {
      ...fallback,
      source: "heuristic_after_ai_error",
      aiError: error.message
    };
  }
}

module.exports = {
  analyzeLeadIntelligence,
  buildFallbackIntelligence
};
