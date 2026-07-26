function createSchoolTournamentTeamSaveController({ pool, getSchoolAdmin, logger = console }) {
  async function save(req, res) {
    const client = await pool.connect();
    try {
      const schoolAdmin = await getSchoolAdmin(req.user.id);
      if (!schoolAdmin.ok) {
        client.release();
        return res.status(403).json({ error: schoolAdmin.error });
      }
      const admin = schoolAdmin.user;
      const tournamentId = req.params.id;

      const tournamentResult = await client.query("SELECT * FROM tournaments WHERE id = $1", [tournamentId]);
      if (tournamentResult.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: "Turnir topilmadi" });
      }
      const tournament = tournamentResult.rows[0];

      if (tournament.status !== "registration") {
        client.release();
        return res.status(400).json({ error: "Ro'yxatdan o'tish yopilgan — jamoani o'zgartirib bo'lmaydi" });
      }
      if (tournament.registration_deadline && new Date() > new Date(tournament.registration_deadline)) {
        client.release();
        return res.status(400).json({ error: "Jamoa tuzish muddati tugagan" });
      }

      const { starters, reserves } = req.body;
      const startersArr = Array.isArray(starters) ? starters : [];
      const reservesArr = Array.isArray(reserves) ? reserves : [];

      if (startersArr.length !== tournament.team_size) {
        client.release();
        return res.status(400).json({ error: "Asosiy o'yinchilar soni " + tournament.team_size + " ta bo'lishi kerak (hozir: " + startersArr.length + ")" });
      }
      if (reservesArr.length > tournament.reserve_size) {
        client.release();
        return res.status(400).json({ error: "Zaxira o'yinchilar " + tournament.reserve_size + " tadan oshmasligi kerak" });
      }

      const all = startersArr.concat(reservesArr);
      if (new Set(all).size !== all.length) {
        client.release();
        return res.status(400).json({ error: "Bir o'quvchi ikki marta tanlangan" });
      }

      const studentsResult = await client.query(
        `SELECT id FROM users
       WHERE id = ANY($1) AND region = $2 AND district = $3 AND school = $4
         AND (role = 'student' OR role IS NULL)`,
        [all, admin.region, admin.district, admin.school]
      );
      if (studentsResult.rows.length !== all.length) {
        client.release();
        return res.status(400).json({ error: "Ba'zi o'quvchilar bu maktabga tegishli emas" });
      }

      await client.query("BEGIN");
      await client.query("DELETE FROM tournament_team_members WHERE tournament_id = $1 AND school_key = $2", [tournamentId, admin.school_key]);

      let slot = 1;
      for (const userId of startersArr) {
        await client.query(
          "INSERT INTO tournament_team_members (tournament_id, school, school_key, user_id, member_role, slot_order) VALUES ($1, $2, $3, $4, 'starter', $5)",
          [tournamentId, admin.school, admin.school_key, userId, slot++]
        );
      }
      slot = 1;
      for (const userId of reservesArr) {
        await client.query(
          "INSERT INTO tournament_team_members (tournament_id, school, school_key, user_id, member_role, slot_order) VALUES ($1, $2, $3, $4, 'reserve', $5)",
          [tournamentId, admin.school, admin.school_key, userId, slot++]
        );
      }

      const averageResult = await client.query(`SELECT ROUND(AVG(rating)) AS avg FROM users WHERE id = ANY($1)`, [startersArr]);
      const averageRating = parseInt(averageResult.rows[0].avg) || 1000;
      await client.query(
        `INSERT INTO tournament_schools (tournament_id, school, region, district, school_key, avg_rating)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tournament_id, school_key)
       DO UPDATE SET school = EXCLUDED.school, region = EXCLUDED.region,
                     district = EXCLUDED.district, avg_rating = EXCLUDED.avg_rating`,
        [tournamentId, admin.school, admin.region, admin.district, admin.school_key, averageRating]
      );

      await client.query("COMMIT");
      client.release();
      return res.json({ success: true, starters: startersArr.length, reserves: reservesArr.length });
    } catch (error) {
      await client.query("ROLLBACK");
      client.release();
      logger.error("Jamoa saqlash xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi: " + error.message });
    }
  }

  return { save };
}

module.exports = { createSchoolTournamentTeamSaveController };
