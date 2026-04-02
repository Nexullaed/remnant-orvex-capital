const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");
function sanitizeUrl(url = "") {
  return String(url || "").split("?")[0];
}

function getLogFilePath() {
  const datePart = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `audit-${datePart}.log`);
}

// Ensure log directory exists
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (err) {
  console.error("Failed to create audit log directory:", err.message || err);
}

/**
 * Basic audit logger for sensitive routes.
 * Records: timestamp, method, path, status, ip, user id/email (if available).
 */
function auditLogger({ includePrefixes = ["/api/auth", "/api/loans"] } = {}) {
  return (req, res, next) => {
    const url = sanitizeUrl(req.originalUrl || req.url || "");
    const shouldLog = includePrefixes.some((p) => url.startsWith(p));
    if (!shouldLog) return next();

    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      const entry = {
        ts: new Date().toISOString(),
        method: req.method,
        path: url,
        request_id: req.requestId || null,
        status: res.statusCode,
        ms: duration,
        ip: req.ip || req.connection?.remoteAddress,
        user: req.user
          ? { id: req.user.id, email: req.user.email, role: req.user.role }
          : null,
      };
      fs.appendFile(getLogFilePath(), JSON.stringify(entry) + "\n", (err) => {
        if (err) console.error("Audit log write failed:", err.message || err);
      });
    });

    next();
  };
}

module.exports = auditLogger;
