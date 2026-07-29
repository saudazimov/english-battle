function formatSchool(row, me) {
  return {
    rank: parseInt(row.rank), region: row.region, district: row.district, school: row.school,
    total_points: row.total_points, active_students: row.active_students,
    avg_points: row.active_students ? Math.round(row.total_points / row.active_students) : 0,
    is_mine: !!(me.school && row.region === me.region && row.district === me.district && row.school === me.school),
  };
}

async function rankIn(pool, totalPoints, condition, params) {
  const result = await pool.query(
    `SELECT COUNT(*) + 1 AS rank FROM (
           SELECT region, district, school, SUM(points) AS tp FROM school_battle_points
           ${condition ? "WHERE " + condition : ""} GROUP BY region, district, school
         ) s WHERE s.tp > $${params.length + 1}`,
    [...params, totalPoints]
  );
  return parseInt(result.rows[0].rank);
}

async function countSchools(pool, condition, params) {
  const result = await pool.query(
    `SELECT COUNT(*) AS c FROM (SELECT 1 FROM school_battle_points ${condition ? "WHERE " + condition : ""} GROUP BY region, district, school) s`,
    params
  );
  return parseInt(result.rows[0].c);
}

function createSchoolBattleRankingsService({ pool, currentSeason }) {
  return {
    async getRankings(userId, query) {
      const scope = ["national", "region", "district"].includes(query.scope) ? query.scope : "national";
      const period = ["all", "week", "month", "season"].includes(query.period) ? query.period : "all";
      const page = Math.max(1, parseInt(query.page) || 1);
      const pageSize = 50;
      const offset = (page - 1) * pageSize;

      const userResult = await pool.query("SELECT region, district, school FROM users WHERE id = $1", [userId]);
      const me = userResult.rows[0] || {};
      const conditions = [];
      const params = [];
      let parameterIndex = 1;
      if (period === "week") conditions.push("created_at >= date_trunc('week', NOW())");
      else if (period === "month") conditions.push("created_at >= date_trunc('month', NOW())");
      else if (period === "season") { conditions.push(`season = $${parameterIndex++}`); params.push(currentSeason()); }
      if (scope === "region") { conditions.push(`region = $${parameterIndex++}`); params.push(me.region); }
      else if (scope === "district") { conditions.push(`region = $${parameterIndex++}`); params.push(me.region); conditions.push(`district = $${parameterIndex++}`); params.push(me.district); }
      const whereSql = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

      const cte = `
      WITH ranked AS (
        SELECT region, district, school,
               SUM(points)::int AS total_points,
               COUNT(DISTINCT user_id)::int AS active_students,
               ROW_NUMBER() OVER (ORDER BY SUM(points) DESC, COUNT(DISTINCT user_id) DESC, school ASC) AS rank
        FROM school_battle_points
        ${whereSql}
        GROUP BY region, district, school
      )`;
      const pageResult = await pool.query(
        `${cte} SELECT *, COUNT(*) OVER() AS total_schools FROM ranked ORDER BY rank LIMIT ${pageSize} OFFSET ${offset}`,
        params
      );

      let mySchool = null;
      if (me.school) {
        const mineResult = await pool.query(
          `${cte} SELECT * FROM ranked WHERE region = $${parameterIndex} AND district = $${parameterIndex + 1} AND school = $${parameterIndex + 2}`,
          [...params, me.region, me.district, me.school]
        );
        mySchool = mineResult.rows[0] || null;
      }

      const totalSchools = pageResult.rows[0] ? parseInt(pageResult.rows[0].total_schools) : 0;
      return {
        scope, period, page, pageSize, total_schools: totalSchools,
        schools: pageResult.rows.map((row) => formatSchool(row, me)),
        my_school: mySchool ? formatSchool(mySchool, me) : null,
      };
    },

    async getMySchool(userId) {
      const userResult = await pool.query("SELECT region, district, school FROM users WHERE id = $1", [userId]);
      const me = userResult.rows[0] || {};
      if (!me.school) return { has_school: false };

      const totals = await pool.query(
        `SELECT COALESCE(SUM(points),0)::int AS total_points, COUNT(DISTINCT user_id)::int AS active_students
       FROM school_battle_points WHERE region=$1 AND district=$2 AND school=$3`,
        [me.region, me.district, me.school]
      );
      const totalPoints = totals.rows[0].total_points;
      const activeStudents = totals.rows[0].active_students;
      const seasonTotals = await pool.query(
        `SELECT COALESCE(SUM(points),0)::int AS sp FROM school_battle_points WHERE region=$1 AND district=$2 AND school=$3 AND season=$4`,
        [me.region, me.district, me.school, currentSeason()]
      );
      const seasonPoints = seasonTotals.rows[0].sp;

      const rankNational = await rankIn(pool, totalPoints, "", []);
      const rankRegion = await rankIn(pool, totalPoints, "region = $1", [me.region]);
      const rankDistrict = await rankIn(pool, totalPoints, "region = $1 AND district = $2", [me.region, me.district]);
      const totalNational = await countSchools(pool, "", []);
      const totalRegion = await countSchools(pool, "region = $1", [me.region]);
      const totalDistrict = await countSchools(pool, "region = $1 AND district = $2", [me.region, me.district]);

      const mine = await pool.query(`SELECT COALESCE(SUM(points),0)::int AS my_points FROM school_battle_points WHERE user_id = $1`, [userId]);
      const myContribution = mine.rows[0].my_points;
      const myRank = await pool.query(
        `SELECT COUNT(*) + 1 AS rank FROM (
         SELECT user_id, SUM(points) AS up FROM school_battle_points
         WHERE region=$1 AND district=$2 AND school=$3 GROUP BY user_id
       ) c WHERE c.up > $4`,
        [me.region, me.district, me.school, myContribution]
      );

      return {
        has_school: true,
        region: me.region, district: me.district, school: me.school,
        total_points: totalPoints, season_points: seasonPoints, active_students: activeStudents,
        rank_national: rankNational, rank_region: rankRegion, rank_district: rankDistrict,
        total_national: totalNational, total_region: totalRegion, total_district: totalDistrict,
        my_contribution: myContribution, my_rank_in_school: parseInt(myRank.rows[0].rank),
      };
    },
  };
}

module.exports = { createSchoolBattleRankingsService };
