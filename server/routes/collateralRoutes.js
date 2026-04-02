const crypto = require("crypto");
const fs = require("fs");
const express = require("express");
const path = require("path");
const multer = require("multer");
const authMiddleware = require("../middleware/authMiddleware");
const { generalLimiter } = require("../middleware/rateLimitMiddleware");
const { collateralSchema, idParamSchema, loanIdParamSchema, validate, validateParams } = require("../middleware/validationSchemas");
const collateralController = require("../controllers/collateralController");

const router = express.Router();
const uploadDir = path.join(__dirname, "../uploads/collateral");
const allowedMimeTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const extension = path.extname(String(file.originalname || "")).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(12).toString("hex")}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 10,
  },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(String(file.originalname || "")).toLowerCase();
    const expectedMimeType = allowedMimeTypes.get(extension);

    if (!expectedMimeType || file.mimetype !== expectedMimeType) {
      const error = new Error("Only JPG, JPEG, PNG, and WebP image uploads up to 5MB are allowed");
      error.statusCode = 400;
      return cb(error);
    }

    return cb(null, true);
  },
});

function uploadCollateralPhoto(req, res, next) {
  upload.single("photo")(req, res, (err) => {
    if (!err) return next();

    const message =
      err instanceof multer.MulterError
        ? "Invalid collateral upload"
        : err.message || "Invalid collateral upload";

    return res.status(400).json({ message });
  });
}

router.post(
  "/upload",
  generalLimiter,
  authMiddleware,
  uploadCollateralPhoto,
  validate(collateralSchema),
  collateralController.uploadCollateral
);

router.get(
  "/loan/:loanId",
  generalLimiter,
  authMiddleware,
  validateParams(loanIdParamSchema),
  collateralController.listByLoan
);

router.get(
  "/:id/download",
  generalLimiter,
  authMiddleware,
  validateParams(idParamSchema),
  collateralController.downloadCollateral
);

module.exports = router;
