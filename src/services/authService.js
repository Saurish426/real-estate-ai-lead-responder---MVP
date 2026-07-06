const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE_NAME = "ai_lead_session";
const SESSION_DAYS = 7;
const PASSWORD_KEY_LENGTH = 64;

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(email) {
  return cleanString(email).toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8;
}

function getSafeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    agentId: user.agentId,
    name: user.name,
    email: user.email
  };
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH);

  return {
    hash: derivedKey.toString("hex"),
    salt
  };
}

async function verifyPassword(password, salt, storedHash) {
  if (!password || !salt || !storedHash) {
    return false;
  }

  const { hash } = await hashPassword(password, salt);
  const expected = Buffer.from(storedHash, "hex");
  const actual = Buffer.from(hash, "hex");

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((cookies, cookie) => {
      const equalsIndex = cookie.indexOf("=");

      if (equalsIndex === -1) {
        return cookies;
      }

      const key = decodeURIComponent(cookie.slice(0, equalsIndex));
      const value = decodeURIComponent(cookie.slice(equalsIndex + 1));
      cookies[key] = value;
      return cookies;
    }, {});
}

function getSessionTokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[SESSION_COOKIE_NAME] || "";
}

function getSessionExpiresAt() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

function buildCookie(value, options = {}) {
  const segments = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax"
  ];

  if (process.env.NODE_ENV === "production") {
    segments.push("Secure");
  }

  if (options.maxAge !== undefined) {
    segments.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }

  return segments.join("; ");
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", buildCookie(token, {
    maxAge: SESSION_DAYS * 24 * 60 * 60
  }));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", buildCookie("", {
    maxAge: 0,
    expires: new Date(0)
  }));
}

async function createSession(prisma, userId) {
  const token = crypto.randomBytes(48).toString("hex");
  const session = await prisma.session.create({
    data: {
      id: crypto.randomUUID(),
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt: getSessionExpiresAt()
    }
  });

  return {
    session,
    token
  };
}

async function findSessionUser(prisma, token) {
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: {
      tokenHash: hashSessionToken(token)
    },
    include: {
      user: true
    }
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({
      where: {
        id: session.id
      }
    }).catch(() => null);
    return null;
  }

  return session.user;
}

async function getAuthenticatedUser(prisma, req) {
  const token = getSessionTokenFromRequest(req);
  return findSessionUser(prisma, token);
}

async function signUpUser(prisma, { name, email, password }) {
  const cleanName = cleanString(name);
  const cleanEmail = normalizeEmail(email);

  if (!cleanName || !isValidEmail(cleanEmail) || !validatePassword(password)) {
    const error = new Error("Name, valid email, and password of at least 8 characters are required.");
    error.statusCode = 400;
    throw error;
  }

  const { hash, salt } = await hashPassword(password);

  return prisma.$transaction(async (tx) => {
    const agent = await tx.agent.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        businessName: `${cleanName}'s Realty Team`
      }
    });
    const user = await tx.user.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        passwordHash: hash,
        passwordSalt: salt,
        agentId: agent.id
      }
    });

    return {
      agent,
      user
    };
  });
}

async function loginUser(prisma, { email, password }) {
  const cleanEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: {
      email: cleanEmail
    }
  });
  const isValid = user ? await verifyPassword(password, user.passwordSalt, user.passwordHash) : false;

  if (!isValid) {
    const error = new Error("Invalid email or password.");
    error.statusCode = 401;
    throw error;
  }

  return user;
}

async function logoutSession(prisma, req) {
  const token = getSessionTokenFromRequest(req);

  if (!token) {
    return;
  }

  await prisma.session.deleteMany({
    where: {
      tokenHash: hashSessionToken(token)
    }
  });
}

module.exports = {
  clearSessionCookie,
  createSession,
  getAuthenticatedUser,
  getSafeUser,
  loginUser,
  logoutSession,
  setSessionCookie,
  signUpUser
};
