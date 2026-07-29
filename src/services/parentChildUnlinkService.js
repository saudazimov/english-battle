function createParentChildUnlinkService({ pool }) {
  async function unlinkChild(parentId, studentId) {
    const result = await pool.query(
      "UPDATE parent_links SET status='revoked', revoked_at=NOW(), revoked_by=$1, updated_at=NOW() WHERE parent_id=$1 AND student_id=$2 AND status='active' RETURNING id",
      [parentId, studentId]
    );

    return result.rows.length > 0;
  }

  return { unlinkChild };
}

module.exports = { createParentChildUnlinkService };
