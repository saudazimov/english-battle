function createGracefulShutdownService({
  server,
  pool,
  logger = console,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  exit = (code) => process.exit(code),
}) {
  let shuttingDown = false;

  return async function gracefulShutdown(signal) {
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
      exit(0);
    });
  };
}

module.exports = { createGracefulShutdownService };
