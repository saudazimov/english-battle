const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createCorsOptions,
  createHelmetOptions,
  createHttpApplication,
  registerHttpErrorHandler,
  registerProcessErrorHandlers,
  verifyProductionDatabase,
  startHttpServer,
} = require("../src/services/httpBootstrapService");
const {
  createInternalMetricsRoutes,
} = require("../src/routes/internalMetricsRoutes");
const {
  createApplicationObservability,
} = require("../src/utils/applicationObservability");

function resolveOrigin(options, origin) {
  let result;
  options.origin(origin, (error, allowed) => {
    result = { error, allowed };
  });
  return result;
}

test("production Nginx blocks the private metrics path from public proxying", () => {
  const nginxConfig = fs.readFileSync(
    path.resolve(__dirname, "../deploy/nginx.conf"),
    "utf8",
  );

  assert.match(
    nginxConfig,
    /location = \/internal\/metrics\s*\{\s*return 404;\s*\}/,
  );
});

test("HTTP bootstrap preserves CORS and Helmet security configuration", () => {
  const developmentCors = createCorsOptions({
    environment: {
      NODE_ENV: "development",
      CLIENT_ORIGIN: "https://app.example.com, https://admin.example.com ",
    },
  });

  assert.equal(developmentCors.credentials, true);
  assert.deepEqual(developmentCors.exposedHeaders, ["X-Request-ID"]);
  assert.deepEqual(resolveOrigin(developmentCors, undefined), { error: null, allowed: true });
  assert.deepEqual(resolveOrigin(developmentCors, "https://app.example.com"), {
    error: null,
    allowed: true,
  });
  assert.deepEqual(resolveOrigin(developmentCors, "http://localhost:4567"), {
    error: null,
    allowed: true,
  });
  assert.deepEqual(resolveOrigin(developmentCors, "https://blocked.example.com"), {
    error: null,
    allowed: false,
  });

  const productionCors = createCorsOptions({
    environment: { NODE_ENV: "production", CLIENT_ORIGIN: "" },
  });
  assert.deepEqual(resolveOrigin(productionCors, "http://localhost:3000"), {
    error: null,
    allowed: false,
  });

  const developmentHelmet = createHelmetOptions({ NODE_ENV: "development" });
  assert.equal(
    developmentHelmet.contentSecurityPolicy.directives.upgradeInsecureRequests,
    null
  );
  assert.deepEqual(developmentHelmet.contentSecurityPolicy.directives.connectSrc, [
    "'self'",
    "ws:",
    "wss:",
  ]);
  assert.deepEqual(developmentHelmet.contentSecurityPolicy.directives.formAction, [
    "'self'",
    "https://checkout.paycom.uz",
  ]);
  assert.equal(developmentHelmet.crossOriginEmbedderPolicy, false);
  assert.deepEqual(developmentHelmet.referrerPolicy, {
    policy: "strict-origin-when-cross-origin",
  });
  assert.deepEqual(
    createHelmetOptions({ NODE_ENV: "production" }).contentSecurityPolicy.directives
      .upgradeInsecureRequests,
    []
  );
});

test("HTTP application preserves construction and middleware order", () => {
  const appCalls = [];
  const useCalls = [];
  const app = {
    set(...args) {
      appCalls.push(["set", ...args]);
    },
    use(...args) {
      useCalls.push(args);
    },
  };
  function expressModule() {
    return app;
  }
  expressModule.json = (options) => ({ type: "json", options });
  expressModule.static = (directory) => ({ type: "static", directory });

  const server = { type: "server" };
  const io = { type: "io" };
  const pool = { type: "pool" };
  const logger = { type: "logger" };
  const socketCalls = [];
  const result = createHttpApplication({
    projectRoot: "project-root",
    pool,
    environment: {
      NODE_ENV: "development",
      CLIENT_ORIGIN: "https://app.example.com",
      TRUST_PROXY_HOPS: "2",
      PORT: "4567",
    },
    logger,
    modules: {
      expressModule,
      httpModule: {
        createServer(receivedApp) {
          assert.equal(receivedApp, app);
          return server;
        },
      },
      helmetMiddleware: (options) => ({ type: "helmet", options }),
      corsMiddleware: (options) => ({ type: "cors", options }),
      compressionMiddleware: () => ({ type: "compression" }),
      pathModule: { join: (...parts) => parts.join("/") },
      requestContextFactory: () => ({ type: "request-context" }),
      socketServerFactory(dependencies) {
        socketCalls.push(dependencies);
        return io;
      },
      rootRouterFactory: () => ({ type: "root" }),
      healthRouterFactory: (dependencies) => ({ type: "health", dependencies }),
      locationRouterFactory: () => ({ type: "locations" }),
      internalMetricsRouterFactory: (dependencies) => ({ type: "metrics", dependencies }),
    },
  });

  assert.deepEqual(appCalls, [["set", "trust proxy", 2]]);
  assert.equal(result.app, app);
  assert.equal(result.server, server);
  assert.equal(result.io, io);
  assert.equal(result.port, "4567");
  assert.deepEqual(socketCalls, [
    { server, corsOptions: result.corsOptions, pool, logger },
  ]);
  assert.deepEqual(
    useCalls.map((args) => (args.length === 1 ? args[0].type : args[0])),
    [
      "request-context",
      "helmet",
      "cors",
      "compression",
      "json",
      "metrics",
      "/vendor/flag-icons",
      "/uploads/resources",
      "static",
      "root",
      "health",
      "locations",
    ]
  );
  assert.deepEqual(useCalls[4][0], { type: "json", options: { limit: "1mb" } });
  assert.deepEqual(useCalls[5][0], {
    type: "metrics",
    dependencies: {
      io,
      environment: {
        NODE_ENV: "development",
        CLIENT_ORIGIN: "https://app.example.com",
        TRUST_PROXY_HOPS: "2",
        PORT: "4567",
      },
    },
  });
  assert.deepEqual(useCalls[6][1], {
    type: "static",
    directory: "project-root/node_modules/flag-icons",
  });
  assert.deepEqual(useCalls[8][0], { type: "static", directory: "public" });
  assert.deepEqual(useCalls[10][0], { type: "health", dependencies: { pool } });

  const uploadResponse = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  useCalls[7][1]({}, uploadResponse);
  assert.equal(uploadResponse.statusCode, 404);
  assert.deepEqual(uploadResponse.body, { error: "Topilmadi" });
});

test("private metrics endpoint hides failures and exposes aggregate Prometheus metrics", () => {
  let handler;
  const router = createInternalMetricsRoutes({
    environment: { METRICS_TOKEN: "metrics-token-unique-0123456789" },
    expressModule: {
      Router: () => ({
        get(path, receivedHandler) {
          assert.equal(path, "/internal/metrics");
          handler = receivedHandler;
        },
      }),
    },
    observability: {
      snapshot: () => ({
        activeConnections: 3,
        counters: { socket_auth_accepted_total: 7, socket_errors_total: 2 },
      }),
    },
    applicationObservability: {
      snapshot: () => ({
        counters: {
          learning_retest_schedule_failures_total: 4,
          learning_retest_recoveries_total: 9,
        },
        gauges: {
          learning_retest_recovery_backlog: 3,
          learning_retest_recovery_batch_duration_seconds: 0.25,
        },
      }),
    },
  });
  assert.ok(router);

  function run(authorization) {
    const response = {
      statusCode: 200,
      headers: {},
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      set(name, value) { this.headers[name] = value; return this; },
      send(body) { this.body = body; return this; },
    };
    handler({ headers: { authorization } }, response);
    return response;
  }

  const rejected = run("Bearer wrong-token");
  assert.equal(rejected.statusCode, 404);
  assert.deepEqual(rejected.body, { error: "Topilmadi" });

  const accepted = run("Bearer metrics-token-unique-0123456789");
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.headers["Cache-Control"], "no-store");
  assert.equal(accepted.headers["Content-Type"], "text/plain; version=0.0.4; charset=utf-8");
  assert.match(accepted.body, /socket_auth_accepted_total 7/);
  assert.match(accepted.body, /socket_connections_active 3/);
  assert.match(accepted.body, /socket_auth_rejected_total 0/);
  assert.match(accepted.body, /socket_errors_total 2/);
  assert.match(accepted.body, /learning_retest_schedule_failures_total 4/);
  assert.match(accepted.body, /learning_retest_recoveries_total 9/);
  assert.match(accepted.body, /learning_retest_recovery_backlog 3/);
  assert.match(accepted.body, /learning_retest_recovery_batch_duration_seconds 0\.25/);
});

test("application observability counts operational failures without storing details", () => {
  const observability = createApplicationObservability();

  assert.equal(observability.increment("learning_retest_schedule_failures_total"),1);
  assert.equal(observability.increment("learning_retest_schedule_failures_total",2),3);
  assert.equal(observability.setGauge("learning_retest_recovery_backlog",7),7);
  assert.deepEqual(observability.snapshot(), {
    counters: { learning_retest_schedule_failures_total: 3 },
    gauges: { learning_retest_recovery_backlog: 7 },
  });
  assert.throws(() => observability.setGauge("invalid",-1),/finite non-negative/);
});

test("private metrics endpoint stays disabled without a configured token", () => {
  let handler;
  createInternalMetricsRoutes({
    environment: {},
    expressModule: { Router: () => ({ get: (_path, value) => { handler = value; } }) },
    observability: { snapshot: () => { throw new Error("must not be read"); } },
    applicationObservability: { snapshot: () => { throw new Error("must not be read"); } },
  });
  const response = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  handler({ headers: { authorization: "Bearer anything" } }, response);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Topilmadi" });
});

test("HTTP error handler preserves Multer, file and server responses", () => {
  class MulterError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }

  let handler;
  const logCalls = [];
  registerHttpErrorHandler({
    app: { use(receivedHandler) { handler = receivedHandler; } },
    MulterError,
    logger: { error: (...args) => logCalls.push(args) },
  });

  function run(error) {
    let nextCount = 0;
    const response = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    handler(error, { requestId: "request-test-id" }, response, () => { nextCount += 1; });
    return { response, nextCount };
  }

  assert.equal(run(null).nextCount, 1);
  const fileSizeResult = run(new MulterError("LIMIT_FILE_SIZE"));
  assert.equal(fileSizeResult.response.statusCode, 400);
  assert.deepEqual(fileSizeResult.response.body, {
    error: "Fayl hajmi ruxsat etilgan limitdan katta",
  });
  assert.deepEqual(run(new MulterError("LIMIT_UNEXPECTED_FILE")).response.body, {
    error: "Faylni yuklashda xato",
  });
  assert.deepEqual(run(new Error("Rasm formati noto'g'ri")).response.body, {
    error: "Rasm formati noto'g'ri",
  });

  const genericError = new Error("database failed");
  const genericResult = run(genericError);
  assert.equal(genericResult.response.statusCode, 500);
  assert.deepEqual(genericResult.response.body, { error: "Server xatosi" });
  assert.deepEqual(logCalls, [[
    "HTTP handler xatosi",
    { requestId: "request-test-id", error: genericError },
  ]]);
});

test("process error handlers preserve events and logging", () => {
  const handlers = {};
  const logCalls = [];
  registerProcessErrorHandlers({
    processRef: {
      on(event, handler) {
        handlers[event] = handler;
      },
    },
    logger: { error: (...args) => logCalls.push(args) },
  });

  assert.deepEqual(Object.keys(handlers), ["uncaughtException", "unhandledRejection"]);
  const uncaught = new Error("uncaught");
  handlers.uncaughtException(uncaught);
  handlers.unhandledRejection("rejected");
  assert.deepEqual(logCalls, [
    ["‼️ USHLANMAGAN XATO (server ishlashda davom etadi):", uncaught.stack],
    ["‼️ RAD ETILGAN PROMISE (server ishlashda davom etadi):", "rejected"],
  ]);
});

test("production process errors trigger one fatal graceful shutdown", () => {
  const handlers = {};
  const shutdownCalls = [];
  const exitCalls = [];
  const logCalls = [];
  const logger = {
    isStructuredLogger: true,
    error: (...args) => logCalls.push(args),
  };

  registerProcessErrorHandlers({
    environment: { NODE_ENV: "production" },
    processRef: {
      on: (event, handler) => { handlers[event] = handler; },
      exit: (code) => exitCalls.push(code),
    },
    logger,
    gracefulShutdown: (...args) => shutdownCalls.push(args),
  });

  const firstError = new Error("first fatal");
  const repeatedError = new Error("repeated fatal");
  handlers.uncaughtException(firstError);
  handlers.unhandledRejection(repeatedError);

  assert.deepEqual(shutdownCalls, [["FATAL:uncaughtException", 1]]);
  assert.deepEqual(exitCalls, []);
  assert.deepEqual(logCalls, [
    ["Fatal process xatosi; xavfsiz shutdown boshlandi", { event: "uncaughtException", error: firstError }],
    ["Takroriy fatal process xatosi; shutdown allaqachon boshlandi", { event: "unhandledRejection", error: repeatedError }],
  ]);
});

test("production process error exits 1 when graceful shutdown is unavailable", () => {
  const handlers = {};
  const exitCalls = [];
  registerProcessErrorHandlers({
    environment: { NODE_ENV: "production" },
    processRef: {
      on: (event, handler) => { handlers[event] = handler; },
      exit: (code) => exitCalls.push(code),
    },
    logger: { isStructuredLogger: true, error() {} },
  });

  handlers.uncaughtException(new Error("fatal"));
  assert.deepEqual(exitCalls, [1]);
});

test("production process error exits 1 when graceful shutdown rejects", async () => {
  const handlers = {};
  const exitCalls = [];
  const logCalls = [];
  registerProcessErrorHandlers({
    environment: { NODE_ENV: "production" },
    processRef: {
      on: (event, handler) => { handlers[event] = handler; },
      exit: (code) => exitCalls.push(code),
    },
    logger: {
      isStructuredLogger: true,
      error: (...args) => logCalls.push(args),
    },
    gracefulShutdown: () => Promise.reject(new Error("shutdown rejected")),
  });

  handlers.unhandledRejection(new Error("fatal"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(exitCalls, [1]);
  assert.equal(logCalls.some(([message]) => message === "Fatal shutdown bajarilmadi"), true);
});

test("HTTP startup preserves listen, recovery and shutdown signal order", async () => {
  const order = [];
  const handlers = {};
  const gracefulSignals = [];
  const logCalls = [];
  let listenCallback;
  const server = {
    listen(port, callback) {
      order.push(["listen", port]);
      listenCallback = callback;
    },
  };
  const pool = {};
  const gracefulShutdown = (signal) => gracefulSignals.push(signal);
  const logger = {
    log: (...args) => logCalls.push(["log", ...args]),
    warn: (...args) => logCalls.push(["warn", ...args]),
    error: (...args) => logCalls.push(["error", ...args]),
  };

  const returned = startHttpServer({
    server,
    port: 3450,
    pool,
    recoverActiveBattles: async () => order.push(["recover"]),
    environment: { NODE_ENV: "development" },
    processRef: {
      on(event, handler) {
        order.push(["on", event]);
        handlers[event] = handler;
      },
      exit(code) {
        order.push(["exit", code]);
      },
    },
    logger,
    gracefulShutdownFactory(dependencies) {
      order.push(["graceful-factory", dependencies]);
      return gracefulShutdown;
    },
  });

  assert.equal(typeof returned, "function");
  assert.deepEqual(order, [
    ["listen", 3450],
    ["graceful-factory", { server, pool, logger }],
    ["on", "uncaughtException"],
    ["on", "unhandledRejection"],
    ["on", "SIGTERM"],
    ["on", "SIGINT"],
  ]);

  await listenCallback();
  assert.deepEqual(order.at(-1), ["recover"]);
  assert.deepEqual(logCalls, [
    ["log", "Server ishga tushdi: http://localhost:3000"],
    [
      "warn",
      "⚠️  DIQQAT: SMS kredensiali yo'q — DEV rejim (OTP konsolga chiqadi). Production'da .env to'ldiring.",
    ],
  ]);

  handlers.SIGTERM();
  handlers.SIGINT();
  assert.deepEqual(gracefulSignals, ["SIGTERM", "SIGINT"]);
});

test("production database preflight is bounded and development skips it", async () => {
  const queries = [];
  await verifyProductionDatabase({
    pool: { query: async (query) => queries.push(query) },
    environment: { NODE_ENV: "development" },
  });
  assert.deepEqual(queries, []);

  await verifyProductionDatabase({
    pool: { query: async (query) => queries.push(query) },
    environment: { NODE_ENV: "production", DB_STARTUP_TIMEOUT_MS: "4321" },
  });
  assert.deepEqual(queries, [{ text: "SELECT 1", query_timeout: 4321 }]);
});

test("production HTTP listen waits for database preflight", async () => {
  const order = [];
  let resolveQuery;
  let listenCallback;
  const pool = {
    query(query) {
      order.push(["query", query]);
      return new Promise((resolve) => { resolveQuery = resolve; });
    },
    async end() { order.push(["pool.end"]); },
  };
  const server = {
    listen(port, callback) {
      order.push(["listen", port]);
      listenCallback = callback;
    },
  };

  startHttpServer({
    server,
    port: 3000,
    pool,
    recoverActiveBattles: async () => order.push(["recover"]),
    environment: {
      NODE_ENV: "production",
      DB_STARTUP_TIMEOUT_MS: "4321",
      ESKIZ_EMAIL: "sms@ilmliga.uz",
      ESKIZ_PASSWORD: "password",
    },
    processRef: { on: () => {}, exit: (code) => order.push(["exit", code]) },
    logger: { isStructuredLogger: true, log: () => {}, warn: () => {}, error: () => {} },
    gracefulShutdownFactory: () => () => {},
  });

  assert.deepEqual(order, [["query", { text: "SELECT 1", query_timeout: 4321 }]]);
  resolveQuery();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order.at(-1), ["listen", 3000]);
  await listenCallback();
  assert.deepEqual(order.at(-1), ["recover"]);
});

test("production DB preflight failure closes pool and exits without listening", async () => {
  const order = [];
  const logCalls = [];
  const connectionError = Object.assign(
    new Error("postgres://db-user:raw-db-password@db-host/database"),
    { code: "ECONNREFUSED" }
  );

  startHttpServer({
    server: { listen: () => order.push(["listen"]) },
    port: 3000,
    pool: {
      query: async () => { throw connectionError; },
      end: async () => order.push(["pool.end"]),
    },
    recoverActiveBattles: async () => {},
    environment: { NODE_ENV: "production" },
    processRef: { on: () => {}, exit: (code) => order.push(["exit", code]) },
    logger: {
      isStructuredLogger: true,
      log() {},
      warn() {},
      error: (...args) => logCalls.push(args),
    },
    gracefulShutdownFactory: () => () => {},
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(order, [["pool.end"], ["exit", 1]]);
  assert.deepEqual(logCalls, [[
    "Production startup DB preflight muvaffaqiyatsiz",
    { errorName: "Error", errorCode: "ECONNREFUSED" },
  ]]);
  assert.doesNotMatch(JSON.stringify(logCalls), /raw-db-password|postgres:\/\//);
});

test("production shutdown cancels a pending database preflight", async () => {
  const handlers = {};
  const order = [];
  let resolveQuery;
  const gracefulShutdown = (...args) => order.push(["shutdown", ...args]);

  startHttpServer({
    server: { listen: () => order.push(["listen"]) },
    port: 3000,
    pool: {
      query: () => new Promise((resolve) => { resolveQuery = resolve; }),
      end: async () => {},
    },
    recoverActiveBattles: async () => {},
    environment: { NODE_ENV: "production" },
    processRef: {
      on: (event, handler) => { handlers[event] = handler; },
      exit: () => {},
    },
    logger: { isStructuredLogger: true, log() {}, warn() {}, error() {} },
    gracefulShutdownFactory: () => gracefulShutdown,
  });

  handlers.SIGTERM();
  resolveQuery();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, [["shutdown", "SIGTERM", 0]]);
});

test("HTTP application validates configuration before creating Express", () => {
  let expressCreated = false;
  const expected = new Error("invalid production environment");

  assert.throws(
    () => createHttpApplication({
      projectRoot: "project-root",
      pool: {},
      environment: { NODE_ENV: "production" },
      configurationValidator(environment) {
        assert.equal(environment.NODE_ENV, "production");
        throw expected;
      },
      modules: {
        expressModule() {
          expressCreated = true;
          return {};
        },
      },
    }),
    (error) => error === expected
  );
  assert.equal(expressCreated, false);
});
