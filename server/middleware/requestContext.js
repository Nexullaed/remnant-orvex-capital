const crypto = require("crypto");
const { logInfo } = require("../services/logger");
const runtimeState = require("../services/runtimeState");

function sanitizeUrl(url = "") {
  return String(url || "").split("?")[0];
}

function normalizeRequestId(value) {
  const normalized = String(value || "")
    .trim()
    .slice(0, 100);

  if (!normalized || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function generateRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

function shouldSkipRequestLog(pathname) {
  return pathname.startsWith("/health") || pathname.startsWith("/client/");
}

module.exports = function requestContext(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const pathname = sanitizeUrl(req.originalUrl || req.url || "");
  const requestId = normalizeRequestId(req.get("x-request-id")) || generateRequestId();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  runtimeState.recordRequestStart();

  let finalized = false;
  const finalize = (event) => {
    if (finalized) return;
    finalized = true;
    runtimeState.recordRequestEnd();

    if (shouldSkipRequestLog(pathname)) {
      return;
    }

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logInfo(event, {
      duration_ms: Number(durationMs.toFixed(2)),
      ip: req.ip,
      method: req.method,
      path: pathname,
      request_id: requestId,
      status: res.statusCode,
      user_id: req.user?.id || null,
    });
  };

  res.on("finish", () => finalize("http_request"));
  res.on("close", () => {
    if (!res.writableEnded) {
      finalize("http_request_aborted");
    }
  });

  next();
};
