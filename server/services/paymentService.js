const path = require("path");
const db = require("../config/db");
const { generatePaymentReceipt } = require("./pdfService");
const { isAdmin, normalizeId } = require("./accessControlService");

function normalizeOptionalText(value, maxLength = 100) {
  const normalized = String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeMoneyAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Number(amount.toFixed(2));
}

function normalizeIdempotencyKey(value) {
  const normalized = normalizeOptionalText(value, 80);
  if (!normalized) return null;
  if (!/^[A-Za-z0-9:_-]{16,80}$/.test(normalized)) {
    const error = new Error("Invalid Idempotency-Key header");
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function buildReceiptUrl(paymentId) {
  return `/api/payments/${paymentId}/receipt`;
}

function getPaymentReceiptFilePath(paymentId) {
  return path.resolve(__dirname, "..", "..", "uploads", "contracts", `receipt-${paymentId}.pdf`);
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

async function indexExists(tableName, indexName) {
  const [rows] = await db.promise().query(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function constraintExists(tableName, constraintName) {
  const [rows] = await db.promise().query(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
      LIMIT 1
    `,
    [tableName, constraintName]
  );
  return rows.length > 0;
}

async function ensurePaymentSecurityTables() {
  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS payment_idempotency_keys (
      id INT AUTO_INCREMENT PRIMARY KEY,
      idempotency_key VARCHAR(80) NOT NULL,
      user_id INT NOT NULL,
      loan_id INT NOT NULL,
      payment_id INT NULL,
      response_json TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_payment_idempotency_key (idempotency_key)
    )
  `);

  if (await columnExists("payments", "reference")) {
    try {
      if (!(await indexExists("payments", "uniq_payments_reference"))) {
        await db.promise().query("ALTER TABLE payments ADD UNIQUE KEY uniq_payments_reference (reference)");
      }
    } catch (err) {
      if (!["ER_DUP_KEYNAME", "ER_DUP_ENTRY"].includes(err?.code)) {
        throw err;
      }
      console.warn("Skipping payments.reference unique index:", err.message || err);
    }
  }

  if (await columnExists("loans", "total_amount")) {
    try {
      if (!(await constraintExists("loans", "chk_loans_total_amount_non_negative"))) {
        await db.promise().query(
          "ALTER TABLE loans ADD CONSTRAINT chk_loans_total_amount_non_negative CHECK (total_amount >= 0)"
        );
      }
    } catch (err) {
      if (!["ER_CHECK_CONSTRAINT_VIOLATED", "ER_DUP_KEYNAME"].includes(err?.code)) {
        console.warn("Skipping loans.total_amount CHECK constraint:", err.message || err);
      }
    }
  }
}

async function reserveIdempotencyKey(conn, { idempotencyKey, userId, loanId }) {
  if (!idempotencyKey) return null;

  try {
    await conn.query(
      `
        INSERT INTO payment_idempotency_keys (idempotency_key, user_id, loan_id)
        VALUES (?, ?, ?)
      `,
      [idempotencyKey, userId, loanId]
    );
    return null;
  } catch (err) {
    if (err?.code !== "ER_DUP_ENTRY") {
      throw err;
    }

    const [rows] = await conn.query(
      `
        SELECT payment_id, response_json
        FROM payment_idempotency_keys
        WHERE idempotency_key = ?
          AND user_id = ?
        LIMIT 1
      `,
      [idempotencyKey, userId]
    );

    if (!rows.length || !rows[0].response_json) {
      const error = new Error("A payment with this idempotency key is already in progress.");
      error.statusCode = 409;
      throw error;
    }

    let replayedResponse = null;
    try {
      replayedResponse = JSON.parse(rows[0].response_json);
    } catch (parseErr) {
      const error = new Error("Stored idempotent payment response is invalid");
      error.statusCode = 500;
      throw error;
    }
    replayedResponse.replayed = true;
    return replayedResponse;
  }
}

async function persistIdempotencyResponse(conn, { idempotencyKey, userId, paymentId, response }) {
  if (!idempotencyKey) return;

  await conn.query(
    `
      UPDATE payment_idempotency_keys
      SET payment_id = ?, response_json = ?
      WHERE idempotency_key = ?
        AND user_id = ?
    `,
    [paymentId, JSON.stringify(response), idempotencyKey, userId]
  );
}

async function loadLoanForUpdate(conn, actor, loanId) {
  const params = isAdmin(actor) ? [loanId] : [loanId, actor.id];
  const sql = isAdmin(actor)
    ? `
        SELECT id, user_id, total_amount, status
        FROM loans
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `
    : `
        SELECT id, user_id, total_amount, status
        FROM loans
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
        FOR UPDATE
      `;

  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

async function assertUniquePaymentReference(conn, reference) {
  if (!reference) return;
  const [rows] = await conn.query("SELECT id FROM payments WHERE reference = ? LIMIT 1", [reference]);
  if (rows.length) {
    const error = new Error("Payment reference has already been used");
    error.statusCode = 409;
    throw error;
  }
}

async function processLoanPayment({ actor, loanId, amount, method, reference, receipt, idempotencyKey }) {
  const normalizedLoanId = normalizeId(loanId);
  if (!normalizedLoanId) {
    const error = new Error("Invalid loan id");
    error.statusCode = 400;
    throw error;
  }

  const normalizedAmount = normalizeMoneyAmount(amount);
  if (!normalizedAmount) {
    const error = new Error("amount must be a positive number");
    error.statusCode = 400;
    throw error;
  }

  const normalizedMethod = normalizeOptionalText(method, 40);
  const normalizedReference = normalizeOptionalText(reference, 100);
  const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);
  const wantsReceipt = Boolean(receipt);

  const conn = await db.promise().getConnection();
  let paymentId = null;
  let response = null;

  try {
    await conn.beginTransaction();

    const replayedResponse = await reserveIdempotencyKey(conn, {
      idempotencyKey: normalizedIdempotencyKey,
      userId: actor.id,
      loanId: normalizedLoanId,
    });
    if (replayedResponse) {
      await conn.rollback();
      return replayedResponse;
    }

    const loan = await loadLoanForUpdate(conn, actor, normalizedLoanId);
    if (!loan) {
      const error = new Error("Not found");
      error.statusCode = 404;
      throw error;
    }

    const currentBalance = Number(loan.total_amount || 0);
    if (!Number.isFinite(currentBalance) || currentBalance < 0) {
      throw new Error("Loan balance is invalid");
    }

    const currentStatus = String(loan.status || "").toUpperCase();
    if (!["ACTIVE", "APPROVED", "DEFAULTED"].includes(currentStatus)) {
      const error = new Error("This loan cannot accept payments in its current state");
      error.statusCode = 400;
      throw error;
    }

    if (normalizedAmount > currentBalance) {
      const error = new Error("Payment exceeds the outstanding balance");
      error.statusCode = 400;
      throw error;
    }

    await assertUniquePaymentReference(conn, normalizedReference);

    const [paymentResult] = await conn.query(
      `
        INSERT INTO payments (loan_id, amount, method, reference, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `,
      [normalizedLoanId, normalizedAmount, normalizedMethod, normalizedReference]
    );
    paymentId = Number(paymentResult?.insertId || 0);

    const newBalance = Number((currentBalance - normalizedAmount).toFixed(2));
    const newStatus = newBalance === 0 ? "COMPLETED" : currentStatus;

    await conn.query("UPDATE loans SET total_amount = ?, status = ? WHERE id = ?", [newBalance, newStatus, loan.id]);
    await conn.query(
      `
        INSERT INTO ledger_transactions (loan_id, amount, type, metadata, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `,
      [
        normalizedLoanId,
        normalizedAmount,
        "payment_received",
        JSON.stringify({
          method: normalizedMethod,
          reference: normalizedReference,
          payment_id: paymentId,
        }),
      ]
    );

    response = {
      balance: newBalance,
      paymentId,
      receiptUrl: null,
      status: newStatus,
    };

    await persistIdempotencyResponse(conn, {
      idempotencyKey: normalizedIdempotencyKey,
      userId: actor.id,
      paymentId,
      response,
    });

    await conn.commit();
  } catch (err) {
    if (err?.code === "ER_DUP_ENTRY") {
      const duplicateError = new Error("Payment reference has already been used");
      duplicateError.statusCode = 409;
      await conn.rollback().catch(() => {});
      throw duplicateError;
    }
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }

  if (wantsReceipt && paymentId) {
    try {
      await generatePaymentReceipt({
        paymentId,
        loanId: normalizedLoanId,
        user: actor,
        amount: normalizedAmount,
        balanceAfter: response.balance,
      });
      response.receiptUrl = buildReceiptUrl(paymentId);
      if (normalizedIdempotencyKey) {
        await db.promise().query(
          `
            UPDATE payment_idempotency_keys
            SET response_json = ?
            WHERE idempotency_key = ?
              AND user_id = ?
          `,
          [JSON.stringify(response), normalizedIdempotencyKey, actor.id]
        );
      }
    } catch (err) {
      console.warn("receipt generation failed", err.message || err);
    }
  }

  return response;
}

module.exports = {
  buildReceiptUrl,
  ensurePaymentSecurityTables,
  getPaymentReceiptFilePath,
  processLoanPayment,
};
