function createAdminTournamentEditService({ pool }) {
  async function editTournament(id, body) {
    const currentResult = await pool.query(
      "SELECT * FROM tournaments WHERE id = $1",
      [id]
    );
    if (currentResult.rows.length === 0) return { status: "not-found" };
    const tournament = currentResult.rows[0];

    const {
      name,
      team_size,
      reserve_size,
      questions_per_match,
      seconds_per_match,
      registration_deadline,
      starts_at,
      region,
      district,
    } = body;
    const bracketLocked = tournament.status !== "registration"
      && tournament.status !== "draft";
    const fields = [];
    const values = [];
    let parameterIndex = 0;

    function setField(column, value) {
      parameterIndex++;
      fields.push(column + " = $" + parameterIndex);
      values.push(value);
    }

    if (name !== undefined && name.trim()) setField("name", name.trim());
    if (registration_deadline !== undefined) {
      setField("registration_deadline", registration_deadline || null);
    }
    if (starts_at !== undefined) setField("starts_at", starts_at || null);

    if (!bracketLocked) {
      const teamSize = parseInt(team_size);
      const reserveSize = parseInt(reserve_size);
      const questionCount = parseInt(questions_per_match);
      const seconds = parseInt(seconds_per_match);
      if (team_size !== undefined && teamSize >= 1 && teamSize <= 10) {
        setField("team_size", teamSize);
      }
      if (reserve_size !== undefined && reserveSize >= 0 && reserveSize <= 5) {
        setField("reserve_size", reserveSize);
      }
      if (questions_per_match !== undefined && questionCount >= 5 && questionCount <= 50) {
        setField("questions_per_match", questionCount);
      }
      if (seconds_per_match !== undefined && seconds >= 60 && seconds <= 1200) {
        setField("seconds_per_match", seconds);
      }
      if (region !== undefined && region) setField("region", region);
      if (district !== undefined && district) setField("scope_value", district);
    } else {
      const blocked = [];
      if (team_size !== undefined && parseInt(team_size) !== tournament.team_size) {
        blocked.push("jamoa hajmi");
      }
      if (region !== undefined && region !== tournament.region) blocked.push("viloyat");
      if (district !== undefined && district !== tournament.scope_value) blocked.push("tuman");
      if (blocked.length > 0) return { status: "blocked", blocked };
    }

    if (fields.length === 0) return { status: "empty" };

    parameterIndex++;
    values.push(id);
    const updatedResult = await pool.query(
      `UPDATE tournaments SET ${fields.join(", ")} WHERE id = $${parameterIndex} RETURNING *`,
      values
    );
    return { status: "updated", tournament: updatedResult.rows[0] };
  }

  return { editTournament };
}

module.exports = { createAdminTournamentEditService };
