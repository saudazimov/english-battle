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
const { createGracefulShutdownService } = require("./gracefulShutdownService");
const { validateProductionEnvironment } = require("../config/productionEnvironment");

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
    socketServerFactory = createSocketServer,
    rootRouterFactory = rootRoutes,
    healthRouterFactory = createHealthRoutes,
    locationRouterFactory = createLocationRoutes,
  } = modules;

  const app = expressModule();
  const trustProxyHops = parseInt(environment.TRUST_PROXY_HOPS || "0", 10);
  if (trustProxyHops > 0) {
    app.set("trust proxy", trustProxyHops);
  }

  const server = httpModule.createServer(app);
  const corsOptions = createCorsOptions({ environment });
  const io = socketServerFactory({ server, corsOptions, pool, logger });

  app.use(helmetMiddleware(createHelmetOptions(environment)));
  app.use(corsMiddleware(corsOptions));
  app.use(compressionMiddleware());
  app.use(expressModule.json({ limit: "1mb" }));
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

function registerHttpErrorHandler({ app, MulterError, logger = console }) {
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
    logger.error("HTTP handler xatosi:", err && err.stack ? err.stack : err);
    return res.status(500).json({ error: "Server xatosi" });
  });
}

function registerProcessErrorHandlers({ processRef = process, logger = console } = {}) {
  processRef.on("uncaughtException", (err) => {
    logger.error(
      "‼️ USHLANMAGAN XATO (server ishlashda davom etadi):",
      err && err.stack ? err.stack : err
    );
  });
  processRef.on("unhandledRejection", (reason) => {
    logger.error(
      "‼️ RAD ETILGAN PROMISE (server ishlashda davom etadi):",
      reason && reason.stack ? reason.stack : reason
    );
  });
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
  server.listen(port, async () => {
    logger.log("Server ishga tushdi: http://localhost:3000");
    if (!environment.ESKIZ_EMAIL || !environment.ESKIZ_PASSWORD) {
      logger.warn(
        "⚠️  DIQQAT: SMS kredensiali yo'q — DEV rejim (OTP konsolga chiqadi). Production'da .env to'ldiring."
      );
    }

    await recoverActiveBattles();
  });

  const gracefulShutdown = gracefulShutdownFactory({ server, pool });
  processRef.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  processRef.on("SIGINT", () => gracefulShutdown("SIGINT"));

  return gracefulShutdown;
}

module.exports = {
  createCorsOptions,
  createHelmetOptions,
  createHttpApplication,
  registerHttpErrorHandler,
  registerProcessErrorHandlers,
  startHttpServer,
};
