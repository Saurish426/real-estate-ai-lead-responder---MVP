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

function normalizeExtraction(extraction) {
  const intent = ALLOWED_INTENTS.includes(extraction.intent) ? extraction.intent : "unknown";
  const confidence = Number(extraction.confidence);

  return {
    intent,
    wants_showing: extraction.wants_showing === true,
    timeline: typeof extraction.timeline === "string" ? extraction.timeline : "unknown",
    budget: typeof extraction.budget === "string" ? extraction.budget : "unknown",
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0
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
            "Extract structured real estate lead details. Return only the requested JSON fields."
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

  return normalizeExtraction(JSON.parse(outputText));
}

module.exports = {
  extractLeadDetails
};
