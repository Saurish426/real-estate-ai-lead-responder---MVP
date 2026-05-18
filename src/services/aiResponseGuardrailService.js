const SAFE_FALLBACK_RESPONSE = "Thanks for reaching out! I’ll have the agent follow up shortly with the best next steps.";

const GUARDRAIL_RULES = [
  {
    reason: "confirmed_showing",
    pattern: /\b(showing|tour|appointment|booking)\b.{0,80}\b(confirmed|booked|locked in|set for|scheduled for)\b|\b(confirmed|booked|locked in|set for|scheduled for)\b.{0,80}\b(showing|tour|appointment|booking)\b|\bsee you at\b/i
  },
  {
    reason: "legal_advice",
    pattern: /\b(legal advice|lawyer|attorney|lawsuit|sue|evict|eviction|contract clause|legal right|zoning law|disclosure law)\b/i
  },
  {
    reason: "mortgage_or_financial_advice",
    pattern: /\b(financial advice|mortgage advice|best mortgage|best loan|guaranteed rate|guaranteed return|you will qualify|you are approved|you can afford|investment return|make an offer immediately)\b/i
  },
  {
    reason: "aggressive_pressure",
    pattern: /\b(act now|last chance|must act|must sign today|do not wait|limited time|you will lose it|pressure you|urgent offer)\b/i
  },
  {
    reason: "fair_housing_risk",
    pattern: /\b(no|not for|avoid|prefer|preferred|only|exclude|perfect for|ideal for)\b.{0,50}\b(children|kids|families|family|race|religion|muslim|christian|jewish|disabled|disability|wheelchair|nationality|ethnicity|ethnic|pregnant|seniors|elderly)\b|\b(safe neighborhood|unsafe neighborhood|good for families|family friendly neighborhood)\b/i
  }
];

const AVAILABILITY_CLAIM_PATTERN =
  /\b(still available|currently available|definitely available|available right now|available for sale|property is available|home is available|house is available|not available|already sold|off market)\b/i;

function hasAvailabilityClaim(response) {
  return AVAILABILITY_CLAIM_PATTERN.test(response);
}

function checkAiResponseGuardrails(response, options = {}) {
  if (typeof response !== "string" || response.trim() === "") {
    return {
      isSafe: true,
      violations: []
    };
  }

  const violations = GUARDRAIL_RULES
    .filter((rule) => rule.pattern.test(response))
    .map((rule) => rule.reason);

  if (!options.availabilityExplicitlyProvided && hasAvailabilityClaim(response)) {
    violations.push("unsupported_availability_claim");
  }

  return {
    isSafe: violations.length === 0,
    violations
  };
}

function applyAiResponseGuardrails(response, options = {}) {
  const guardrailResult = checkAiResponseGuardrails(response, options);

  if (guardrailResult.isSafe) {
    return {
      response,
      wasBlocked: false,
      violations: []
    };
  }

  return {
    response: SAFE_FALLBACK_RESPONSE,
    wasBlocked: true,
    violations: guardrailResult.violations
  };
}

module.exports = {
  SAFE_FALLBACK_RESPONSE,
  applyAiResponseGuardrails,
  checkAiResponseGuardrails
};
