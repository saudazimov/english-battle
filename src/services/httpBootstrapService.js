const express = require("express");
const http = require("http");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const path = require("path");

const { createSocketServer } = require("../sockets/socketBootstrap");
const rootRoutes = require("../routes/rootRoutes");
const { createHealthRoutes } = require("../routes/healthRoutes");
const { createLocationRoutes } = require("../routes/locationRoutes");
const { createInternalMetricsRoutes } = require("../routes/internalMetricsRoutes");
const { createGracefulShutdownService } = require("./gracefulShutdownService");
const { validateProductionEnvironment } = require("../config/productionEnvironment");
const { databaseStartupTimeout } = require("../config/databasePoolConfig");
const { createRequestContextMiddleware } = require("../middleware/requestContext");
const { productionLogger } = require("../utils/structuredLogger");

function createCorsOptions({ environment = process.env } = {}) {
  const allowedOrigins = (environment.CLIENT_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (
        environment.NODE_ENV !== "production" &&
        /^https?:\/\/localhost(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    exposedHeaders: ["X-Request-ID"],
  };
}

function createHelmetOptions(environment) {
  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://flagcdn.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'", "https://checkout.paycom.uz"],
        upgradeInsecureRequests: environment.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  };
}

function createHttpApplication({
  projectRoot,
  pool,
  environment = process.env,
  logger = console,
  configurationValidator = validateProductionEnvironment,
  modules = {},
}) {
  configurationValidator(environment);

  const {
    expressModule = express,
    httpModule = http,
    helmetMiddleware = helmet,
    corsMiddleware = cors,
    compressionMiddleware = compression,
    pathModule = path,
    requestContextFactory = createRequestContextMiddleware,
    socketServerFactory = createSocketServer,
    rootRouterFactory = rootRoutes,
    healthRouterFactory = createHealthRoutes,
    locationRouterFactory = createLocationRoutes,
    internalMetricsRouterFactory = createInternalMetricsRoutes,
  } = modules;

  const app = expressModule();
  const trustProxyHops = parseInt(environment.TRUST_PROXY_HOPS || "0", 10);
  if (trustProxyHops > 0) {
    app.set("trust proxy", trustProxyHops);
  }

  const server = httpModule.createServer(app);
  const corsOptions = createCorsOptions({ environment });
  const appLogger = productionLogger(logger, environment);
  const io = socketServerFactory({ server, corsOptions, pool, logger: appLogger });

  app.use(requestContextFactory({ environment, logger: appLogger }));
  app.use(helmetMiddleware(createHelmetOptions(environment)));
  app.use(corsMiddleware(corsOptions));
  app.use(compressionMiddleware());
  app.use(expressModule.json({ limit: "1mb" }));
  app.use(internalMetricsRouterFactory({ io, environment }));
  app.use(
    "/vendor/flag-icons",
    expressModule.static(pathModule.join(projectRoot, "node_modules", "flag-icons"))
  );
  app.use("/uploads/resources", (req, res) =>
    res.status(404).json({ error: "Topilmadi" })
  );
  app.use(expressModule.static("public"));
  app.use(rootRouterFactory());
  app.use(healthRouterFactory({ pool }));
  app.use(locationRouterFactory());

  return {
    app,
    server,
    io,
    corsOptions,
    port: environment.PORT || 3000,
  };
}

function registerHttpErrorHandler({ app, MulterError, environment = process.env, logger = console }) {
  const appLogger = productionLogger(logger, environment);
  app.use((err, req, res, next) => {
    if (!err) return next();
    if (err instanceof MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Fayl hajmi ruxsat etilgan limitdan katta"
          : "Faylni yuklashda xato";
      return res.status(400).json({ error: message });
    }
    if (err.message && /fayl|format|rasm|image|pdf/i.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    appLogger.error("HTTP handler xatosi", { requestId: req.requestId, error: err });
    return res.status(500).json({ error: "Server xatosi" });
  });
}

function registerProcessErrorHandlers({
  environment = process.env,
  processRef = process,
  logger = console,
  gracefulShutdown,
} = {}) {
  const appLogger = productionLogger(logger, environment);
  let handlingFatalError = false;

  function handleFatalError(event, error) {
    if (environment.NODE_ENV !== "production") {
      const label = event === "uncaughtException" ? "USHLANMAGAN XATO" : "RAD ETILGAN PROMISE";
      appLogger.error(`‼️ ${label} (server ishlashda davom etadi):`, error && error.stack ? error.stack : error);
      return;
    }
    if (handlingFatalError) {
      appLogger.error("Takroriy fatal process xatosi; shutdown allaqachon boshlandi", { event, error });
      return;
    }
    handlingFatalError = true;
    appLogger.error("Fatal process xatosi; xavfsiz shutdown boshlandi", { event, error });

    if (typeof gracefulShutdown !== "function") {
      processRef.exit(1);
      return;
    }
    try {
      const shutdownResult = gracefulShutdown(`FATAL:${event}`, 1);
      if (shutdownResult && typeof shutdownResult.catch === "function") {
        shutdownResult.catch((shutdownError) => {
          appLogger.error("Fatal shutdown bajarilmadi", { event, error: shutdownError });
          processRef.exit(1);
        });
      }
    } catch (shutdownError) {
      appLogger.error("Fatal shutdown bajarilmadi", { event, error: shutdownError });
      processRef.exit(1);
    }
  }

  processRef.on("uncaughtException", (error) => handleFatalError("uncaughtException", error));
  processRef.on("unhandledRejection", (error) => handleFatalError("unhandledRejection", error));
}

async function verifyProductionDatabase({ pool, environment = process.env }) {
  if (environment.NODE_ENV !== "production") return;
  await pool.query({
    text: "SELECT 1",
    query_timeout: databaseStartupTimeout(environment),
  });
}

async function failProductionStartup({ error, pool, processRef, logger }) {
  logger.error("Production startup DB preflight muvaffaqiyatsiz", {
    errorName: error && error.name,
    errorCode: error && error.code,
  });
  const forceExitTimer = setTimeout(() => {
    logger.error("Production startup DB cleanup timeout; majburiy exit");
    processRef.exit(1);
  }, 5000);
  forceExitTimer.unref();
  try {
    if (pool && typeof pool.end === "function") await pool.end();
  } catch (poolError) {
    logger.error("Production startupda PostgreSQL pool yopilmadi", {
      errorName: poolError && poolError.name,
      errorCode: poolError && poolError.code,
    });
  } finally {
    clearTimeout(forceExitTimer);
    processRef.exit(1);
  }
}

function startHttpServer({
  server,
  port,
  pool,
  recoverActiveBattles,
  environment = process.env,
  processRef = process,
  logger = console,
  gracefulShutdownFactory = createGracefulShutdownService,
}) {
  const appLogger = productionLogger(logger, environment);
  let startupActive = true;
  const listen = () => server.listen(port, async () => {
    appLogger.log("Server ishga tushdi: http://localhost:3000");
    const smsEnabled = String(environment.SMS_ENABLED || "").toLowerCase() === "true";
    if (smsEnabled && (!environment.ESKIZ_EMAIL || !environment.ESKIZ_PASSWORD)) {
      appLogger.warn(
        "⚠️  DIQQAT: SMS kredensiali yo'q — DEV rejim (OTP konsolga chiqadi). Production'da .env to'ldiring."
      );
    }

    await recoverActiveBattles();
  });
  if (environment.NODE_ENV !== "production") listen();

  const gracefulShutdown = gracefulShutdownFactory({ server, pool, logger: appLogger });
  const stopServer = (signal, exitCode = 0) => {
    startupActive = false;
    return gracefulShutdown(signal, exitCode);
  };
  registerProcessErrorHandlers({ environment, processRef, logger: appLogger, gracefulShutdown: stopServer });
  processRef.on("SIGTERM", () => stopServer("SIGTERM"));
  processRef.on("SIGINT", () => stopServer("SIGINT"));
  if (environment.NODE_ENV === "production") {
    verifyProductionDatabase({ pool, environment })
      .then(() => { if (startupActive) listen(); })
      .catch((error) => {
        if (startupActive) return failProductionStartup({ error, pool, processRef, logger: appLogger });
      });
  }

  return stopServer;
}

module.exports = {
  createCorsOptions,
  createHelmetOptions,
  createHttpApplication,
  registerHttpErrorHandler,
  registerProcessErrorHandlers,
  verifyProductionDatabase,
  startHttpServer,
};
