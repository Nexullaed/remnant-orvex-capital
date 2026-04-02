const assert = require("node:assert/strict");
const path = require("path");
const test = require("node:test");
const { loadWithMocks, resolveFrom } = require("./helpers/loadWithMocks");

function loadJobRunner() {
  const targetPath = path.resolve(__dirname, "../server/jobs/jobRunner.js");
  const calls = {
    error: [],
    info: [],
    warn: [],
  };

  const jobRunner = loadWithMocks(targetPath, {
    [resolveFrom(targetPath, "../services/logger")]: {
      logError: (event, metadata) => calls.error.push({ event, metadata }),
      logInfo: (event, metadata) => calls.info.push({ event, metadata }),
      logWarn: (event, metadata) => calls.warn.push({ event, metadata }),
      serializeError: (err) => ({
        code: err.code,
        message: err.message,
        name: err.name,
      }),
    },
  });

  return { ...jobRunner, calls };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

test("runJob skips overlapping runs and preserves falsy completion results", async () => {
  const { runJob, calls } = loadJobRunner();
  const gate = createDeferred();
  let executions = 0;

  const firstRun = runJob("notification_dispatch", async () => {
    executions += 1;
    await gate.promise;
    return 0;
  });

  const skippedRun = await runJob("notification_dispatch", async () => {
    executions += 1;
    return 1;
  });

  assert.equal(skippedRun, undefined);
  assert.equal(executions, 1);
  assert.deepEqual(calls.warn, [
    {
      event: "job_skipped_overlap",
      metadata: { job: "notification_dispatch" },
    },
  ]);

  gate.resolve();

  const result = await firstRun;
  assert.equal(result, 0);
  assert.deepEqual(
    calls.info.map((entry) => entry.event),
    ["job_started", "job_completed"]
  );
  assert.equal(calls.info[1].metadata.result, 0);
});

test("runJob removes failed jobs from the overlap guard", async () => {
  const { runJob, calls } = loadJobRunner();

  await assert.rejects(
    runJob("loan_recovery", async () => {
      const error = new Error("database offline");
      error.code = "ER_CON_COUNT_ERROR";
      throw error;
    }),
    /database offline/
  );

  const retriedResult = await runJob("loan_recovery", async () => "ok");

  assert.equal(retriedResult, "ok");
  assert.equal(calls.error.length, 1);
  assert.equal(calls.error[0].event, "job_failed");
  assert.equal(calls.error[0].metadata.error.message, "database offline");
  assert.equal(
    calls.info.filter((entry) => entry.event === "job_started").length,
    2
  );
  assert.equal(
    calls.info.filter((entry) => entry.event === "job_completed").length,
    1
  );
});
