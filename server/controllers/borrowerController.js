const User = require("../models/userModel");
const Loan = require("../models/loanModel");
const Ledger = require("../models/ledgerModel");
const { processLoanPayment } = require("../services/paymentService");
const { loadLoan } = require("../services/accessControlService");

const getProfile = (req, res) => {
  User.findById(req.user.id, (err, user) => {
    if (err) return res.status(500).json({ error: err.message || err });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  });
};

const getLoans = (req, res) => {
  Loan.listByUser(req.user.id, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message || err });
    res.json(rows || []);
  });
};

const getLedger = (req, res) => {
  const loanId = Number(req.params.id);
  if (!Number.isFinite(loanId)) return res.status(400).json({ message: "Invalid loan id" });
  loadLoan(loanId, req.user)
    .then((loan) => {
      if (!loan) return res.status(404).json({ message: "Not found" });
      Ledger.findByLoan(loanId, (lErr, rows) => {
        if (lErr) return res.status(500).json({ error: lErr.message || lErr });
        return res.json(rows || []);
      });
    })
    .catch((err) => res.status(500).json({ error: err.message || err }));
};

const makePayment = async (req, res) => {
  try {
    const result = await processLoanPayment({
      actor: req.user,
      loanId: req.body?.loan_id,
      amount: req.body?.amount,
      method: req.body?.method,
      reference: req.body?.reference,
      receipt: req.body?.receipt,
      idempotencyKey: req.get("Idempotency-Key"),
    });

    return res.json({
      message: "Payment recorded",
      payment_id: result.paymentId,
      balance: result.balance,
      status: result.status,
      receipt_url: result.receiptUrl,
      replayed: Boolean(result.replayed),
    });
  } catch (err) {
    if (err?.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }

    return res.status(500).json({ error: err.message || err });
  }
};

const getContract = (req, res) => {
  const loanId = Number(req.params.loanId);
  if (!Number.isFinite(loanId)) return res.status(400).json({ message: "Invalid loan id" });
  loadLoan(loanId, req.user)
    .then((loan) => {
      if (!loan) return res.status(404).json({ message: "Not found" });
      if (!loan.contract_path) return res.status(404).json({ message: "No contract file" });
      return res.sendFile(loan.contract_path, (sendErr) => {
        if (sendErr) return res.status(500).json({ error: sendErr.message || sendErr });
      });
    })
    .catch((err) => res.status(500).json({ error: err.message || err }));
};

module.exports = { getProfile, getLoans, getLedger, makePayment, getContract };

