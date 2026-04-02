const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { generalLimiter, loanLimiter } = require("../middleware/rateLimitMiddleware");
const { idParamSchema, loanCreateSchema, validate, validateParams } = require("../middleware/validationSchemas");
const loanController = require("../controllers/loanController");

router.post(
    "/create",
    generalLimiter,
    loanLimiter,
    authMiddleware,
    validate(loanCreateSchema),
    loanController.createLoan
);

router.get(
    "/:id",
    generalLimiter,
    authMiddleware,
    validateParams(idParamSchema),
    loanController.getLoanById
);

module.exports = router;
