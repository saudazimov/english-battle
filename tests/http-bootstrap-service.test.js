const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCorsOptions,
  createHelmetOptions,
  createHttpApplication,
  registerHttpErrorHandler,
  registerProcessErrorHandlers,
  startHttpServer,
} = require("../src/services/httpBootstrapService");

function resolveOrigin(options, origin) {
  let result;
  options.origin(origin, (error, allowed) => {
    result = { error, allowed };
  });
  return result;
}

test("HTTP bootstrap preserves CORS and Helmet security configuration", () => {
  const developmentCors = createCorsOptions({
    environment: {
      NODE_ENV: "development",
      CLIENT_ORIGIN: "https://app.example.com, https://admin.example.com ",
    },
  });

  assert.equal(developmentCors.credentials, true);
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
      socketServerFactory(dependencies) {
        socketCalls.push(dependencies);
        return io;
      },
      rootRouterFactory: () => ({ type: "root" }),
      healthRouterFactory: (dependencies) => ({ type: "health", dependencies }),
      locationRouterFactory: () => ({ type: "locations" }),
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
      "helmet",
      "cors",
      "compression",
      "json",
      "/vendor/flag-icons",
      "/uploads/resources",
      "static",
      "root",
      "health",
      "locations",
    ]
  );
  assert.deepEqual(useCalls[3][0], { type: "json", options: { limit: "1mb" } });
  assert.deepEqual(useCalls[4][1], {
    type: "static",
    directory: "project-root/node_modules/flag-icons",
  });
  assert.deepEqual(useCalls[6][0], { type: "static", directory: "public" });
  assert.deepEqual(useCalls[8][0], { type: "health", dependencies: { pool } });

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
  useCalls[5][1]({}, uploadResponse);
  assert.equal(uploadResponse.statusCode, 404);
  assert.deepEqual(uploadResponse.body, { error: "Topilmadi" });
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
    handler(error, {}, response, () => { nextCount += 1; });
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
  assert.deepEqual(logCalls, [["HTTP handler xatosi:", genericError.stack]]);
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
    logger: {
      log: (...args) => logCalls.push(["log", ...args]),
      warn: (...args) => logCalls.push(["warn", ...args]),
      error: (...args) => logCalls.push(["error", ...args]),
    },
    gracefulShutdownFactory(dependencies) {
      order.push(["graceful-factory", dependencies]);
      return gracefulShutdown;
    },
  });

  assert.equal(returned, gracefulShutdown);
  assert.deepEqual(order, [
    ["listen", 3450],
    ["graceful-factory", { server, pool }],
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
