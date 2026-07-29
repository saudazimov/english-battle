function createParentChildrenListService({ pool, parentLeagueName, activityLabel }) {
  async function listChildren(parentId) {
    const result = await pool.query(
      `SELECT pl.student_id, pl.relationship, pl.linked_at,
              u.first_name, u.last_name, u.cefr_level, u.rating, u.xp, u.is_banned,
              (SELECT MAX(played_at) FROM battle_history bh WHERE bh.user_id = u.id) AS last_played
       FROM parent_links pl
       JOIN users u ON u.id = pl.student_id
       WHERE pl.parent_id = $1 AND pl.status = 'active'
       ORDER BY pl.linked_at DESC`,
      [parentId]
    );

    return result.rows.map((row) => ({
      student_id: row.student_id,
      name: ((row.first_name || "") + " " + (row.last_name || "")).trim() || "Farzand",
      cefr_level: row.cefr_level || "A1",
      league: parentLeagueName(row.rating),
      rating: row.rating || 0,
      xp: row.xp || 0,
      relationship: row.relationship || "guardian",
      is_banned: !!row.is_banned,
      last_activity_label: activityLabel(row.last_played),
      linked_at: row.linked_at,
    }));
  }

  return { listChildren };
}

module.exports = { createParentChildrenListService };
