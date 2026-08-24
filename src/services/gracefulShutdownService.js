function createGracefulShutdownService({
  server,
  io,
  pool,
  logger = console,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  exit = (code) => process.exit(code),
}) {
  let shuttingDown = false;
  let requestedExitCode = 0;

  return async function gracefulShutdown(signal, exitCode = 0) {
    if (exitCode !== 0) requestedExitCode = 1;
    if (shuttingDown) {
      logger.log(`[Shutdown] ${signal} qayta keldi — allaqachon to'xtayapmiz, e'tiborsiz.`);
      return;
    }
    shuttingDown = true;
    logger.log(`[Shutdown] ${signal} qabul qilindi — toza to'xtash boshlandi...`);

    const forceTimer = setTimeoutFn(() => {
      logger.error("[Shutdown] 10s ichida yopilmadi — majburan chiqamiz.");
      exit(1);
    }, 10000);
    forceTimer.unref();

    try {
      if (io && typeof io.disconnectSockets === "function") {
        io.disconnectSockets(true);
        logger.log("[Shutdown] Socket.IO ulanishlari yopildi.");
      }
    } catch (error) {
      logger.error("[Shutdown] Socket.IO ulanishlarini yopish xatosi:", error.message);
    }

    server.close(async (err) => {
      if (err) logger.error("[Shutdown] server.close xatosi:", err.message);
      else logger.log("[Shutdown] HTTP server yopildi (yangi ulanish qabul qilinmaydi).");

      try {
        await pool.end();
        logger.log("[Shutdown] PostgreSQL pool yopildi.");
      } catch (error) {
        logger.error("[Shutdown] pool.end xatosi:", error.message);
      }

      clearTimeoutFn(forceTimer);
      logger.log("[Shutdown] Tugadi. Xayr.");
      exit(requestedExitCode);
    });
  };
}

module.exports = { createGracefulShutdownService };
