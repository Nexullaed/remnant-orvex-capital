const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { generalLimiter } = require("../middleware/rateLimitMiddleware");
const { idParamSchema, loanIdParamSchema, paymentSchema, validate, validateParams } = require("../middleware/validationSchemas");
const borrowerController = require("../controllers/borrowerController");

const router = express.Router();

router.get("/profile", generalLimiter, authMiddleware, borrowerController.getProfile);
router.get("/loans", generalLimiter, authMiddleware, borrowerController.getLoans);
router.get("/loans/:id/ledger", generalLimiter, authMiddleware, validateParams(idParamSchema), borrowerController.getLedger);
router.post("/payments", generalLimiter, authMiddleware, validate(paymentSchema), borrowerController.makePayment);
router.get("/documents/:loanId/contract", generalLimiter, authMiddleware, validateParams(loanIdParamSchema), borrowerController.getContract);

module.exports = router;
