function createAdminAnalyticsReportService({ pool }) {
  return {
    async getReport(days) {
      const results = await Promise.all([
        pool.query("SELECT COUNT(*) AS c FROM users"),
        pool.query("SELECT COUNT(*) AS c FROM battle_history"),
        pool.query("SELECT COUNT(*) AS c FROM questions"),
        pool.query("SELECT COUNT(*) AS c FROM flags WHERE status = 'pending'"),
        pool.query(
          "SELECT COUNT(*) AS c FROM users WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval",
          [days - 1]
        ),
        pool.query(
          "SELECT COUNT(*) AS c FROM battle_history WHERE played_at >= CURRENT_DATE - ($1 || ' days')::interval",
          [days - 1]
        ),
        pool.query(
          "SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS c FROM users WHERE created_at >= CURRENT_DATE - ($1 || ' days')::interval GROUP BY day ORDER BY day",
          [days - 1]
        ),
        pool.query(
          "SELECT TO_CHAR(played_at, 'YYYY-MM-DD') AS day, COUNT(*) AS c FROM battle_history WHERE played_at >= CURRENT_DATE - ($1 || ' days')::interval GROUP BY day ORDER BY day",
          [days - 1]
        ),
        pool.query(
          "SELECT cefr_level, COUNT(*) AS c FROM users WHERE role = 'student' OR role IS NULL GROUP BY cefr_level"
        ),
        pool.query(
          "SELECT region, COUNT(*) AS c FROM users WHERE region IS NOT NULL AND region != '' GROUP BY region ORDER BY c DESC LIMIT 6"
        ),
        pool.query(
          "SELECT school, region, district, COUNT(*) AS c FROM users WHERE school IS NOT NULL AND school != '' GROUP BY school, region, district ORDER BY c DESC LIMIT 6"
        ),
      ]);

      return {
        days,
        totals: {
          users: parseInt(results[0].rows[0].c),
          battles: parseInt(results[1].rows[0].c),
          questions: parseInt(results[2].rows[0].c),
          pendingFlags: parseInt(results[3].rows[0].c),
          newUsers: parseInt(results[4].rows[0].c),
          periodBattles: parseInt(results[5].rows[0].c),
        },
        userGrowth: results[6].rows.map(function (row) {
          return { day: row.day, count: parseInt(row.c) };
        }),
        battleActivity: results[7].rows.map(function (row) {
          return { day: row.day, count: parseInt(row.c) };
        }),
        levelDistribution: results[8].rows.map(function (row) {
          return { level: row.cefr_level || "A1", count: parseInt(row.c) };
        }),
        topRegions: results[9].rows.map(function (row) {
          return { name: row.region, count: parseInt(row.c) };
        }),
        topSchools: results[10].rows.map(function (row) {
          return {
            name: row.school,
            region: row.region || "—",
            count: parseInt(row.c),
          };
        }),
      };
    },
  };
}

module.exports = { createAdminAnalyticsReportService };
