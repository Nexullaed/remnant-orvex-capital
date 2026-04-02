const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const {
  getClearedSessionCookieOptions,
  getCookieName,
  getJwtSecret,
  getSessionCookieOptions,
  getSessionTtlMs,
} = require("../config/auth");

const AUTH_ISSUER = "remnant-orvex-capital";
const AUTH_AUDIENCE = "remnant-orvex-capital-client";

function createSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

function sanitizeHeaderValue(value, maxLength = 255) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeRoleClaim(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUser(row) {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone || null,
    role: String(row.role || "borrower").toLowerCase(),
    email_verified: Boolean(Number(row.email_verified || 0)),
    verification_level: Number(row.verification_level || 0),
    phone_verified: Boolean(Number(row.phone_verified || 0)),
    campus_verified: Boolean(Number(row.campus_verified || 0)),
  };
}

async function columnExists(tableName, columnName) {
  const [rows] = await db.promise().query(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName]
  );

  return rows.length > 0;
}

async function ensureUsersTableColumns() {
  if (!(await columnExists("users", "email_verified"))) {
    await db.promise().query("ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0");
  }
}

async function ensureAuthTables() {
  await ensureUsersTableColumns();

  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      user_id INT NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME NULL,
      ip_address VARCHAR(45) NULL,
      user_agent VARCHAR(255) NULL,
      UNIQUE KEY uniq_auth_session_id (session_id),
      INDEX idx_auth_sessions_user_id (user_id),
      INDEX idx_auth_sessions_expires_at (expires_at)
    )
  `);

  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_email_verification_token_hash (token_hash),
      INDEX idx_email_verification_user_id (user_id),
      INDEX idx_email_verification_expires_at (expires_at)
    )
  `);

  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(128) NOT NULL,
      expires_at DATETIME NOT NULL,
      used TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_password_resets_user_id (user_id),
      INDEX idx_password_resets_token_hash (token_hash)
    )
  `);
}

async function createSession(user, context = {}) {
  const normalizedUser = normalizeUser(user);
  const userId = normalizedUser.id;
  const sessionId = createSessionId();
  const expiresAt = new Date(Date.now() + getSessionTtlMs());

  await db.promise().query(
    `
      INSERT INTO auth_sessions (session_id, user_id, expires_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      sessionId,
      userId,
      expiresAt,
      context.ipAddress || null,
      sanitizeHeaderValue(context.userAgent) || null,
    ]
  );

  const claims = {
    id: userId,
    role: normalizedUser.role,
  };

  const token = jwt.sign(
    { sub: String(userId), sid: sessionId, typ: "session", role: claims.role },
    getJwtSecret(),
    {
      audience: AUTH_AUDIENCE,
      issuer: AUTH_ISSUER,
      expiresIn: Math.floor(getSessionTtlMs() / 1000),
    }
  );

  return { token, expiresAt, sessionId, claims };
}

async function verifySessionToken(token) {
  const payload = jwt.verify(token, getJwtSecret(), {
    audience: AUTH_AUDIENCE,
    issuer: AUTH_ISSUER,
  });

  if (payload.typ !== "session" || !payload.sid || !payload.sub) {
    return null;
  }

  const userId = Number(payload.sub);
  if (!Number.isFinite(userId)) {
    return null;
  }

  const [sessionRows] = await db.promise().query(
    `
      SELECT session_id, user_id, expires_at, revoked_at
      FROM auth_sessions
      WHERE session_id = ? AND user_id = ?
      LIMIT 1
    `,
    [payload.sid, userId]
  );

  if (!sessionRows.length) {
    return null;
  }

  const session = sessionRows[0];
  if (session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
    return null;
  }

  const [userRows] = await db.promise().query("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);

  if (!userRows.length) {
    return null;
  }

  const normalizedUser = normalizeUser(userRows[0]);
  const tokenRole = normalizeRoleClaim(payload.role);

  if (tokenRole && tokenRole !== normalizedUser.role) {
    return null;
  }

  db.promise()
    .query("UPDATE auth_sessions SET last_seen_at = NOW() WHERE session_id = ?", [payload.sid])
    .catch(() => {});

  return {
    session: {
      sessionId: payload.sid,
      expiresAt: session.expires_at,
      claims: {
        id: userId,
        role: normalizedUser.role,
      },
    },
    user: normalizedUser,
  };
}

async function revokeSession(sessionId) {
  if (!sessionId) return;
  await db.promise().query(
    "UPDATE auth_sessions SET revoked_at = NOW() WHERE session_id = ? AND revoked_at IS NULL",
    [sessionId]
  );
}

async function revokeAllSessionsForUser(userId) {
  if (!userId) return;
  await db.promise().query(
    "UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL",
    [userId]
  );
}

function attachSessionCookie(res, token, req) {
  res.cookie(getCookieName(), token, getSessionCookieOptions(req));
}

function clearSessionCookie(res, req) {
  res.clearCookie(getCookieName(), getClearedSessionCookieOptions(req));
}

module.exports = {
  attachSessionCookie,
  clearSessionCookie,
  createSession,
  ensureAuthTables,
  normalizeUser,
  revokeAllSessionsForUser,
  revokeSession,
  verifySessionToken,
};
