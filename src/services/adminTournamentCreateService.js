function createAdminTournamentCreateService({ pool }) {
  async function createTournament({
    name,
    region,
    district,
    teamSize,
    reserveSize,
    questionsPerMatch,
    secondsPerMatch,
    registrationDeadline,
    startsAt,
  }) {
    const schoolsResult = await pool.query(
      `SELECT COUNT(DISTINCT school) AS c FROM users
       WHERE region = $1 AND district = $2
         AND school IS NOT NULL AND school <> ''
         AND (role = 'student' OR role IS NULL)`,
      [region, district]
    );
    const schoolCount = parseInt(schoolsResult.rows[0].c);
    if (schoolCount < 2) return { schoolCount, tournament: null };

    const insertResult = await pool.query(
      `INSERT INTO tournaments
        (name, level, scope_value, region, status, team_size, reserve_size,
         questions_per_match, seconds_per_match, registration_deadline, starts_at, created_by)
       VALUES ($1, 'district', $2, $3, 'registration', $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        name,
        district,
        region,
        teamSize,
        reserveSize,
        questionsPerMatch,
        secondsPerMatch,
        registrationDeadline || null,
        startsAt || null,
        null,
      ]
    );

    return { schoolCount, tournament: insertResult.rows[0] };
  }

  return { createTournament };
}

module.exports = { createAdminTournamentCreateService };
