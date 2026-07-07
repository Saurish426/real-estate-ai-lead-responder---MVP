const { DEFAULT_OFFICE_ID, ensureDefaultOffice, parseOfficeId } = require("./officeService");

const DEFAULT_AGENT_ID = 1;

const DEFAULT_DEMO_AGENT = {
  id: DEFAULT_AGENT_ID,
  officeId: DEFAULT_OFFICE_ID,
  name: "Demo Agent",
  email: "",
  phone: "",
  businessName: "Real Estate Team",
  teamRole: "admin",
  isActive: true
};

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseAgentId(value) {
  const agentId = Number(value);
  return Number.isInteger(agentId) && agentId > 0 ? agentId : DEFAULT_AGENT_ID;
}

function getAgentIdFromRequest(req) {
  if (req.auth && req.auth.agentId) {
    return parseAgentId(req.auth.agentId);
  }

  return parseAgentId(
    (req.body && req.body.agentId) ||
      (req.query && req.query.agentId) ||
      req.headers["x-agent-id"]
  );
}

async function ensureDefaultAgent(prisma) {
  await ensureDefaultOffice(prisma);

  return prisma.agent.upsert({
    where: {
      id: DEFAULT_AGENT_ID
    },
    update: {},
    create: DEFAULT_DEMO_AGENT
  });
}

async function getAgentOrDefault(prisma, agentId = DEFAULT_AGENT_ID) {
  await ensureDefaultAgent(prisma);

  const parsedAgentId = parseAgentId(agentId);
  const agent = await prisma.agent.findUnique({
    where: {
      id: parsedAgentId
    }
  });

  return agent || prisma.agent.findUnique({
    where: {
      id: DEFAULT_AGENT_ID
    }
  });
}

async function listAgents(prisma, { officeId = DEFAULT_OFFICE_ID, includeInactive = false } = {}) {
  await ensureDefaultAgent(prisma);

  return prisma.agent.findMany({
    where: {
      officeId: parseOfficeId(officeId),
      ...(includeInactive ? {} : { isActive: true })
    },
    orderBy: {
      id: "asc"
    }
  });
}

async function createAgent(prisma, input = {}, officeId = DEFAULT_OFFICE_ID) {
  await ensureDefaultAgent(prisma);

  const name = cleanString(input.name) || "Demo Agent";
  const parsedOfficeId = parseOfficeId(input.officeId || officeId);

  return prisma.agent.create({
    data: {
      officeId: parsedOfficeId,
      name,
      email: cleanString(input.email),
      phone: cleanString(input.phone),
      businessName: cleanString(input.businessName) || "Real Estate Team",
      teamRole: cleanString(input.teamRole) || "agent",
      isActive: input.isActive !== false
    }
  });
}

module.exports = {
  DEFAULT_AGENT_ID,
  DEFAULT_DEMO_AGENT,
  createAgent,
  getAgentIdFromRequest,
  getAgentOrDefault,
  listAgents,
  parseAgentId
};
