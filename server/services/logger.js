const SENSITIVE_KEY_PATTERN = /authorization|cookie|password|secret|token|api[_-]?key|smtp_pass|db_password|session/i;

function serializeError(err) {
  if (!err) return null;

  return {
    name: err.name || "Error",
    message: err.message || String(err),
    code: err.code || undefined,
    statusCode: err.statusCode || undefined,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  };
}

function sanitizeValue(key, value, depth = 0) {
  if (depth > 4) {
    return "[Truncated]";
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 497)}...` : value;
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(key, item, depth + 1));
  }

  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(childKey)) {
      output[childKey] = "[REDACTED]";
      continue;
    }
    output[childKey] = sanitizeValue(childKey, childValue, depth + 1);
  }
  return output;
}

function write(level, event, metadata = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitizeValue("", metadata),
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function logInfo(event, metadata) {
  write("info", event, metadata);
}

function logWarn(event, metadata) {
  write("warn", event, metadata);
}

function logError(event, metadata) {
  write("error", event, metadata);
}

module.exports = {
  logError,
  logInfo,
  logWarn,
  serializeError,
};
