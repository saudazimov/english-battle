function createTeacherAssignmentArchiveService({ pool }) {
  async function archiveAssignment(id, teacherId) {
    const result = await pool.query(
      "UPDATE assignments SET status='archived', archived_at=NOW(), updated_at=NOW() WHERE id=$1 AND teacher_id=$2 RETURNING id",
      [id, teacherId]
    );

    return result.rows.length > 0;
  }

  return { archiveAssignment };
}

module.exports = { createTeacherAssignmentArchiveService };
