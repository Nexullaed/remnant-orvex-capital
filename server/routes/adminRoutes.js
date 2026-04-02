const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");
const adminController = require("../controllers/adminController");
const { generalLimiter } = require("../middleware/rateLimitMiddleware");
const { idParamSchema, validateParams } = require("../middleware/validationSchemas");

const router = express.Router();

router.get("/dashboard", generalLimiter, authMiddleware, requireAdmin, adminController.getDashboard);
router.get("/loans", generalLimiter, authMiddleware, requireAdmin, adminController.listAllLoans);
// Support both /loans/:id/... and /loan/:id/... paths
router.post("/loans/:id/approve", generalLimiter, authMiddleware, requireAdmin, validateParams(idParamSchema), adminController.approveLoan);
router.post("/loans/:id/reject", generalLimiter, authMiddleware, requireAdmin, validateParams(idParamSchema), adminController.rejectLoan);
router.post("/loan/:id/approve", generalLimiter, authMiddleware, requireAdmin, validateParams(idParamSchema), adminController.approveLoan);
router.post("/loan/:id/reject", generalLimiter, authMiddleware, requireAdmin, validateParams(idParamSchema), adminController.rejectLoan);
router.get("/borrowers/:id", generalLimiter, authMiddleware, requireAdmin, validateParams(idParamSchema), adminController.getBorrowerProfile);

module.exports = router;
