function createAdminTournamentDeleteController({ pool, logger = console }) {
  return {
    async remove(req, res) {
      const client = await pool.connect();
      try {
        const id = req.params.id;
        const current = await client.query(
          "SELECT id FROM tournaments WHERE id = $1",
          [id]
        );
        if (current.rows.length === 0) {
          client.release();
          return res.status(404).json({ error: "Turnir topilmadi" });
        }

        await client.query("BEGIN");
        await client.query(
          `DELETE FROM tournament_match_players
           WHERE match_id IN (SELECT id FROM tournament_matches WHERE tournament_id = $1)`,
          [id]
        );
        await client.query(
          "DELETE FROM tournament_matches WHERE tournament_id = $1",
          [id]
        );
        await client.query(
          "DELETE FROM tournament_team_members WHERE tournament_id = $1",
          [id]
        );
        await client.query(
          "DELETE FROM tournament_schools WHERE tournament_id = $1",
          [id]
        );
        await client.query("DELETE FROM tournaments WHERE id = $1", [id]);
        await client.query("COMMIT");
        client.release();
        res.json({ success: true });
      } catch (error) {
        await client.query("ROLLBACK");
        client.release();
        logger.error("Turnir o'chirish xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi: " + error.message });
      }
    },
  };
}

module.exports = { createAdminTournamentDeleteController };
