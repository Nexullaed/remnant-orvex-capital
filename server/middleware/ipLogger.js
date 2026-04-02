const db = require("../config/db");

function sanitizeUrl(url = "") {
  return String(url || "").split("?")[0];
}

function shouldSkipPath(pathname) {
  return pathname.startsWith("/health") || pathname.startsWith("/client/");
}

// Logs IP, path, method, user (if available after route middlewares set req.user)
module.exports = function ipLogger(req, res, next) {
  const startedAt = Date.now();
  const clientIp = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || req.connection.remoteAddress;
  const pathname = sanitizeUrl(req.originalUrl || req.url);

  if (shouldSkipPath(pathname)) {
    return next();
  }

  res.on("finish", () => {
    const userId = req.user?.id || null;
    const durationMs = Date.now() - startedAt;
    db.query(
      `INSERT INTO request_logs (ip, path, method, status, user_id, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [clientIp, pathname, req.method, res.statusCode, userId, durationMs],
      (err) => {
        if (err) {
          // avoid breaking the app if table missing; log once per error type
          if (process.env.DEBUG_LOGGING) {
            console.warn("ipLogger insert skipped", err.code || err.message);
          }
        }
      }
    );
  });

  next();
};
