const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    response: {
      type: "string"
    }
  },
  required: ["response"]
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

function cleanGeneratedResponse(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

async function generateLeadResponse(lead, aiExtraction) {
  if (!process.env.OPENAI_API_KEY) {
    console.log("AI response generation skipped. Add OPENAI_API_KEY to .env to enable it.");
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
            "Write a short, professional real estate lead reply. Use a friendly tone, acknowledge the inquiry, and include one clear call to action. Keep it to 1 or 2 sentences. Do not invent property details or promise availability."
        },
        {
          role: "user",
          content: [
            `Lead message: ${lead.message}`,
            `AI extraction: ${JSON.stringify(aiExtraction || {})}`,
            "If the lead wants a showing, ask for their preferred showing time. If details are missing, ask one useful follow-up question."
          ].join("\n")
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "lead_response",
          strict: true,
          schema: RESPONSE_SCHEMA
        }
      }
    })
  });

  const responseBody = await response.json();

  if (!response.ok) {
    throw new Error(responseBody.error && responseBody.error.message ? responseBody.error.message : "OpenAI response generation failed.");
  }

  const outputText = getOutputText(responseBody);

  if (!outputText) {
    throw new Error("OpenAI response did not include generated reply JSON.");
  }

  const parsedResponse = JSON.parse(outputText);
  const generatedResponse = cleanGeneratedResponse(parsedResponse.response);

  if (!generatedResponse) {
    throw new Error("OpenAI generated an empty lead response.");
  }

  return generatedResponse;
}

module.exports = {
  generateLeadResponse
};
