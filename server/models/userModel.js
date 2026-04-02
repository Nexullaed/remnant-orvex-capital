const db = require("../config/db");
const crypto = require('crypto');
const { getEmailVerificationTtlMs } = require("../config/auth");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const User = {
  create: (name, email, phone, password, role, callback) => {
    // Try widest insert first; gracefully fall back if older schema lacks columns.
    const attempts = [
      {
        sql: `
          INSERT INTO users (name, email, phone, password, role, email_verified, phone_verified, campus_verified, campus_verification_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: [name, email, phone, password, role, 0, 0, 0, "PENDING"],
      },
      {
        sql: `
          INSERT INTO users (name, email, phone, password, role, email_verified, phone_verified)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        params: [name, email, phone, password, role, 0, 0],
      },
      {
        sql: `
          INSERT INTO users (name, email, phone, password, role)
          VALUES (?, ?, ?, ?, ?)
        `,
        params: [name, email, phone, password, role],
      },
      {
        sql: `
          INSERT INTO users (name, email, password, role)
          VALUES (?, ?, ?, ?)
        `,
        params: [name, email, password, role],
      },
    ];

    let lastErr = null;
    const runAttempt = (idx = 0) => {
      const attempt = attempts[idx];
      if (!attempt) return callback(lastErr);
      db.query(attempt.sql, attempt.params, (err, result) => {
        if (!err) return callback(null, result);
        lastErr = err;
        // Only fall back on column errors; otherwise return immediately.
        if (err.code === "ER_BAD_FIELD_ERROR") {
          return runAttempt(idx + 1);
        }
        return callback(err);
      });
    };

    runAttempt();
  },

  createVerificationToken: async (userId, callback) => {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expires = new Date(Date.now() + getEmailVerificationTtlMs());

    try {
      await db.promise().query(
        "UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL",
        [userId]
      );
      await db.promise().query(
        "INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
        [userId, tokenHash, expires]
      );
      callback(null, { token, expires });
    } catch (err) {
      callback(err);
    }
  },

  verifyEmail: async (token, callback) => {
    const tokenHash = hashToken(token);

    try {
      const [tokenRows] = await db.promise().query(
        `
          SELECT id, user_id
          FROM email_verification_tokens
          WHERE token_hash = ?
            AND used_at IS NULL
            AND expires_at > NOW()
          ORDER BY id DESC
          LIMIT 1
        `,
        [tokenHash]
      );

      if (!tokenRows.length) {
        return callback(new Error("Invalid or expired token"));
      }

      const verification = tokenRows[0];
      await db.promise().query("UPDATE users SET email_verified = 1 WHERE id = ?", [verification.user_id]);
      await db.promise().query("UPDATE email_verification_tokens SET used_at = NOW() WHERE id = ?", [verification.id]);

      const [userRows] = await db.promise().query(
        "SELECT id, name, email, email_verified FROM users WHERE id = ? LIMIT 1",
        [verification.user_id]
      );

      callback(null, userRows[0] || { id: verification.user_id, email_verified: 1 });
    } catch (err) {
      callback(err);
    }
  },

  updateCampusVerification: (userId, status, callback) => {
    const sql = `
      UPDATE users 
      SET campus_verification_status = ?, campus_verified = ?
      WHERE id = ?
    `;
    const approved = status === 'APPROVED';
    db.query(sql, [status, approved, userId], callback);
  },

  findByEmail: (email, callback) => {
    const sql = "SELECT * FROM users WHERE email = ?";
    db.query(sql, [email], callback);
  },

  findByPhone: (phone, callback) => {
    const sql = "SELECT * FROM users WHERE phone = ?";
    db.query(sql, [phone], callback);
  },

  findById: (id, callback) => {
    const sql = `
      SELECT id,
             name,
             email,
             phone,
             role,
             email_verified,
             verification_level,
             phone_verified,
             campus_verified,
             verification_status,
             verification_provider_reference_id,
             verification_timestamp
      FROM users
      WHERE id = ?
    `;
    db.query(sql, [id], (err, rows) => callback(err, rows?.[0]));
  },

  updateVerification: (
    userId,
    { providerRef, status, level, timestamp },
    callback
  ) => {
    const sql = `
      UPDATE users
      SET verification_provider_reference_id = ?,
          verification_status = ?,
          verification_level = ?,
          verification_timestamp = ?
      WHERE id = ?
    `;
    db.query(
      sql,
      [providerRef || null, status || null, level ?? 0, timestamp || null, userId],
      callback
    );
  },

  markPhoneVerified: (phone, level, callback) => {
    const sql = `
      UPDATE users
      SET phone_verified = 1,
          verification_level = GREATEST(COALESCE(verification_level,0), ?),
          verification_timestamp = NOW()
      WHERE phone = ?
    `;
    db.query(sql, [level ?? 1, phone], callback);
  },
};

module.exports = User;
