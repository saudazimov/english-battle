const pool = require("../../db");

function createOwnedActiveClassService({ pool: database }) {
  async function ownedActiveClass(classId, teacherId) {
    const result = await database.query(
      "SELECT id, name FROM classes WHERE id=$1 AND teacher_id=$2 AND archived_at IS NULL",
      [classId, teacherId]
    );
    return result.rows[0] || null;
  }

  return { ownedActiveClass };
}

const { ownedActiveClass } = createOwnedActiveClassService({ pool });

module.exports = { createOwnedActiveClassService, ownedActiveClass };
