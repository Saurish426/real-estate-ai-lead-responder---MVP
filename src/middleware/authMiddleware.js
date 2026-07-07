const { getPrismaClient } = require("../db");
const { getAuthenticatedUser, getSafeUser } = require("../services/authService");

async function loadAuth(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const user = await getAuthenticatedUser(prisma, req);

    req.auth = user
      ? {
        user: getSafeUser(user),
          agentId: user.agentId || 1,
          officeId: user.officeId || 1
        }
      : null;
  } catch (error) {
    console.error("Session lookup failed:", {
      message: error.message,
      code: error.code
    });
    req.auth = null;
  }

  next();
}

function requireApiAuth(req, res, next) {
  if (req.auth && req.auth.user) {
    return next();
  }

  return res.status(401).json({
    error: "Authentication required."
  });
}

function requirePageAuth(req, res, next) {
  if (req.auth && req.auth.user) {
    return next();
  }

  return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl || "/dashboard")}`);
}

function redirectIfAuthenticated(req, res, next) {
  if (req.auth && req.auth.user) {
    return res.redirect("/dashboard");
  }

  return next();
}

module.exports = {
  loadAuth,
  redirectIfAuthenticated,
  requireApiAuth,
  requirePageAuth
};
