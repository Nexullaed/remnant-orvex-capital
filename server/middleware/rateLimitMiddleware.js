const { consumeWindow, ensureRateLimitTables } = require("../services/rateLimitStore");

function normalizeKeyPart(value, maxLength = 120) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function getIpKey(req) {
  return normalizeKeyPart((req.headers["x-forwarded-for"] || "").split(",")[0] || req.ip || "unknown", 80) || "unknown";
}

function authKeyGenerator(req) {
  const email = normalizeKeyPart(req.body?.email || "");
  return [getIpKey(req), email].filter(Boolean).join(":");
}

function applyStandardHeaders(res, limit, outcome) {
  res.set("RateLimit-Limit", String(limit));
  res.set("RateLimit-Remaining", String(outcome.remaining));
  if (outcome.retryAfterSeconds) {
    res.set("Retry-After", String(outcome.retryAfterSeconds));
    res.set("RateLimit-Reset", String(Math.ceil(outcome.resetAt.getTime() / 1000)));
  }
}

function createRateLimiter({ scope, windowMs, max, message, keyGenerator = getIpKey }) {
  return async (req, res, next) => {
    try {
      const bucketKey = normalizeKeyPart(keyGenerator(req), 180) || getIpKey(req);
      const outcome = await consumeWindow({
        scope,
        bucketKey,
        windowMs,
        maxHits: max,
      });

      applyStandardHeaders(res, max, outcome);
      if (outcome.blocked) {
        return res.status(429).json(message);
      }

      return next();
    } catch (err) {
      console.error(`${scope} limiter failed:`, err.message || err);
      return next();
    }
  };
}

const generalLimiter = createRateLimiter({
  scope: "general",
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Too many requests, please try again later" },
});

const loginLimiter = createRateLimiter({
  scope: "auth_login",
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many attempts, please try again later" },
});

const registerLimiter = createRateLimiter({
  scope: "auth_register",
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { message: "Too many registrations from this IP, try later" },
});

const passwordResetRequestLimiter = createRateLimiter({
  scope: "auth_password_reset_request",
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { message: "Too many password reset requests, please try again later" },
  keyGenerator: authKeyGenerator,
});

const passwordResetConfirmLimiter = createRateLimiter({
  scope: "auth_password_reset_confirm",
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many password reset attempts, please try again later" },
});

const verificationLimiter = createRateLimiter({
  scope: "auth_email_verification",
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: "Too many verification requests, please try again later" },
  keyGenerator: authKeyGenerator,
});

const otpLimiter = createRateLimiter({
  scope: "auth_otp",
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many OTP requests, please try again later" },
});

const loanLimiter = createRateLimiter({
  scope: "loan_create",
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { message: "Too many loan requests, slow down" },
});

module.exports = {
  ensureRateLimitTables,
  generalLimiter,
  loginLimiter,
  loanLimiter,
  otpLimiter,
  passwordResetConfirmLimiter,
  passwordResetRequestLimiter,
  registerLimiter,
  verificationLimiter,
};
