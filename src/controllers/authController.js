const { getPrismaClient } = require("../db");
const {
  clearSessionCookie,
  createSession,
  getSafeUser,
  loginUser,
  logoutSession,
  setSessionCookie,
  signUpUser
} = require("../services/authService");

async function signUp(req, res) {
  try {
    const prisma = getPrismaClient();
    const { user, agent } = await signUpUser(prisma, req.body);
    const { token } = await createSession(prisma, user.id);

    setSessionCookie(res, token);

    return res.status(201).json({
      user: getSafeUser(user),
      agent
    });
  } catch (error) {
    const isDuplicateEmail = error.code === "P2002";
    const statusCode = isDuplicateEmail ? 409 : error.statusCode || 500;

    console.error("Signup failed:", {
      message: error.message,
      code: error.code
    });

    return res.status(statusCode).json({
      error: isDuplicateEmail ? "An account with this email already exists." : error.message || "Unable to sign up."
    });
  }
}

async function login(req, res) {
  try {
    const prisma = getPrismaClient();
    const user = await loginUser(prisma, req.body);
    const { token } = await createSession(prisma, user.id);

    setSessionCookie(res, token);

    return res.json({
      user: getSafeUser(user)
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;

    console.error("Login failed:", {
      message: error.message,
      code: error.code
    });

    return res.status(statusCode).json({
      error: statusCode === 401 ? "Invalid email or password." : "Unable to log in."
    });
  }
}

async function logout(req, res) {
  try {
    const prisma = getPrismaClient();
    await logoutSession(prisma, req);
  } catch (error) {
    console.error("Logout cleanup failed:", {
      message: error.message,
      code: error.code
    });
  }

  clearSessionCookie(res);

  return res.json({
    ok: true
  });
}

function me(req, res) {
  return res.json({
    authenticated: Boolean(req.auth && req.auth.user),
    user: req.auth && req.auth.user ? req.auth.user : null
  });
}

module.exports = {
  login,
  logout,
  me,
  signUp
};
