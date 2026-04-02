const fs = require("fs");
const path = require("path");
const mysql = require("mysql2");
require("dotenv").config();

// Prefer least-privilege app credentials when provided
const dbUser = process.env.APP_DB_USER || process.env.DB_USER;
const dbPassword = process.env.APP_DB_PASSWORD || process.env.DB_PASSWORD;

// Optional TLS configuration
const sslMode = (process.env.DB_SSL_MODE || "").toLowerCase(); // required | verify_ca | preferred | disabled
let sslConfig = undefined;
if (sslMode && sslMode !== "disabled") {
  const caPath = process.env.DB_SSL_CA && path.resolve(process.env.DB_SSL_CA);
  const certPath = process.env.DB_SSL_CERT && path.resolve(process.env.DB_SSL_CERT);
  const keyPath = process.env.DB_SSL_KEY && path.resolve(process.env.DB_SSL_KEY);
  const explicitRejectUnauthorized = String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "")
    .trim()
    .toLowerCase();

  const ssl = {};
  if (caPath && fs.existsSync(caPath)) ssl.ca = fs.readFileSync(caPath);
  if (certPath && fs.existsSync(certPath)) ssl.cert = fs.readFileSync(certPath);
  if (keyPath && fs.existsSync(keyPath)) ssl.key = fs.readFileSync(keyPath);

  let rejectUnauthorized = false;
  if (sslMode === "verify_ca") {
    rejectUnauthorized = explicitRejectUnauthorized !== "false";
    if (!ssl.ca) {
      console.warn("DB_SSL_MODE=verify_ca is set but DB_SSL_CA was not provided. Certificate validation may fail.");
    }
  } else if (explicitRejectUnauthorized === "true") {
    if (sslMode === "required" || sslMode === "preferred") {
      console.warn(
        `Ignoring DB_SSL_REJECT_UNAUTHORIZED=true because DB_SSL_MODE=${sslMode} does not validate server certificates. ` +
          "Use DB_SSL_MODE=verify_ca with DB_SSL_CA for strict certificate validation."
      );
    }
  }

  sslConfig = {
    ...ssl,
    rejectUnauthorized,
  };
}

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: dbUser,
  password: dbPassword,
  database: process.env.DB_NAME,
  connectTimeout: Math.max(Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000), 1000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  multipleStatements: false, // guard against injection
  ssl: sslConfig,
});

db.getConnection((err, conn) => {
  if (err) {
    console.error("Database connection failed:", err.message || err);
    return;
  }
  console.log("Connected to MySQL database (pooled)");
  conn.release();
});

module.exports = db;
