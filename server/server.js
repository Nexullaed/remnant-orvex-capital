const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ quiet: true });
const db = require("./config/db");
const { assertAuthConfiguration, getCookieName, getPublicApiUrl } = require("./config/auth");

const authRoutes = require("./routes/authRoutes");
const loanRoutes = require("./routes/loanRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const kycRoutes = require("./routes/kycRoutes");
const adminRoutes = require("./routes/adminRoutes");
const borrowerRoutes = require("./routes/borrowerRoutes");
const collateralRoutes = require("./routes/collateralRoutes");
const userRoutes = require("./routes/userRoutes");
const requestContext = require("./middleware/requestContext");
const ipLogger = require("./middleware/ipLogger");
const auditLogger = require("./middleware/auditLogger");
const { ensureRateLimitTables } = require("./middleware/rateLimitMiddleware");
const { ensureBootstrapAdmin } = require("./controllers/authController");
const { ensureAuthTables } = require("./services/authSessionService");
const { ensureOtpTables } = require("./services/otpService");
const { ensurePaymentSecurityTables } = require("./services/paymentService");
const { logError, logInfo, logWarn, serializeError } = require("./services/logger");
const runtimeState = require("./services/runtimeState");

const app = express();
app.disable("x-powered-by");
let server = null;
let shutdownPromise = null;
const PORT = process.env.PORT || 5000;
const SHUTDOWN_TIMEOUT_MS = Math.max(Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000), 1000);

function normalizeOrigin(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`.replace(/\/+$/, "");
  } catch (_) {
    return "";
  }
}

const allowedOrigins = Array.from(
  new Set(
    [
      process.env.CORS_ORIGIN,
      process.env.FRONTEND_URL,
      process.env.PUBLIC_APP_URL,
      process.env.PUBLIC_API_URL,
      process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "",
      process.env.NODE_ENV !== "production" ? "http://127.0.0.1:3000" : "",
      process.env.NODE_ENV !== "production" ? "http://localhost:5173" : "",
      process.env.NODE_ENV !== "production" ? "http://127.0.0.1:5173" : "",
    ]
      .flatMap((value) => String(value || "").split(","))
      .map((value) => normalizeOrigin(value))
      .filter(Boolean)
  )
);

const csrfTrustedOrigins = Array.from(
  new Set(
    [getPublicApiUrl(), ...allowedOrigins]
      .map((value) => normalizeOrigin(value))
      .filter(Boolean)
  )
);

if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

function setSecurityHeaders(req, res, next) {
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
}

function enforceCookieCsrf(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  const cookieHeader = String(req.headers.cookie || "");
  if (!cookieHeader.includes(`${getCookieName()}=`)) {
    return next();
  }

  const origin = normalizeOrigin(req.get("origin"));
  const refererOrigin = normalizeOrigin(req.get("referer"));
  const requestOrigin = origin || refererOrigin;

  if (!requestOrigin) {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ message: "Cross-site request rejected" });
    }
    return next();
  }

  if (!csrfTrustedOrigins.includes(requestOrigin)) {
    return res.status(403).json({ message: "Cross-site request rejected" });
  }

  return next();
}

function startJobs() {
  if (String(process.env.JOB_RUNNER || "").trim().toLowerCase() !== "true") {
    logInfo("jobs_disabled", { reason: "JOB_RUNNER_not_true" });
    return;
  }

  const jobModules = [
    "./jobs/loanCronJob",
    "./jobs/loanRecoveryJob",
    "./jobs/interestAccrualJob",
    "./jobs/notificationJob",
    "./jobs/overdueReminderJob",
  ];

  for (const jobModule of jobModules) {
    require(jobModule);
  }

  logInfo("jobs_enabled", { count: jobModules.length });
}

app.use(setSecurityHeaders);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalizedOrigin = normalizeOrigin(origin);
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(requestContext);
app.use(enforceCookieCsrf);
app.use((req, res, next) => {
  if (!runtimeState.snapshot().shutting_down) {
    return next();
  }

  if (req.path === "/health" || req.path === "/health/live" || req.path === "/health/ready") {
    return next();
  }

  res.setHeader("Connection", "close");
  return res.status(503).json({ message: "Server is shutting down. Please retry shortly." });
});
app.use(express.json({ limit: "10kb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "10kb", parameterLimit: 20 }));
app.use(ipLogger);
app.use(auditLogger());

app.use(
  "/client",
  express.static(path.join(__dirname, "..", "client"), {
    extensions: ["html"],
  })
);

app.get("/", (req, res) => {
  res.send("Remnant Orvex Capital API Running");
});

async function buildHealthPayload() {
  try {
    await db.promise().query("SELECT 1");
    const snapshot = runtimeState.snapshot();
    return {
      statusCode: snapshot.ready ? 200 : 503,
      payload: {
        ...snapshot,
        database: "connected",
        job_runner_enabled: String(process.env.JOB_RUNNER || "").trim().toLowerCase() === "true",
        status: snapshot.ready ? "ok" : "starting",
      },
    };
  } catch (error) {
    return {
      statusCode: 503,
      payload: {
        ...runtimeState.snapshot(),
        database: "disconnected",
        job_runner_enabled: String(process.env.JOB_RUNNER || "").trim().toLowerCase() === "true",
        status: "error",
      },
    };
  }
}

app.get("/health/live", (req, res) => {
  res.status(200).json({
    ...runtimeState.snapshot(),
    status: "alive",
  });
});

app.get("/health/ready", async (req, res) => {
  const health = await buildHealthPayload();
  res.status(health.statusCode).json(health.payload);
});

app.get("/health", async (req, res) => {
  const health = await buildHealthPayload();
  res.status(health.statusCode).json({
    ...health.payload,
    api: "running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/borrower", borrowerRoutes);
app.use("/api/collateral", collateralRoutes);
app.use("/api/users", userRoutes);
app.use((req, res) => res.status(404).json({ message: "Route not found", request_id: req.requestId || null }));

app.use((err, req, res, next) => {
  if (err?.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    return res.status(err.statusCode).json({ message: err.message || "Invalid request" });
  }

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ message: "Malformed JSON payload" });
  }

  logError("request_unhandled_error", {
    error: serializeError(err),
    method: req.method,
    path: req.originalUrl || req.url,
    request_id: req.requestId || null,
  });

  if (process.env.NODE_ENV === "production") {
    return res.status(500).json({ message: "An internal server error occurred.", request_id: req.requestId || null });
  }

  return res.status(500).json({ message: err.message, error: err.stack, request_id: req.requestId || null });
});

function closeDbPool() {
  return new Promise((resolve) => {
    db.end((err) => {
      if (err) {
        logError("db_pool_close_failed", { error: serializeError(err) });
      } else {
        logInfo("db_pool_closed");
      }
      resolve();
    });
  });
}

async function shutdown(signal, err) {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    runtimeState.beginShutdown();
    logWarn("shutdown_started", {
      error: err ? serializeError(err) : null,
      signal,
    });

    const forceExitTimer = setTimeout(() => {
      logError("shutdown_forced", { signal, timeout_ms: SHUTDOWN_TIMEOUT_MS });
      process.exit(err ? 1 : 0);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    if (server?.listening) {
      await new Promise((resolve) => {
        server.close((closeErr) => {
          if (closeErr) {
            logError("server_close_failed", { error: serializeError(closeErr) });
          } else {
            logInfo("server_closed");
          }
          resolve();
        });
      });
    } else if (server) {
      logWarn("server_close_skipped", { reason: "server_not_listening" });
    }

    await closeDbPool();
    clearTimeout(forceExitTimer);
    logInfo("shutdown_complete", { signal });
    process.exit(err ? 1 : 0);
  })();

  return shutdownPromise;
}

process.on("SIGINT", () => {
  shutdown("SIGINT").catch(() => {});
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch(() => {});
});

process.on("unhandledRejection", (reason) => {
  logError("process_unhandled_rejection", {
    error: reason instanceof Error ? serializeError(reason) : { message: String(reason) },
  });
});

process.on("uncaughtException", (err) => {
  logError("process_uncaught_exception", { error: serializeError(err) });
  shutdown("uncaughtException", err).catch(() => {
    process.exit(1);
  });
});

async function startServer() {
  try {
    runtimeState.setStartupStage("database_connectivity_check");
    await db.promise().query("SELECT 1");
    runtimeState.setStartupStage("auth_configuration");
    assertAuthConfiguration();
    runtimeState.setStartupStage("ensure_rate_limits");
    await ensureRateLimitTables();
    runtimeState.setStartupStage("ensure_auth_tables");
    await ensureAuthTables();
    runtimeState.setStartupStage("ensure_otp_tables");
    await ensureOtpTables();
    runtimeState.setStartupStage("ensure_payment_security");
    await ensurePaymentSecurityTables();
    runtimeState.setStartupStage("bootstrap_admin");
    await ensureBootstrapAdmin();
    runtimeState.setStartupStage("jobs_startup");
    startJobs();
    runtimeState.setStartupStage("listen");

    server = app.listen(PORT, () => {
      runtimeState.markReady();
      logInfo("server_started", { port: PORT });
    });
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
    server.requestTimeout = 30000;
    server.on("error", (err) => {
      runtimeState.markNotReady(err, "listen_failed");
      logError("server_runtime_error", { error: serializeError(err) });
      shutdown("server_error", err).catch(() => {
        process.exit(1);
      });
    });
  } catch (err) {
    runtimeState.markNotReady(err, "startup_failed");
    logError("server_startup_failed", { error: serializeError(err) });
    process.exit(1);
  }
}

startServer();
