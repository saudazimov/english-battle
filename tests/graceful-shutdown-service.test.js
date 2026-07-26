const test = require("node:test");
const assert = require("node:assert/strict");

const { createGracefulShutdownService } = require("../src/services/gracefulShutdownService");

function createHarness({ closeError = null, poolError = null } = {}) {
  const calls = [];
  let closeCallback;
  let timeoutCallback;
  const timer = { unref() { calls.push(["unref"]); } };
  const gracefulShutdown = createGracefulShutdownService({
    server: {
      close(callback) {
        calls.push(["close"]);
        closeCallback = callback;
      },
    },
    pool: {
      async end() {
        calls.push(["pool.end"]);
        if (poolError) throw poolError;
      },
    },
    logger: {
      log(...args) { calls.push(["log", ...args]); },
      error(...args) { calls.push(["error", ...args]); },
    },
    setTimeoutFn(callback, delay) {
      calls.push(["setTimeout", delay]);
      timeoutCallback = callback;
      return timer;
    },
    clearTimeoutFn(value) { calls.push(["clearTimeout", value]); },
    exit(code) { calls.push(["exit", code]); },
  });

  return {
    calls,
    gracefulShutdown,
    finishClose: () => closeCallback(closeError),
    forceTimeout: () => timeoutCallback(),
    timer,
  };
}

test("graceful shutdown preserves normal close order and exit code", async () => {
  const harness = createHarness();

  await harness.gracefulShutdown("SIGTERM");
  await harness.finishClose();

  assert.deepEqual(harness.calls.map((call) => call[0]), [
    "log", "setTimeout", "unref", "close", "log", "pool.end", "log", "clearTimeout", "log", "exit",
  ]);
  assert.deepEqual(harness.calls.find((call) => call[0] === "setTimeout"), ["setTimeout", 10000]);
  assert.deepEqual(harness.calls.find((call) => call[0] === "clearTimeout"), ["clearTimeout", harness.timer]);
  assert.deepEqual(harness.calls.at(-1), ["exit", 0]);
});

test("graceful shutdown ignores a repeated signal", async () => {
  const harness = createHarness();

  await harness.gracefulShutdown("SIGTERM");
  await harness.gracefulShutdown("SIGINT");

  assert.equal(harness.calls.filter((call) => call[0] === "close").length, 1);
  assert.equal(harness.calls.filter((call) => call[0] === "setTimeout").length, 1);
  assert.match(harness.calls.at(-1)[1], /SIGINT qayta keldi/);
});

test("graceful shutdown preserves close and pool error handling", async () => {
  const harness = createHarness({
    closeError: new Error("close failed"),
    poolError: new Error("pool failed"),
  });

  await harness.gracefulShutdown("SIGTERM");
  await harness.finishClose();

  assert.ok(harness.calls.some((call) => call[0] === "error" && call[2] === "close failed"));
  assert.ok(harness.calls.some((call) => call[0] === "error" && call[2] === "pool failed"));
  assert.deepEqual(harness.calls.at(-1), ["exit", 0]);
});

test("graceful shutdown preserves forced timeout behavior", async () => {
  const harness = createHarness();

  await harness.gracefulShutdown("SIGTERM");
  harness.forceTimeout();

  assert.deepEqual(harness.calls.at(-2), ["error", "[Shutdown] 10s ichida yopilmadi — majburan chiqamiz."]);
  assert.deepEqual(harness.calls.at(-1), ["exit", 1]);
});
