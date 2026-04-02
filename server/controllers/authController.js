const crypto = require("crypto");
const User = require("../models/userModel");
const db = require("../config/db");
const notificationService = require("../services/notificationService");
const { clearFailedLogins, getThrottleStatus, recordFailedLogin } = require("../services/authAttemptService");
const {
  attachSessionCookie,
  clearSessionCookie,
  createSession,
  normalizeUser,
  revokeAllSessionsForUser,
  revokeSession,
} = require("../services/authSessionService");
const { assertStrongPassword, hashPassword, verifyPassword } = require("../services/passwordService");
const { buildPasswordResetUrl, buildVerificationUrl, getPasswordResetTtlMs } = require("../config/auth");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || "").trim();
}

async function rollbackRegisteredUser(userId) {
  if (!userId) return;

  try {
    await db.promise().query("DELETE FROM email_verification_tokens WHERE user_id = ?", [userId]);
    await db.promise().query("DELETE FROM users WHERE id = ? LIMIT 1", [userId]);
  } catch (err) {
    console.error("User registration rollback failed:", err.message || err);
  }
}

function assertEmailDeliveryAvailable() {
  if (!notificationService.isEmailConfigured()) {
    const error = new Error("Email delivery is currently unavailable. Please try again later.");
    error.statusCode = 503;
    throw error;
  }
}

function createUser({ name, email, phone, passwordHash, role }) {
  return new Promise((resolve, reject) => {
    User.create(name, email, phone, passwordHash, role, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function createVerificationToken(userId) {
  return new Promise((resolve, reject) => {
    User.createVerificationToken(userId, (err, payload) => {
      if (err) return reject(err);
      resolve(payload);
    });
  });
}

function verifyEmailToken(token) {
  return new Promise((resolve, reject) => {
    User.verifyEmail(token, (err, user) => {
      if (err) return reject(err);
      resolve(user);
    });
  });
}

async function findUserByEmail(email) {
  const [rows] = await db.promise().query("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);

  return rows[0] || null;
}

async function sendVerificationEmail(req, email, token, expiresAt) {
  const verificationUrl = buildVerificationUrl(req, token);
  const message = [
    "Verify your Remnant Orvex Capital account.",
    `Verification link: ${verificationUrl}`,
    `This link expires at ${expiresAt.toISOString()}.`,
  ].join("\n");

  await notificationService.sendEmail(email, "Verify your email", message);
}

async function sendPasswordResetEmail(req, email, token, expiresAt) {
  const resetUrl = buildPasswordResetUrl(req, token);
  const minutes = Math.max(Math.ceil((expiresAt.getTime() - Date.now()) / 60000), 1);
  const messageLines = [
    "A password reset was requested for your Remnant Orvex Capital account.",
    `Reset link: ${resetUrl}`,
  ];

  messageLines.push(`This reset expires in ${minutes} minute(s).`);
  await notificationService.sendEmail(email, "Reset your password", messageLines.join("\n"));
}

const register = async (req, res) => {
  const { name, email, phone, password } = req.validated || req.body;
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  let createdUserId = null;

  try {
    assertEmailDeliveryAvailable();

    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    const [phoneRows] = await db.promise().query("SELECT id FROM users WHERE phone = ? LIMIT 1", [normalizedPhone]);
    if (phoneRows.length) {
      return res.status(409).json({ message: "Phone already registered" });
    }

    const passwordHash = await hashPassword(password);
    const result = await createUser({
      name: String(name || "").trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      passwordHash,
      role: "borrower",
    });
    createdUserId = result.insertId;

    const verification = await createVerificationToken(createdUserId);
    await sendVerificationEmail(req, normalizedEmail, verification.token, verification.expires);

    return res.status(201).json({
      message: "User registered successfully. Please verify your email before signing in.",
    });
  } catch (err) {
    if (createdUserId) {
      await rollbackRegisteredUser(createdUserId);
    }

    if (err?.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }

    if (err?.details?.length) {
      return res.status(400).json({
        message: "Password does not meet security requirements",
        errors: err.details,
      });
    }

    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "User already exists" });
    }

    console.error("Registration failed:", err.message || err);
    return res.status(500).json({ message: "Unable to register user at this time" });
  }
};

const verifyEmail = async (req, res) => {
  const token = String(req.validated?.token || req.validatedQuery?.token || req.query?.token || "").trim();
  if (!token) {
    return res.status(400).json({ message: "Verification token required" });
  }

  try {
    await verifyEmailToken(token);
    return res.json({ message: "Email verified successfully" });
  } catch (err) {
    return res.status(400).json({ message: "Invalid or expired verification token" });
  }
};

const resendVerificationEmail = async (req, res) => {
  const { email } = req.validated || req.body;
  const normalizedEmail = normalizeEmail(email);

  try {
    assertEmailDeliveryAvailable();

    const user = await findUserByEmail(normalizedEmail);
    if (user && !user.email_verified) {
      const verification = await createVerificationToken(user.id);
      await sendVerificationEmail(req, normalizedEmail, verification.token, verification.expires);
    }
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error("Resend verification failed:", err.message || err);
    return res.status(500).json({ message: "Unable to resend verification email at this time" });
  }

  return res.json({
    message: "If that account exists and is unverified, a new verification email has been sent.",
  });
};

const login = async (req, res) => {
  const { email, password } = req.validated || req.body;
  const normalizedEmail = normalizeEmail(email);
  const throttle = await getThrottleStatus(normalizedEmail, req.ip);

  if (throttle.blocked) {
    if (throttle.retryAfterSeconds) {
      res.set("Retry-After", String(throttle.retryAfterSeconds));
    }
    return res.status(429).json({ message: "Too many failed login attempts. Please try again later." });
  }

  try {
    const user = await findUserByEmail(normalizedEmail);
    const passwordMatches = user ? await verifyPassword(password, user.password) : false;

    if (!user || !passwordMatches) {
      const failure = await recordFailedLogin(normalizedEmail, req.ip);
      if (failure.retryAfterSeconds) {
        res.set("Retry-After", String(failure.retryAfterSeconds));
      }
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.email_verified) {
      return res.status(403).json({ message: "Please verify your email before signing in" });
    }

    const normalizedAuthUser = normalizeUser(user);
    const session = await createSession(normalizedAuthUser, {
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    attachSessionCookie(res, session.token, req);
    await clearFailedLogins(normalizedEmail, req.ip);

    return res.json({
      message: "Login successful",
      auth_claims: session.claims,
      session_expires_at: session.expiresAt.toISOString(),
      user: normalizedAuthUser,
    });
  } catch (err) {
    console.error("Login failed:", err.message || err);
    return res.status(500).json({ message: "Unable to sign in at this time" });
  }
};

const logout = async (req, res) => {
  try {
    await revokeSession(req.auth?.sessionId);
  } catch (err) {
    console.error("Logout failed:", err.message || err);
  }

  clearSessionCookie(res, req);
  return res.json({ message: "Logged out successfully" });
};

const me = async (req, res) => {
  return res.json({
    authenticated: true,
    auth_claims: req.auth?.claims || null,
    session_expires_at: req.auth?.expiresAt ? new Date(req.auth.expiresAt).toISOString() : null,
    user: req.user ? normalizeUser(req.user) : null,
  });
};

const requestPasswordReset = async (req, res) => {
  const { email } = req.validated || req.body || {};
  const normalizedEmail = normalizeEmail(email);

  try {
    assertEmailDeliveryAvailable();

    const user = await findUserByEmail(normalizedEmail);
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(token);
      const expires = new Date(Date.now() + getPasswordResetTtlMs());

      await db.promise().query("UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0", [user.id]);
      await db.promise().query(
        "INSERT INTO password_resets (user_id, token_hash, expires_at, used) VALUES (?, ?, ?, 0)",
        [user.id, tokenHash, expires]
      );

      await sendPasswordResetEmail(req, normalizedEmail, token, expires);
    }
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    console.error("Password reset request failed:", err.message || err);
    return res.status(500).json({ message: "Unable to start password reset at this time" });
  }

  return res.json({
    message: "If the account exists, password reset instructions have been sent.",
  });
};

const resetPassword = async (req, res) => {
  const { token, password } = req.validated || req.body || {};
  const tokenHash = hashToken(token);

  try {
    assertStrongPassword(password);

    const [rows] = await db.promise().query(
      `
        SELECT id, user_id
        FROM password_resets
        WHERE token_hash = ?
          AND used = 0
          AND expires_at > NOW()
        ORDER BY id DESC
        LIMIT 1
      `,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    const reset = rows[0];
    const passwordHash = await hashPassword(password);

    await db.promise().query("UPDATE users SET password = ? WHERE id = ?", [passwordHash, reset.user_id]);
    await db.promise().query("UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0", [reset.user_id]);
    await revokeAllSessionsForUser(reset.user_id);

    clearSessionCookie(res, req);
    return res.json({ message: "Password updated successfully. Please sign in again." });
  } catch (err) {
    if (err?.details?.length) {
      return res.status(400).json({
        message: "Password does not meet security requirements",
        errors: err.details,
      });
    }

    console.error("Password reset failed:", err.message || err);
    return res.status(500).json({ message: "Unable to reset password at this time" });
  }
};

async function ensureBootstrapAdmin() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL);
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!email || !password) return;

  try {
    assertStrongPassword(password);
  } catch (err) {
    console.error("Bootstrap admin skipped:", err.message || err);
    return;
  }

  try {
    const [rows] = await db.promise().query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (rows.length) return;

    const passwordHash = await hashPassword(password);
    const attempts = [
      {
        sql: `
          INSERT INTO users (
            name,
            email,
            phone,
            password,
            role,
            email_verified,
            verification_level,
            phone_verified,
            campus_verified,
            campus_verification_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: ["Administrator", email, "", passwordHash, "admin", 1, 3, 1, 1, "APPROVED"],
      },
      {
        sql: `
          INSERT INTO users (
            name,
            email,
            phone,
            password,
            role,
            email_verified,
            verification_level,
            phone_verified
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: ["Administrator", email, "", passwordHash, "admin", 1, 3, 1],
      },
      {
        sql: `
          INSERT INTO users (
            name,
            email,
            password,
            role,
            email_verified,
            verification_level,
            phone_verified
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        params: ["Administrator", email, passwordHash, "admin", 1, 3, 1],
      },
      {
        sql: `
          INSERT INTO users (name, email, password, role, email_verified)
          VALUES (?, ?, ?, ?, ?)
        `,
        params: ["Administrator", email, passwordHash, "admin", 1],
      },
      {
        sql: "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
        params: ["Administrator", email, passwordHash, "admin"],
      },
    ];

    let inserted = false;
    let lastErr = null;

    for (const attempt of attempts) {
      try {
        await db.promise().query(attempt.sql, attempt.params);
        inserted = true;
        break;
      } catch (err) {
        lastErr = err;
        if (err?.code !== "ER_BAD_FIELD_ERROR") {
          break;
        }
      }
    }

    if (!inserted) {
      throw lastErr;
    }

    console.log("Bootstrap admin created:", email);
  } catch (err) {
    console.error("Bootstrap admin failed", err.message || err);
  }
}

module.exports = {
  ensureBootstrapAdmin,
  login,
  logout,
  me,
  register,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  verifyEmail,
};

