const ALLOWED_INTENTS = ["buyer", "seller", "showing_request", "info_request", "unknown"];

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ALLOWED_INTENTS
    },
    wants_showing: {
      type: "boolean"
    },
    timeline: {
      type: "string"
    },
    budget: {
      type: "string"
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1
    }
  },
  required: ["intent", "wants_showing", "timeline", "budget", "confidence"]
};

function getOpenAiModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
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

function hasMeaningfulText(value) {
  return typeof value === "string" && value.trim() !== "" && value.trim().toLowerCase() !== "unknown";
}

function normalizeText(value) {
  return hasMeaningfulText(value) ? value.trim() : "unknown";
}

function roundConfidence(value) {
  return Math.round(value * 100) / 100;
}

function estimateConfidence(lead, extraction) {
  const message = `${lead.message || ""}`.toLowerCase();
  const intent = ALLOWED_INTENTS.includes(extraction.intent) ? extraction.intent : "unknown";
  let score = 0.4;

  if (intent !== "unknown") {
    score += 0.18;
  }

  if (extraction.wants_showing === true) {
    score += 0.18;
  }

  if (hasMeaningfulText(extraction.timeline)) {
    score += 0.08;
  }

  if (hasMeaningfulText(extraction.budget)) {
    score += 0.04;
  }

  if (/\b(showing|tour|schedule|visit|see it|see the house)\b/.test(message)) {
    score += 0.12;
  }

  if (/\b(available|interested|house|home|property)\b/.test(message)) {
    score += 0.08;
  }

  return roundConfidence(Math.max(0.25, Math.min(0.95, score)));
}

function normalizeConfidence(value, lead, extraction) {
  const numericConfidence = Number(value);
  let confidence = numericConfidence;

  if (Number.isFinite(numericConfidence) && numericConfidence > 1 && numericConfidence <= 100) {
    confidence = numericConfidence / 100;
  }

  if (Number.isFinite(confidence) && confidence > 0 && confidence < 1) {
    return roundConfidence(confidence);
  }

  if (confidence === 1) {
    return 0.99;
  }

  return estimateConfidence(lead, extraction);
}

function normalizeExtraction(extraction, lead) {
  const intent = ALLOWED_INTENTS.includes(extraction.intent) ? extraction.intent : "unknown";

  return {
    intent,
    wants_showing: extraction.wants_showing === true,
    timeline: normalizeText(extraction.timeline),
    budget: normalizeText(extraction.budget),
    confidence: normalizeConfidence(extraction.confidence, lead, extraction)
  };
}

async function extractLeadDetails(lead) {
  if (!process.env.OPENAI_API_KEY) {
    console.log("AI extraction skipped. Add OPENAI_API_KEY to .env to enable it.");
    return null;
  }

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
            "Extract structured real estate lead details. Return only the requested JSON fields. Confidence must be a decimal greater than 0 and less than 1 when extraction succeeds."
        },
        {
          role: "user",
          content: [
            `Name: ${lead.name}`,
            `Email: ${lead.email}`,
            `Phone: ${lead.phone}`,
            `Source: ${lead.source}`,
            `Message: ${lead.message}`
          ].join("\n")
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "lead_extraction",
          strict: true,
          schema: EXTRACTION_SCHEMA
        }
      }
    })
  });

  const responseBody = await response.json();

  if (!response.ok) {
    throw new Error(responseBody.error && responseBody.error.message ? responseBody.error.message : "OpenAI request failed.");
  }

  const outputText = getOutputText(responseBody);

  if (!outputText) {
    throw new Error("OpenAI response did not include extraction JSON.");
  }

  return normalizeExtraction(JSON.parse(outputText), lead);
}

module.exports = {
  extractLeadDetails
};
