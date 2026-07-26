function createHealthController({ pool, processRef = process, logger = console }) {
  function health(req, res) {
    return res.status(200).json({
      status: "ok",
      uptime: Math.floor(processRef.uptime()),
    });
  }

  async function ready(req, res) {
    try {
      await pool.query("SELECT 1");
      return res.status(200).json({ status: "ready" });
    } catch (error) {
      logger.error("Readiness check DB xatosi:", error.message);
      return res.status(503).json({ status: "not_ready" });
    }
  }

  return { health, ready };
}

module.exports = { createHealthController };
