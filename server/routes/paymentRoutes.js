const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { generalLimiter } = require("../middleware/rateLimitMiddleware");
const { idParamSchema, paymentSchema, validate, validateParams } = require("../middleware/validationSchemas");
const paymentController = require("../controllers/paymentController");

const router = express.Router();

router.post("/pay", generalLimiter, authMiddleware, validate(paymentSchema), paymentController.makePayment);
router.get("/:id/receipt", generalLimiter, authMiddleware, validateParams(idParamSchema), paymentController.downloadReceipt);

module.exports = router;
