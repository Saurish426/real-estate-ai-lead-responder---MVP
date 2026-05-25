const DEFAULT_TEST_EMAIL_DOMAIN = "example.com";

function printHelp() {
  console.log(`
Usage:
  PUBLIC_APP_URL="https://your-public-url" DEPLOY_TEST_EMAIL="you@example.com" npm run verify:deployment
  npm run verify:deployment -- https://your-public-url

Optional:
  DEPLOY_TEST_EMAIL=you@example.com
  DEPLOY_TEST_CALENDAR_LINK=https://calendly.com/demo-agent/showing
`);
}

function getPublicAppUrl() {
  const value = process.env.PUBLIC_APP_URL || process.argv[2];

  if (!value || value.trim() === "") {
    throw new Error("Set PUBLIC_APP_URL or pass the deployed URL as the first argument.");
  }

  return value.trim().replace(/\/+$/, "");
}

function buildTestEmail() {
  const testEmail = process.env.DEPLOY_TEST_EMAIL;
  const timestamp = Date.now();

  if (!testEmail || !testEmail.includes("@")) {
    return `deployment-test-${timestamp}@${DEFAULT_TEST_EMAIL_DOMAIN}`;
  }

  const [localPart, domain] = testEmail.split("@");
  return `${localPart}+deploy-${timestamp}@${domain}`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json();

  return {
    body,
    ok: response.ok,
    status: response.status
  };
}

async function requestText(url) {
  const response = await fetch(url);
  const body = await response.text();

  return {
    body,
    ok: response.ok,
    status: response.status
  };
}

function isPresent(value) {
  return value !== undefined && value !== null && value !== "";
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const baseUrl = getPublicAppUrl();
  const testEmail = buildTestEmail();
  const calendarLink = process.env.DEPLOY_TEST_CALENDAR_LINK || "https://calendly.com/demo-agent/showing";

  const [homepage, dashboard, health] = await Promise.all([
    requestText(`${baseUrl}/`),
    requestText(`${baseUrl}/dashboard`),
    requestJson(`${baseUrl}/health`)
  ]);

  const settingsResponse = await requestJson(`${baseUrl}/api/settings`, {
    method: "POST",
    body: JSON.stringify({
      agentName: "Deployment Demo Agent",
      agentEmail: "",
      agentPhone: "555-0100",
      businessName: "Deployment Demo Realty",
      calendarLink,
      preferredReplyTone: "friendly and professional"
    })
  });

  const leadResponse = await requestJson(`${baseUrl}/api/leads`, {
    method: "POST",
    body: JSON.stringify({
      name: "Deployment Demo Lead",
      email: testEmail,
      phone: "1234567890",
      message: "Hi, I am interested in the house. Is it still available? I would like to schedule a showing this weekend.",
      source: "deployment-test"
    })
  });

  const dashboardData = await requestJson(`${baseUrl}/api/leads`);
  const savedLeadId = leadResponse.body && leadResponse.body.lead && leadResponse.body.lead.id;
  const savedLead = (dashboardData.body.leads || []).find((lead) => lead.id === savedLeadId);
  const aiExtraction = leadResponse.body.aiExtraction || {};
  const bookingFlow = leadResponse.body.bookingFlow || {};

  const checks = {
    healthCheckWorks: health.ok && health.body.status === "ok",
    homepageLoadsPublicly: homepage.ok && homepage.body.includes("AI Lead Responder"),
    dashboardLoadsPublicly: dashboard.ok && dashboard.body.includes("Lead Dashboard"),
    settingsWorksPublicly: settingsResponse.ok && settingsResponse.body.settings && settingsResponse.body.settings.calendarLink === calendarLink,
    leadFormWorksPublicly: leadResponse.status === 201 && Boolean(savedLeadId),
    aiExtractionWorksPublicly: isPresent(aiExtraction.intent) && aiExtraction.wants_showing === true && isPresent(aiExtraction.confidence),
    aiResponseWorksPublicly: isPresent(leadResponse.body.aiResponse),
    customerEmailWorksPublicly: leadResponse.body.emailSent === true,
    bookingFlowWorksPublicly: bookingFlow.bookingRequested === true && bookingFlow.bookingLinkSent === true,
    dashboardUpdatesPublicly: Boolean(savedLead),
    dashboardShowsAiAndBooking: Boolean(savedLead && savedLead.wantsShowing === true && savedLead.bookingRequested === true)
  };

  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  console.log(JSON.stringify({
    publicUrl: baseUrl,
    checks,
    passed: failedChecks.length === 0,
    failedChecks
  }, null, 2));

  if (failedChecks.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: "Deployment verification failed.",
    message: error.message
  }, null, 2));
  process.exit(1);
});
