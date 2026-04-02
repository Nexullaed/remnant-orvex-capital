const { clearWindow, consumeWindow, ensureRateLimitTables, getWindowStatus } = require("./rateLimitStore");

const WINDOW_MS = Math.max(Number(process.env.LOGIN_ATTEMPT_WINDOW_MINUTES || 15), 1) * 60 * 1000;
const MAX_FAILURES = Math.max(Number(process.env.LOGIN_MAX_FAILURES || 5), 1);
const SCOPE = "auth_failed_login";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getKey(email, ipAddress) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedIp = String(ipAddress || "unknown").trim().toLowerCase();
  return `${normalizedEmail}:${normalizedIp}`;
}

async function getThrottleStatus(email, ipAddress) {
  const entry = await getWindowStatus({ scope: SCOPE, bucketKey: getKey(email, ipAddress) });
  if (!entry) {
    return { blocked: false, remaining: MAX_FAILURES };
  }

  const retryAfterMs = Math.max(entry.expiresAt.getTime() - Date.now(), 0);
  return {
    blocked: entry.hitCount >= MAX_FAILURES,
    remaining: Math.max(MAX_FAILURES - entry.hitCount, 0),
    retryAfterMs,
    retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
  };
}

async function recordFailedLogin(email, ipAddress) {
  const outcome = await consumeWindow({
    scope: SCOPE,
    bucketKey: getKey(email, ipAddress),
    windowMs: WINDOW_MS,
    maxHits: MAX_FAILURES,
  });

  return {
    blocked: outcome.hitCount >= MAX_FAILURES,
    remaining: outcome.remaining,
    retryAfterMs: outcome.retryAfterMs,
    retryAfterSeconds: outcome.retryAfterSeconds,
  };
}

async function clearFailedLogins(email, ipAddress) {
  await clearWindow({ scope: SCOPE, bucketKey: getKey(email, ipAddress) });
}

module.exports = {
  clearFailedLogins,
  ensureAuthAttemptTables: ensureRateLimitTables,
  getThrottleStatus,
  recordFailedLogin,
};
