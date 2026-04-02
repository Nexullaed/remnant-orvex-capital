const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");
const { generalLimiter } = require("../middleware/rateLimitMiddleware");
const { idParamSchema, validateParams } = require("../middleware/validationSchemas");
const userController = require("../controllers/userController");

const router = express.Router();

router.get("/:id", generalLimiter, authMiddleware, requireAdmin, validateParams(idParamSchema), userController.getUserProfile);

module.exports = router;
