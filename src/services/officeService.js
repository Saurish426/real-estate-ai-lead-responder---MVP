const DEFAULT_ORGANIZATION_ID = 1;
const DEFAULT_OFFICE_ID = 1;

const DEFAULT_ORGANIZATION = {
  id: DEFAULT_ORGANIZATION_ID,
  name: "Demo Organization",
  slug: "demo-organization"
};

const DEFAULT_OFFICE = {
  id: DEFAULT_OFFICE_ID,
  organizationId: DEFAULT_ORGANIZATION_ID,
  name: "Demo Office",
  officeEmail: "",
  phone: "",
  brandName: "Real Estate Team",
  logoUrl: "",
  primaryColor: "#2563eb",
  secondaryColor: "#0f172a",
  websiteUrl: ""
};

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseOfficeId(value) {
  const officeId = Number(value);
  return Number.isInteger(officeId) && officeId > 0 ? officeId : DEFAULT_OFFICE_ID;
}

function getOfficeIdFromRequest(req) {
  if (req.auth && req.auth.officeId) {
    return parseOfficeId(req.auth.officeId);
  }

  return parseOfficeId(
    (req.body && req.body.officeId) ||
      (req.query && req.query.officeId) ||
      req.headers["x-office-id"]
  );
}

async function ensureDefaultOrganization(prisma) {
  return prisma.organization.upsert({
    where: {
      id: DEFAULT_ORGANIZATION_ID
    },
    update: {},
    create: DEFAULT_ORGANIZATION
  });
}

async function ensureDefaultOffice(prisma) {
  await ensureDefaultOrganization(prisma);

  return prisma.office.upsert({
    where: {
      id: DEFAULT_OFFICE_ID
    },
    update: {},
    create: DEFAULT_OFFICE
  });
}

async function getOfficeOrDefault(prisma, officeId = DEFAULT_OFFICE_ID) {
  await ensureDefaultOffice(prisma);

  const parsedOfficeId = parseOfficeId(officeId);
  const office = await prisma.office.findUnique({
    where: {
      id: parsedOfficeId
    },
    include: {
      organization: true
    }
  });

  return office || prisma.office.findUnique({
    where: {
      id: DEFAULT_OFFICE_ID
    },
    include: {
      organization: true
    }
  });
}

function normalizeOfficeInput(input = {}) {
  return {
    name: cleanString(input.name) || DEFAULT_OFFICE.name,
    officeEmail: cleanString(input.officeEmail),
    phone: cleanString(input.phone),
    brandName: cleanString(input.brandName) || DEFAULT_OFFICE.brandName,
    logoUrl: cleanString(input.logoUrl),
    primaryColor: cleanString(input.primaryColor) || DEFAULT_OFFICE.primaryColor,
    secondaryColor: cleanString(input.secondaryColor) || DEFAULT_OFFICE.secondaryColor,
    websiteUrl: cleanString(input.websiteUrl)
  };
}

async function saveOfficeSettings(prisma, input = {}, officeId = DEFAULT_OFFICE_ID) {
  await ensureDefaultOffice(prisma);

  const parsedOfficeId = parseOfficeId(officeId);
  const data = normalizeOfficeInput(input);

  return prisma.office.upsert({
    where: {
      id: parsedOfficeId
    },
    update: data,
    create: {
      id: parsedOfficeId,
      organizationId: DEFAULT_ORGANIZATION_ID,
      ...data
    },
    include: {
      organization: true
    }
  });
}

function formatOfficeForPrompt(office) {
  const safeOffice = {
    ...DEFAULT_OFFICE,
    ...(office || {})
  };

  return [
    `Office name: ${safeOffice.name}`,
    `Office email: ${safeOffice.officeEmail || "not provided"}`,
    `Office phone: ${safeOffice.phone || "not provided"}`,
    `Office brand name: ${safeOffice.brandName}`,
    `Office website: ${safeOffice.websiteUrl || "not provided"}`
  ].join("\n");
}

module.exports = {
  DEFAULT_OFFICE,
  DEFAULT_OFFICE_ID,
  DEFAULT_ORGANIZATION,
  DEFAULT_ORGANIZATION_ID,
  ensureDefaultOffice,
  ensureDefaultOrganization,
  formatOfficeForPrompt,
  getOfficeIdFromRequest,
  getOfficeOrDefault,
  parseOfficeId,
  saveOfficeSettings
};
