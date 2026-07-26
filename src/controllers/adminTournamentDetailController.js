function createAdminTournamentDetailController({ pool, logger = console }) {
  return {
    async get(req, res) {
      try {
        const result = await pool.query(
          "SELECT * FROM tournaments WHERE id = $1",
          [req.params.id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ error: "Turnir topilmadi" });
        }
        res.json({ tournament: result.rows[0] });
      } catch (error) {
        logger.error("Turnir olish xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminTournamentDetailController };
