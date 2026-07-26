function createAdminTournamentListController({ pool, logger = console }) {
  return {
    async list(req, res) {
      try {
        const result = await pool.query(
          `SELECT t.*,
                  (SELECT COUNT(*) FROM tournament_schools ts WHERE ts.tournament_id = t.id) AS school_count
           FROM tournaments t
           ORDER BY t.created_at DESC`
        );
        res.json({ tournaments: result.rows });
      } catch (error) {
        logger.error("Turnirlar ro'yxati xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminTournamentListController };
