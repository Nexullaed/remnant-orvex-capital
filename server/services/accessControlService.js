const fs = require("fs");
const Loan = require("../models/loanModel");
const Collateral = require("../models/collateralModel");
const Payment = require("../models/paymentModel");

function isAdmin(user) {
  return String(user?.role || "").toLowerCase() === "admin";
}

function normalizeId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function canAccessUser(actor, targetUserId) {
  const normalizedTargetUserId = normalizeId(targetUserId);
  if (!normalizedTargetUserId) return false;
  return isAdmin(actor) || normalizeId(actor?.id) === normalizedTargetUserId;
}

function loadLoan(loanId, actor, { withUser = false } = {}) {
  return new Promise((resolve, reject) => {
    const callback = (err, loan) => {
      if (err) return reject(err);
      resolve(loan || null);
    };

    if (isAdmin(actor)) {
      return withUser ? Loan.findWithUser(loanId, callback) : Loan.findById(loanId, callback);
    }

    return withUser
      ? Loan.findWithUserForUser(loanId, actor.id, callback)
      : Loan.findByIdForUser(loanId, actor.id, callback);
  });
}

function listCollateralByLoan(loanId, actor) {
  return new Promise((resolve, reject) => {
    const callback = (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    };

    if (isAdmin(actor)) {
      return Collateral.listByLoan(loanId, callback);
    }

    return Collateral.listByLoanForUser(loanId, actor.id, callback);
  });
}

function loadCollateral(collateralId, actor) {
  return new Promise((resolve, reject) => {
    const callback = (err, item) => {
      if (err) return reject(err);
      resolve(item || null);
    };

    if (isAdmin(actor)) {
      return Collateral.findById(collateralId, callback);
    }

    return Collateral.findByIdForUser(collateralId, actor.id, callback);
  });
}

function loadPayment(paymentId, actor) {
  return new Promise((resolve, reject) => {
    const callback = (err, payment) => {
      if (err) return reject(err);
      resolve(payment || null);
    };

    if (isAdmin(actor)) {
      return Payment.findById(paymentId, callback);
    }

    return Payment.findByIdForUser(paymentId, actor.id, callback);
  });
}

function cleanupUploadedFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }

  fs.unlink(filePath, () => {});
}

module.exports = {
  canAccessUser,
  cleanupUploadedFile,
  isAdmin,
  listCollateralByLoan,
  loadCollateral,
  loadLoan,
  loadPayment,
  normalizeId,
};
