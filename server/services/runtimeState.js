const startedAt = new Date();

const state = {
  activeRequests: 0,
  lastRequestAt: null,
  ready: false,
  shuttingDown: false,
  startupError: null,
  startupStage: "booting",
  totalRequests: 0,
};

function recordRequestStart() {
  state.activeRequests += 1;
  state.totalRequests += 1;
  state.lastRequestAt = new Date();
}

function recordRequestEnd() {
  state.activeRequests = Math.max(state.activeRequests - 1, 0);
}

function setStartupStage(stage) {
  state.startupStage = String(stage || "").trim() || state.startupStage;
}

function markReady() {
  state.ready = true;
  state.shuttingDown = false;
  state.startupError = null;
  state.startupStage = "ready";
}

function markNotReady(error, stage = "error") {
  state.ready = false;
  state.startupStage = stage;
  state.startupError = error
    ? {
        message: error.message || String(error),
        code: error.code || undefined,
      }
    : null;
}

function beginShutdown() {
  state.ready = false;
  state.shuttingDown = true;
  state.startupStage = "shutting_down";
}

function snapshot() {
  return {
    active_requests: state.activeRequests,
    last_request_at: state.lastRequestAt ? state.lastRequestAt.toISOString() : null,
    ready: state.ready,
    shutting_down: state.shuttingDown,
    started_at: startedAt.toISOString(),
    startup_error: state.startupError,
    startup_stage: state.startupStage,
    total_requests: state.totalRequests,
    uptime_ms: Date.now() - startedAt.getTime(),
  };
}

module.exports = {
  beginShutdown,
  markNotReady,
  markReady,
  recordRequestEnd,
  recordRequestStart,
  setStartupStage,
  snapshot,
};
