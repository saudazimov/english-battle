function getBracketSize(schoolCount) {
  let size = 2;
  while (size < schoolCount) size *= 2;
  return size;
}

async function seedSchools(client, tournamentId, schools) {
  for (let index = 0; index < schools.length; index++) {
    await client.query(
      "UPDATE tournament_schools SET seed = $1, eliminated = false, placement = NULL WHERE tournament_id = $2 AND school_key = $3",
      [index + 1, tournamentId, schools[index].school_key]
    );
  }
}

async function clearExistingMatches(client, tournamentId) {
  await client.query(
    `DELETE FROM tournament_match_players WHERE match_id IN (SELECT id FROM tournament_matches WHERE tournament_id = $1)`,
    [tournamentId]
  );
  await client.query(
    "DELETE FROM tournament_matches WHERE tournament_id = $1",
    [tournamentId]
  );
}

async function createFirstRound({ client, tournamentId, slots, startsAt, gapMinutes }) {
  const matchCount = slots.length / 2;
  let matchTime = new Date(startsAt);
  const roundOneWinners = [];

  for (let matchIndex = 0; matchIndex < matchCount; matchIndex++) {
    const schoolA = slots[matchIndex * 2];
    const schoolB = slots[matchIndex * 2 + 1];
    let status = "pending";
    let winner = null;

    if (schoolA && !schoolB) {
      status = "done";
      winner = schoolA;
    } else if (!schoolA && schoolB) {
      status = "done";
      winner = schoolB;
    } else if (!schoolA && !schoolB) {
      status = "done";
      winner = null;
    }

    const scheduledAt = status === "pending" ? new Date(matchTime) : null;
    const insertedMatch = await client.query(
      `INSERT INTO tournament_matches
        (tournament_id, round, match_no, school_a, school_b, school_a_key, school_b_key,
         winner_school, winner_school_key, status, scheduled_at, finished_at)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        tournamentId,
        matchIndex + 1,
        schoolA && schoolA.school,
        schoolB && schoolB.school,
        schoolA && schoolA.school_key,
        schoolB && schoolB.school_key,
        winner && winner.school,
        winner && winner.school_key,
        status,
        scheduledAt,
        status === "done" ? new Date() : null,
      ]
    );

    if (status === "pending") {
      matchTime = new Date(matchTime.getTime() + gapMinutes * 60000);
    }
    roundOneWinners.push({ matchNo: matchIndex + 1, winner });
    void insertedMatch;
  }

  return { matchCount, matchTime, roundOneWinners };
}

async function createLaterRounds({
  client,
  tournamentId,
  firstRoundMatchCount,
  firstMatchTime,
  gapMinutes,
}) {
  let previousCount = firstRoundMatchCount;
  let round = 2;
  let matchTime = firstMatchTime;

  while (previousCount > 1) {
    const count = previousCount / 2;
    for (let matchIndex = 0; matchIndex < count; matchIndex++) {
      await client.query(
        `INSERT INTO tournament_matches
          (tournament_id, round, match_no, status, scheduled_at)
         VALUES ($1, $2, $3, 'pending', $4)`,
        [tournamentId, round, matchIndex + 1, new Date(matchTime)]
      );
      matchTime = new Date(matchTime.getTime() + gapMinutes * 60000);
    }
    previousCount = count;
    round++;
  }
}

function createAdminTournamentBracketGenerationService({ seedOrder, propagateByes }) {
  async function generateBracket(client, tournamentId) {
    const tournamentResult = await client.query(
      "SELECT * FROM tournaments WHERE id = $1",
      [tournamentId]
    );
    if (tournamentResult.rows.length === 0) return { status: "not-found" };

    const tournament = tournamentResult.rows[0];
    if (tournament.status !== "registration") {
      return { status: "invalid-status", tournamentStatus: tournament.status };
    }

    const schoolResult = await client.query(
      `SELECT school, region, district, school_key, avg_rating
       FROM tournament_schools
       WHERE tournament_id = $1
       ORDER BY avg_rating DESC, school ASC`,
      [tournamentId]
    );
    const schools = schoolResult.rows;
    const schoolCount = schools.length;
    if (schoolCount < 2) return { status: "insufficient-schools", schoolCount };

    const bracketSize = getBracketSize(schoolCount);
    await client.query("BEGIN");
    await seedSchools(client, tournamentId, schools);
    await clearExistingMatches(client, tournamentId);

    const positions = seedOrder(bracketSize);
    const slots = positions.map((seedNumber) => (
      seedNumber <= schoolCount ? schools[seedNumber - 1] : null
    ));
    const startsAt = tournament.starts_at
      ? new Date(tournament.starts_at)
      : new Date(Date.now() + 24 * 3600 * 1000);
    const gapMinutes = 30;
    const firstRound = await createFirstRound({
      client,
      tournamentId,
      slots,
      startsAt,
      gapMinutes,
    });

    await createLaterRounds({
      client,
      tournamentId,
      firstRoundMatchCount: firstRound.matchCount,
      firstMatchTime: firstRound.matchTime,
      gapMinutes,
    });
    await propagateByes(client, tournamentId);
    await client.query(
      "UPDATE tournaments SET status = 'bracket', bracket_size = $1 WHERE id = $2",
      [bracketSize, tournamentId]
    );
    await client.query("COMMIT");

    return {
      status: "generated",
      result: {
        success: true,
        bracket_size: bracketSize,
        schools: schoolCount,
        byes: bracketSize - schoolCount,
        rounds: Math.log2(bracketSize),
      },
    };
  }

  return { generateBracket };
}

module.exports = { createAdminTournamentBracketGenerationService };
