const crypto = require("crypto");
const db = require("../config/db");

const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = Math.max(Number(process.env.OTP_MAX_ATTEMPTS || 5), 1);

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOtpCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

function normalizePhone(phone) {
  return String(phone || "").trim();
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function ensureOtpTables() {
  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      phone VARCHAR(32) NOT NULL,
      code_hash VARCHAR(64) NOT NULL,
      attempt_count INT NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_otp_phone (phone),
      INDEX idx_otp_expires_at (expires_at)
    )
  `);
}

async function issueOtp(phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new Error("Phone number is required");
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + TTL_MS);
  const codeHash = hashOtpCode(code);

  await db.promise().query(
    `
      INSERT INTO otp_codes (phone, code_hash, attempt_count, expires_at)
      VALUES (?, ?, 0, ?)
      ON DUPLICATE KEY UPDATE
        code_hash = VALUES(code_hash),
        attempt_count = 0,
        expires_at = VALUES(expires_at)
    `,
    [normalizedPhone, codeHash, expiresAt]
  );

  return code;
}

async function verifyOtp(phone, code) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return false;
  }

  const conn = await db.promise().getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `
        SELECT id, code_hash, attempt_count, expires_at
        FROM otp_codes
        WHERE phone = ?
        LIMIT 1
        FOR UPDATE
      `,
      [normalizedPhone]
    );

    if (!rows.length) {
      await conn.commit();
      return false;
    }

    const entry = rows[0];
    const expiresAt = new Date(entry.expires_at);
    if (expiresAt.getTime() <= Date.now()) {
      await conn.query("DELETE FROM otp_codes WHERE id = ?", [entry.id]);
      await conn.commit();
      return false;
    }

    const codeMatches = safeCompare(entry.code_hash, hashOtpCode(code));
    if (!codeMatches) {
      const nextAttemptCount = Number(entry.attempt_count || 0) + 1;
      if (nextAttemptCount >= MAX_ATTEMPTS) {
        await conn.query("DELETE FROM otp_codes WHERE id = ?", [entry.id]);
      } else {
        await conn.query("UPDATE otp_codes SET attempt_count = ? WHERE id = ?", [nextAttemptCount, entry.id]);
      }
      await conn.commit();
      return false;
    }

    await conn.query("DELETE FROM otp_codes WHERE id = ?", [entry.id]);
    await conn.commit();
    return true;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      // Ignore rollback errors and throw the original problem.
    }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { ensureOtpTables, issueOtp, verifyOtp };
