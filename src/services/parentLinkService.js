const MAX_PARENTS_PER_STUDENT = 5;
const MAX_CHILDREN_PER_PARENT = 10;

function createParentLinkService({ pool, parentCode }) {
  async function linkParent(parentId, code, relationship) {
    const codeHash = parentCode.hashCode(code);
    const studentResult = await pool.query(
      `SELECT id, first_name, last_name, cefr_level, rating, role
       FROM users
       WHERE parent_connect_code_hash = $1
         AND parent_connect_code_expires_at IS NOT NULL
         AND parent_connect_code_expires_at > NOW()`,
      [codeHash]
    );
    if (studentResult.rows.length === 0 || studentResult.rows[0].role !== "student") {
      return { status: "invalid-code" };
    }
    const child = studentResult.rows[0];
    if (child.id === parentId) return { status: "self-link" };

    const parentCount = await pool.query(
      "SELECT COUNT(*)::int AS c FROM parent_links WHERE student_id=$1 AND status='active'",
      [child.id]
    );
    if (parentCount.rows[0].c >= MAX_PARENTS_PER_STUDENT) {
      return { status: "parent-limit" };
    }
    const childCount = await pool.query(
      "SELECT COUNT(*)::int AS c FROM parent_links WHERE parent_id=$1 AND status='active'",
      [parentId]
    );
    if (childCount.rows[0].c >= MAX_CHILDREN_PER_PARENT) {
      return { status: "child-limit" };
    }

    const existing = await pool.query(
      "SELECT id, status FROM parent_links WHERE parent_id=$1 AND student_id=$2",
      [parentId, child.id]
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (existing.rows.length === 0) {
        await client.query(
          "INSERT INTO parent_links (parent_id, student_id, relationship, status, linked_at) VALUES ($1,$2,$3,'active',NOW())",
          [parentId, child.id, relationship]
        );
      } else if (existing.rows[0].status === "revoked") {
        await client.query(
          "UPDATE parent_links SET status='active', relationship=$3, linked_at=NOW(), revoked_at=NULL, revoked_by=NULL, updated_at=NOW() WHERE id=$1 AND parent_id=$2",
          [existing.rows[0].id, parentId, relationship]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await pool.query(
      "UPDATE users SET parent_connect_code_hash = NULL, parent_connect_code_expires_at = NULL WHERE id = $1",
      [child.id]
    );
    return { status: "linked", child };
  }

  return { linkParent };
}

module.exports = { createParentLinkService };
