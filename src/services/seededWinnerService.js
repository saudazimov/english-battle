// Match tugadimi (hamma o'yinchi finished) → natijani hisoblash
async function getSeededWinner(client, tournamentId, schoolA, schoolAKey, schoolB, schoolBKey) {
  const seeded = await client.query(
    `SELECT school, school_key
     FROM tournament_schools
     WHERE tournament_id = $1 AND school_key = ANY($2::text[])
     ORDER BY seed ASC NULLS LAST, avg_rating DESC, school_key ASC
     LIMIT 1`,
    [tournamentId, [schoolAKey, schoolBKey].filter(Boolean)]
  );
  return seeded.rows[0] || { school: schoolA || schoolB, school_key: schoolAKey || schoolBKey };
}

module.exports = { getSeededWinner };
