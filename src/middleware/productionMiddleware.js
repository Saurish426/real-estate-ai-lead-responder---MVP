const crypto = require("crypto");

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 120;
const DEFAULT_LEAD_RATE_LIMIT_MAX_REQUESTS = 30;
const MAX_RATE_LIMIT_BUCKETS = 5000;

const buckets = new Map();

function parsePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function getClientKey(req) {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket.remoteAddress || "unknown";
}

function isLeadWriteRequest(req) {
  return req.method === "POST" && req.path === "/api/leads";
}

function getRateLimitMax(req) {
  if (isLeadWriteRequest(req)) {
    return parsePositiveInteger(process.env.LEAD_RATE_LIMIT_MAX_REQUESTS, DEFAULT_LEAD_RATE_LIMIT_MAX_REQUESTS);
  }

  return parsePositiveInteger(process.env.RATE_LIMIT_MAX_REQUESTS, DEFAULT_RATE_LIMIT_MAX_REQUESTS);
}

function cleanupOldBuckets(now) {
  if (buckets.size < MAX_RATE_LIMIT_BUCKETS) {
    return;
  }

  buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  });
}

function securityHeaders(req, res, next) {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    "img-src 'self' data: https://images.unsplash.com",
    "font-src 'self' https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'"
  ];

  if (process.env.NODE_ENV === "production") {
    csp.push("upgrade-insecure-requests");
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }

  res.setHeader("Content-Security-Policy", csp.join("; "));
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Frame-Options", "DENY");

  next();
}

function requestLogger(req, res, next) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;

    console.info("request_completed", {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs
    });
  });

  next();
}

function rateLimiter(req, res, next) {
  if (req.path === "/health" || req.path === "/ready") {
    return next();
  }

  const now = Date.now();
  const windowMs = parsePositiveInteger(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS);
  const maxRequests = getRateLimitMax(req);
  const key = `${getClientKey(req)}:${isLeadWriteRequest(req) ? "lead-write" : "default"}`;
  const existingBucket = buckets.get(key);
  const bucket = existingBucket && existingBucket.resetAt > now
    ? existingBucket
    : {
      count: 0,
      resetAt: now + windowMs
    };

  bucket.count += 1;
  buckets.set(key, bucket);
  cleanupOldBuckets(now);

  const remaining = Math.max(maxRequests - bucket.count, 0);
  const retryAfterSeconds = Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1);

  res.setHeader("RateLimit-Limit", String(maxRequests));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > maxRequests) {
    res.setHeader("Retry-After", String(retryAfterSeconds));

    return res.status(429).json({
      error: "Too many requests. Please wait and try again."
    });
  }

  return next();
}

module.exports = {
  rateLimiter,
  requestLogger,
  securityHeaders
};
