const db = require("../config/db");

let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

async function withConnection(handler) {
  const conn = await db.promise().getConnection();
  try {
    return await handler(conn);
  } finally {
    conn.release();
  }
}

async function cleanupExpiredWindows() {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  try {
    await db.promise().query(
      `
        DELETE FROM rate_limit_windows
        WHERE window_expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
      `
    );
  } catch (err) {
    console.warn("rate limit cleanup skipped:", err.message || err);
  }
}

async function ensureRateLimitTables() {
  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS rate_limit_windows (
      id INT AUTO_INCREMENT PRIMARY KEY,
      scope VARCHAR(64) NOT NULL,
      bucket_key VARCHAR(191) NOT NULL,
      hit_count INT NOT NULL DEFAULT 0,
      window_started_at DATETIME NOT NULL,
      window_expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_rate_limit_scope_bucket (scope, bucket_key),
      INDEX idx_rate_limit_window_expires_at (window_expires_at)
    )
  `);
}

async function getWindowStatus({ scope, bucketKey }) {
  await cleanupExpiredWindows();

  const [rows] = await db.promise().query(
    `
      SELECT hit_count, window_expires_at
      FROM rate_limit_windows
      WHERE scope = ? AND bucket_key = ?
      LIMIT 1
    `,
    [scope, bucketKey]
  );

  if (!rows.length) {
    return null;
  }

  const row = rows[0];
  const expiresAt = toDate(row.window_expires_at);
  if (expiresAt.getTime() <= Date.now()) {
    await clearWindow({ scope, bucketKey });
    return null;
  }

  return {
    hitCount: Number(row.hit_count || 0),
    expiresAt,
  };
}

async function consumeWindow({ scope, bucketKey, windowMs, maxHits }) {
  await cleanupExpiredWindows();

  return withConnection(async (conn) => {
    await conn.beginTransaction();

    try {
      const [rows] = await conn.query(
        `
          SELECT id, hit_count, window_expires_at
          FROM rate_limit_windows
          WHERE scope = ? AND bucket_key = ?
          LIMIT 1
          FOR UPDATE
        `,
        [scope, bucketKey]
      );

      const now = new Date();
      const nextExpiresAt = new Date(now.getTime() + windowMs);
      let hitCount = 1;
      let expiresAt = nextExpiresAt;

      if (!rows.length) {
        await conn.query(
          `
            INSERT INTO rate_limit_windows (scope, bucket_key, hit_count, window_started_at, window_expires_at)
            VALUES (?, ?, ?, ?, ?)
          `,
          [scope, bucketKey, hitCount, now, nextExpiresAt]
        );
      } else {
        const currentRow = rows[0];
        const currentExpiresAt = toDate(currentRow.window_expires_at);

        if (currentExpiresAt.getTime() <= now.getTime()) {
          hitCount = 1;
          expiresAt = nextExpiresAt;
          await conn.query(
            `
              UPDATE rate_limit_windows
              SET hit_count = ?, window_started_at = ?, window_expires_at = ?
              WHERE id = ?
            `,
            [hitCount, now, nextExpiresAt, currentRow.id]
          );
        } else {
          hitCount = Number(currentRow.hit_count || 0) + 1;
          expiresAt = currentExpiresAt;
          await conn.query(
            `
              UPDATE rate_limit_windows
              SET hit_count = ?
              WHERE id = ?
            `,
            [hitCount, currentRow.id]
          );
        }
      }

      await conn.commit();

      const retryAfterMs = Math.max(expiresAt.getTime() - now.getTime(), 0);
      return {
        blocked: hitCount > maxHits,
        hitCount,
        remaining: Math.max(maxHits - Math.min(hitCount, maxHits), 0),
        retryAfterMs,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        resetAt: expiresAt,
      };
    } catch (err) {
      try {
        await conn.rollback();
      } catch (_) {
        // Ignore rollback errors and surface the original failure.
      }
      throw err;
    }
  });
}

async function clearWindow({ scope, bucketKey }) {
  await db.promise().query("DELETE FROM rate_limit_windows WHERE scope = ? AND bucket_key = ?", [scope, bucketKey]);
}

module.exports = {
  clearWindow,
  consumeWindow,
  ensureRateLimitTables,
  getWindowStatus,
};
