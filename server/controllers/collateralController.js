const path = require("path");
const fs = require("fs");
const Collateral = require("../models/collateralModel");
const { cleanupUploadedFile, listCollateralByLoan, loadCollateral, loadLoan } = require("../services/accessControlService");

const uploadCollateral = (req, res) => {
  const { loan_id, item_type, description } = req.body || {};
  const loanId = Number(loan_id);
  const uploadedFilePath = req.file?.path ? path.resolve(req.file.path) : null;

  if (!Number.isFinite(loanId)) {
    cleanupUploadedFile(uploadedFilePath);
    return res.status(400).json({ message: "Invalid loan_id" });
  }
  if (!item_type) {
    cleanupUploadedFile(uploadedFilePath);
    return res.status(400).json({ message: "item_type is required" });
  }
  if (!req.file) {
    return res.status(400).json({ message: "Collateral photo is required" });
  }

  loadLoan(loanId, req.user)
    .then((loan) => {
      if (!loan) {
        cleanupUploadedFile(uploadedFilePath);
        return res.status(404).json({ message: "Loan not found" });
      }

      Collateral.create({ loan_id: loanId, item_type, description, file_path: uploadedFilePath }, (cErr, result) => {
        if (cErr) {
          cleanupUploadedFile(uploadedFilePath);
          return res.status(500).json({ error: cErr.message || cErr });
        }
        return res.status(201).json({
          message: "Collateral uploaded",
          collateral_id: result?.insertId,
          item_type,
          description,
        });
      });
    })
    .catch((err) => {
      cleanupUploadedFile(uploadedFilePath);
      return res.status(500).json({ error: err.message || err });
    });
};

const listByLoan = (req, res) => {
  const loanId = Number(req.params.loanId);
  if (!Number.isFinite(loanId)) return res.status(400).json({ message: "Invalid loan id" });

  loadLoan(loanId, req.user)
    .then((loan) => {
      if (!loan) return res.status(404).json({ message: "Loan not found" });
      return listCollateralByLoan(loanId, req.user)
        .then((rows) => res.json(rows || []))
        .catch((err) => res.status(500).json({ error: err.message || err }));
    })
    .catch((err) => res.status(500).json({ error: err.message || err }));
};

const downloadCollateral = (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid collateral id" });

  loadCollateral(id, req.user)
    .then((item) => {
      if (!item) return res.status(404).json({ message: "Not found" });

      if (!item.file_path || !fs.existsSync(item.file_path)) {
        return res.status(404).json({ message: "File missing" });
      }

      return res.sendFile(item.file_path, (sendErr) => {
        if (sendErr) return res.status(500).json({ error: sendErr.message || sendErr });
      });
    })
    .catch((err) => res.status(500).json({ error: err.message || err }));
};

module.exports = { uploadCollateral, listByLoan, downloadCollateral };
