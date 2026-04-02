const db = require("../config/db");
const Loan = require("../models/loanModel");
const smsService = require("../services/smsService");
const User = require("../models/userModel");
const pdfService = require("../services/pdfService");
const Ledger = require("../models/ledgerModel");
const capitalService = require("../services/capitalService");

const getDashboard = (req, res) => {
  const sql = `
    SELECT
      SUM(CASE WHEN status = 'ACTIVE' THEN total_amount ELSE 0 END) AS active_total_amount,
      SUM(CASE WHEN status = 'DEFAULTED' THEN total_amount ELSE 0 END) AS overdue_total_amount,
      SUM(CASE WHEN status = 'COMPLETED' THEN total_amount ELSE 0 END) AS completed_total_amount,
      COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) AS active_count,
      COUNT(CASE WHEN status = 'DEFAULTED' THEN 1 END) AS overdue_count,
      COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed_count,
      SUM(total_amount - principal) AS profit,
      COUNT(*) AS total_loans
    FROM loans;
  `;

  const paymentsSql = `SELECT SUM(amount) AS collected FROM payments;`;
  const recentLoansSql = `
    SELECT DATE(created_at) as day, COUNT(*) as loans
    FROM loans
    WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    GROUP BY DATE(created_at)
    ORDER BY day ASC;
  `;

  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message || err });
    const row = rows?.[0] || {};
    db.query(paymentsSql, (pErr, pRows) => {
      if (pErr) return res.status(500).json({ error: pErr.message || pErr });
      const collected = Number(pRows?.[0]?.collected || 0);
      db.query(recentLoansSql, async (rErr, rRows) => {
        if (rErr) return res.status(500).json({ error: rErr.message || rErr });
        const total_count = Number(row.total_loans || 0);
        const overdue_rate = total_count ? Number(row.overdue_count || 0) / total_count : 0;

        // Capital summary
        let capitalSummary = { totalCapital: 0, reserve: 0, availableCapital: 0 };
        try {
          capitalSummary = await capitalService.calculateCapital();
        } catch (capErr) {
          console.warn("capitalService error", capErr.message || capErr);
        }

        res.json({
          total_active_loans: Number(row.active_total_amount || 0),
          active_count: Number(row.active_count || 0),
          total_overdue: Number(row.overdue_total_amount || 0),
          overdue_count: Number(row.overdue_count || 0),
          total_collected: collected,
          completed_count: Number(row.completed_count || 0),
          total_profit: Number(row.profit || 0),
          total_loans: total_count,
          overdue_rate,
          loans_last_30_days: rRows || [],
          total_capital: capitalSummary.totalCapital,
          reserve: capitalSummary.reserve,
          available_capital: capitalSummary.availableCapital,
        });
      });
    });
  });
};

const approveLoan = (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid loan id" });

  Loan.findWithUser(id, async (err, loan) => {
    if (err) return res.status(500).json({ error: err.message || err });
    if (!loan) return res.status(404).json({ message: "Loan not found" });
    if (loan.status !== "PENDING") return res.status(400).json({ message: "Only pending loans can be approved" });

    // Capital check
    try {
      const cap = await capitalService.calculateCapital();
      if (Number(loan.principal) > Number(cap.availableCapital || 0)) {
        return res.status(400).json({ message: "Insufficient capital available" });
      }
    } catch (capErr) {
      return res.status(500).json({ error: capErr.message || capErr });
    }

    // Generate contract
    let agreement;
    try {
      agreement = await pdfService.generateLoanAgreement({
        loanId: loan.id,
        user: { email: loan.email, name: loan.name },
        principal: loan.principal,
        rate: loan.rate,
        duration_days: loan.duration_days,
        interest: loan.total_amount - loan.principal,
        total: loan.total_amount,
      });
    } catch (pdfErr) {
      return res.status(500).json({ error: pdfErr.message || pdfErr });
    }

    // Update status -> active and save contract path
    Loan.updateStatusAndContract(id, "ACTIVE", agreement.filePath, (updErr) => {
      if (updErr) return res.status(500).json({ error: updErr.message || updErr });

      // Ledger disbursement
      Ledger.record(
        {
          loan_id: id,
          amount: loan.principal,
          type: "loan_disbursement",
          metadata: { contract_path: agreement.filePath, rate: loan.rate, duration_days: loan.duration_days },
        },
        (ledgerErr) => {
          if (ledgerErr) console.warn("ledger disbursement failed", ledgerErr.message || ledgerErr);
        }
      );

      // Notify borrower (best-effort)
      smsService
        .sendBorrowerApprovalSMS({
          phone: loan.phone,
          principal: loan.principal,
          total_amount: loan.total_amount,
          due_date: loan.due_date,
        })
        .catch((e) => console.warn("approval SMS failed", e.message || e));

      res.json({ message: "Loan approved and activated", contract_generated: true });
    });
  });
};

const rejectLoan = (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid loan id" });
  Loan.findById(id, (err, loan) => {
    if (err) return res.status(500).json({ error: err.message || err });
    if (!loan) return res.status(404).json({ message: "Loan not found" });
    if (loan.status !== "PENDING") return res.status(400).json({ message: "Only pending loans can be rejected" });
    Loan.updateStatus(id, "REJECTED", (updErr) => {
      if (updErr) return res.status(500).json({ error: updErr.message || updErr });
      res.json({ message: "Loan rejected" });
    });
  });
};

const getBorrowerProfile = (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid user id" });

  User.findById(id, (err, user) => {
    if (err) return res.status(500).json({ error: err.message || err });
    if (!user) return res.status(404).json({ message: "User not found" });

    const score = Math.min(
      100,
      (user.verification_level || 0) * 25 + (user.phone_verified ? 10 : 0) + (user.campus_verified ? 10 : 0)
    );

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      verification_level: user.verification_level || 0,
      phone_verified: !!user.phone_verified,
      campus_verified: !!user.campus_verified,
      profile_score: score,
    });
  });
};

const updateCampusVerification = (req, res) => {
  const { userId } = req.params;
  const { status } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  User.updateCampusVerification(userId, status, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: `User campus verification status updated to ${status}` });
  });
};

const listAllLoans = (req, res) => {
  Loan.listAll((err, rows) => {
    if (err) return res.status(500).json({ error: err.message || err });
    res.json(rows || []);
  });
};

module.exports = { getDashboard, approveLoan, rejectLoan, getBorrowerProfile, listAllLoans, updateCampusVerification };
