const { scoreLoan } = require("../services/creditScoringService");
const InterestRule = require("../models/interestRuleModel");
const Loan = require("../models/loanModel");
const { loadLoan } = require("../services/accessControlService");

function calculateLoan(principal, rate) {
  const interest = principal * (rate / 100);
  const total = principal + interest;
  return {
    interest: parseFloat(interest.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
  };
}

function hasAllowedLoanEmailDomain(email, allowedDomain) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedDomain = String(allowedDomain || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");

  const atIndex = normalizedEmail.lastIndexOf("@");
  if (atIndex <= 0 || !normalizedDomain) {
    return false;
  }

  return normalizedEmail.slice(atIndex + 1) === normalizedDomain;
}

const createLoan = async (req, res) => {
  const { principal, duration_days } = req.body || {};
  const user_id = req.user?.id;
  const userEmail = (req.user?.email || "").toLowerCase();

  const loanEmailDomain = (process.env.LOAN_EMAIL_DOMAIN || "my.mzuni.ac.mw").toLowerCase().replace(/^@/, "");
  if (!hasAllowedLoanEmailDomain(userEmail, loanEmailDomain)) {
    return res.status(400).json({ message: `A @${loanEmailDomain} email is required to apply for a loan` });
  }

  const minLevel = Number(process.env.MIN_VERIFICATION_LEVEL ?? 2);
  if ((req.user?.verification_level ?? 0) < minLevel) {
    return res.status(403).json({ message: `Verification level ${minLevel} required to request a loan` });
  }

  const maxActive = Number(process.env.MAX_ACTIVE_LOANS || 1);
  try {
    const activeCount = await Loan.countActiveByUser(user_id);
    if (activeCount >= maxActive) {
      return res.status(400).json({ message: "You must finish current loan first." });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || err });
  }

  const amount = parseFloat(principal);
  const duration = parseInt(duration_days, 10);
  if (!Number.isFinite(amount) || !Number.isFinite(duration)) {
    return res.status(400).json({ message: "principal and duration must be numbers" });
  }

  let rule;
  try {
    rule = await InterestRule.findByDuration(duration);
  } catch (err) {
    return res.status(500).json({ error: err.message || err });
  }

  const fallbackRates = {
    7: 10,
    14: 15,
    21: 20,
    30: 25,
  };

  let r = Number(rule?.rate);
  if (!Number.isFinite(r)) {
    const fallback = fallbackRates[duration];
    if (!fallback) {
      return res.status(400).json({ message: "Invalid loan duration" });
    }
    r = fallback;
  }

  const scoring = scoreLoan({ user: req.user, loan: { principal: amount, rate: r } });
  if (scoring.decision === "reject") {
    return res.status(400).json({ message: "Loan rejected by credit policy", score: scoring.score });
  }

  if (amount < 10000) {
    return res.status(400).json({ message: "Minimum loan amount is 10,000" });
  }

  if (amount >= 10000 && amount <= 25000 && duration > 7) {
    return res.status(400).json({
      message: "Loans between 10K and 25K must not exceed 7 days",
    });
  }

  const { interest: interestCalc, total: totalCalc } = calculateLoan(amount, r);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + duration);

  try {
    const insertResult = await new Promise((resolve, reject) => {
      Loan.create(
        {
          user_id,
          principal: amount,
          rate: r,
          duration_days: duration,
          due_date: dueDate.toISOString().split("T")[0],
          status: "PENDING",
          phone: req.user?.phone || null,
          total_amount: totalCalc,
        },
        (err, result) => {
          if (err) return reject(err);
          return resolve(result);
        }
      );
    });
    req.newLoanId = insertResult?.insertId;
  } catch (err) {
    return res.status(500).json({ error: err.message || err });
  }

  return res.status(201).json({
    message: "Loan request recorded (pending approval)",
    loan_id: req.newLoanId,
    principal: amount,
    rate: r,
    interest: interestCalc,
    total: totalCalc,
    duration_days: duration,
    status: "PENDING",
    due_date: dueDate.toISOString().split("T")[0],
    score: scoring.score,
    decision: scoring.decision,
  });
};

const getLoanById = (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ message: "Invalid loan id" });
  }

  loadLoan(id, req.user, { withUser: true })
    .then((loan) => {
      if (!loan) return res.status(404).json({ message: "Loan not found" });

      const interest = Number(loan.principal || 0) * (Number(loan.rate || 0) / 100);
      const total = Number(loan.total_amount || (Number(loan.principal || 0) + interest));

      return res.json({
        id: loan.id,
        user_id: loan.user_id,
        principal: Number(loan.principal),
        rate: Number(loan.rate),
        interest: Number(interest.toFixed(2)),
        total_amount: Number(total.toFixed(2)),
        duration_days: loan.duration_days,
        status: loan.status,
        due_date: loan.due_date,
        created_at: loan.created_at,
        user: {
          id: loan.user_id,
          name: loan.name,
          email: loan.email,
          phone: loan.phone,
        },
      });
    })
    .catch((err) => res.status(500).json({ error: err.message || err }));
};

module.exports = { createLoan, getLoanById };
