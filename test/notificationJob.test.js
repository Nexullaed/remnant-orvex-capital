const assert = require("node:assert/strict");
const path = require("path");
const test = require("node:test");
const { loadWithMocks, resolveFrom } = require("./helpers/loadWithMocks");

async function withMockedDate(isoString, callback) {
  const RealDate = Date;

  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(isoString);
        return;
      }

      super(...args);
    }

    static now() {
      return new RealDate(isoString).getTime();
    }

    static parse(value) {
      return RealDate.parse(value);
    }

    static UTC(...args) {
      return RealDate.UTC(...args);
    }
  }

  global.Date = MockDate;

  try {
    return await callback();
  } finally {
    global.Date = RealDate;
  }
}

function loadNotificationJob(rows) {
  const targetPath = path.resolve(__dirname, "../server/jobs/notificationJob.js");
  const scheduled = [];
  const reminders = [];

  loadWithMocks(targetPath, {
    [resolveFrom(targetPath, "node-cron")]: {
      schedule: (expression, callback) => {
        scheduled.push({ callback, expression });
      },
    },
    [resolveFrom(targetPath, "../config/db")]: {
      promise: () => ({
        query: async () => [rows],
      }),
    },
    [resolveFrom(targetPath, "../services/notificationService")]: {
      sendReminder: async (payload) => {
        reminders.push(payload);
      },
    },
    [resolveFrom(targetPath, "./jobRunner")]: {
      runJob: async (_name, handler) => handler(),
    },
  });

  return { reminders, scheduled };
}

test("notificationJob sends each overdue reminder at most once per day", async () => {
  const { reminders, scheduled } = loadNotificationJob([
    { due_date: "2026-03-31", id: 101, principal: 12000, user_id: 5 },
  ]);

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].expression, "0 * * * *");

  await withMockedDate("2026-04-01T08:00:00.000Z", () => scheduled[0].callback());
  await withMockedDate("2026-04-01T09:00:00.000Z", () => scheduled[0].callback());

  assert.equal(reminders.length, 1);
  assert.match(reminders[0].message, /Loan 101 amount 12000 is overdue/);
});

test("notificationJob resets reminder dedupe when the calendar day changes", async () => {
  const { reminders, scheduled } = loadNotificationJob([
    { due_date: "2026-03-31", id: 202, principal: 4500, user_id: 7 },
  ]);

  await withMockedDate("2026-04-01T23:00:00.000Z", () => scheduled[0].callback());
  await withMockedDate("2026-04-02T00:00:00.000Z", () => scheduled[0].callback());

  assert.equal(reminders.length, 2);
  assert.match(reminders[1].message, /Loan 202 amount 4500 is overdue/);
});
