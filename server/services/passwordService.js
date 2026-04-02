const bcrypt = require("bcrypt");
const { getBcryptRounds } = require("../config/auth");

function getPasswordValidationErrors(password) {
  const value = String(password || "");
  const errors = [];

  if (value.length < 12) {
    errors.push("Password must be at least 12 characters long.");
  }
  if (value.length > 128) {
    errors.push("Password must not exceed 128 characters.");
  }
  if (!/[a-z]/.test(value)) {
    errors.push("Password must include a lowercase letter.");
  }
  if (!/[A-Z]/.test(value)) {
    errors.push("Password must include an uppercase letter.");
  }
  if (!/\d/.test(value)) {
    errors.push("Password must include a number.");
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    errors.push("Password must include a special character.");
  }

  return errors;
}

function assertStrongPassword(password) {
  const errors = getPasswordValidationErrors(password);
  if (errors.length) {
    const error = new Error(errors[0]);
    error.details = errors;
    throw error;
  }
}

async function hashPassword(password) {
  assertStrongPassword(password);
  return bcrypt.hash(password, getBcryptRounds());
}

async function verifyPassword(password, passwordHash) {
  if (!passwordHash) {
    return false;
  }

  return bcrypt.compare(String(password || ""), passwordHash);
}

module.exports = {
  assertStrongPassword,
  getPasswordValidationErrors,
  hashPassword,
  verifyPassword,
};
