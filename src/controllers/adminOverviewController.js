function createAdminOverviewController({ pool, logger = console }) {
  return {
    async getOverview(req, res) {
      try {
        var results = await Promise.all([
          pool.query("SELECT COUNT(*) AS c FROM questions"),
          pool.query("SELECT COUNT(*) AS c FROM users WHERE role = 'student'"),
          pool.query(
            "SELECT COUNT(*) AS c FROM users WHERE role = 'teacher' OR role = 'school_admin'"
          ),
          pool.query(
            "SELECT COUNT(DISTINCT school) AS c FROM users WHERE school IS NOT NULL AND school != ''"
          ),
          pool.query("SELECT COUNT(*) AS c FROM battle_history"),
          pool.query(
            "SELECT COUNT(*) AS c FROM users WHERE last_active_date = CURRENT_DATE"
          ),
          pool.query(
            "SELECT region, COUNT(*) AS c FROM users WHERE region IS NOT NULL AND region != '' GROUP BY region ORDER BY c DESC LIMIT 5"
          ),
          pool.query(
            "SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS c FROM questions WHERE created_at >= CURRENT_DATE - INTERVAL '6 days' GROUP BY day ORDER BY day"
          ),
        ]);

        res.json({
          totalQuestions: parseInt(results[0].rows[0].c),
          totalStudents: parseInt(results[1].rows[0].c),
          totalTeachers: parseInt(results[2].rows[0].c),
          totalSchools: parseInt(results[3].rows[0].c),
          totalBattles: parseInt(results[4].rows[0].c),
          activeToday: parseInt(results[5].rows[0].c),
          topRegions: results[6].rows.map(function (r) {
            return { name: r.region, count: parseInt(r.c) };
          }),
          questionGrowth: results[7].rows.map(function (r) {
            return { day: r.day, count: parseInt(r.c) };
          }),
        });
      } catch (error) {
        logger.error("Overview xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminOverviewController };
