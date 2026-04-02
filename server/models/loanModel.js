const db = require("../config/db");

const Loan = {
  create: (data, cb) => {
    const { user_id, principal, rate, duration_days, due_date, status, phone, total_amount } = data;
    const sql = `INSERT INTO loans (user_id, principal, rate, duration_days, due_date, status, phone, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.query(sql, [user_id, principal, rate, duration_days, due_date, status || "PENDING", phone || null, total_amount || null], cb);
  },
  findById: (id, cb) => {
    db.query("SELECT * FROM loans WHERE id = ?", [id], (err, rows) => cb(err, rows?.[0]));
  },
  findByIdForUser: (id, userId, cb) => {
    db.query(
      "SELECT * FROM loans WHERE id = ? AND user_id = ? LIMIT 1",
      [id, userId],
      (err, rows) => cb(err, rows?.[0])
    );
  },
  findWithUser: (id, cb) => {
    const sql = `
      SELECT l.*, u.phone, u.email, u.name, u.id as user_id
      FROM loans l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE l.id = ?
      LIMIT 1
    `;
    db.query(sql, [id], (err, rows) => cb(err, rows?.[0]));
  },
  findWithUserForUser: (id, userId, cb) => {
    const sql = `
      SELECT l.*, u.phone, u.email, u.name, u.id as user_id
      FROM loans l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE l.id = ?
        AND l.user_id = ?
      LIMIT 1
    `;
    db.query(sql, [id, userId], (err, rows) => cb(err, rows?.[0]));
  },
  listByUser: (userId, cb) => {
    db.query("SELECT * FROM loans WHERE user_id = ?", [userId], cb);
  },
  getOverdueLoans: () => {
    return new Promise((resolve, reject) => {
      db.query(
        "SELECT l.*, u.phone FROM loans l LEFT JOIN users u ON l.user_id = u.id WHERE l.due_date < CURDATE() AND l.status IN ('ACTIVE','APPROVED')",
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });
  },
  updateStatus: (id, status, cb) => {
    db.query("UPDATE loans SET status = ? WHERE id = ?", [status, id], cb);
  },
  updateStatusAndContract: (id, status, contract_path, cb) => {
    db.query("UPDATE loans SET status = ?, contract_path = ? WHERE id = ?", [status, contract_path, id], cb);
  },
  findActiveByUser: (userId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "SELECT * FROM loans WHERE user_id = ? AND status IN ('ACTIVE','APPROVED','PENDING') LIMIT 1",
        [userId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows && rows[0] ? rows[0] : null);
        }
      );
    });
  },

  countActiveByUser: (userId) => {
    return new Promise((resolve, reject) => {
      db.query(
        "SELECT COUNT(*) AS cnt FROM loans WHERE user_id = ? AND status IN ('ACTIVE','APPROVED','PENDING')",
        [userId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(Number(rows?.[0]?.cnt || 0));
        }
      );
    });
  },

  listAll: (cb) => {
    db.query(
      "SELECT id, user_id, principal, total_amount, status, due_date, created_at FROM loans ORDER BY id DESC",
      cb
    );
  },
};

module.exports = Loan;
