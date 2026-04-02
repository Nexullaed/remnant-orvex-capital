const { logError, logInfo, logWarn, serializeError } = require("../services/logger");

const runningJobs = new Set();

async function runJob(name, handler) {
  if (runningJobs.has(name)) {
    logWarn("job_skipped_overlap", { job: name });
    return;
  }

  const startedAt = Date.now();
  runningJobs.add(name);
  logInfo("job_started", { job: name });

  try {
    const result = await handler();
    logInfo("job_completed", {
      duration_ms: Date.now() - startedAt,
      job: name,
      result: result ?? null,
    });
    return result;
  } catch (err) {
    logError("job_failed", {
      duration_ms: Date.now() - startedAt,
      error: serializeError(err),
      job: name,
    });
    throw err;
  } finally {
    runningJobs.delete(name);
  }
}

module.exports = {
  runJob,
};
