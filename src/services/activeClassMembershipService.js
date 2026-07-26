const pool = require("../../db");

function createActiveClassMembershipService({ pool: database }) {
  async function activeClassMembership(classId, studentId) {
    const result = await database.query(
      `SELECT c.id, c.name, c.teacher_id
       FROM class_students cs
       JOIN classes c ON c.id=cs.class_id
      WHERE cs.class_id=$1 AND cs.student_id=$2 AND cs.status='active'
        AND c.archived_at IS NULL`,
      [classId, studentId]
    );
    return result.rows[0] || null;
  }

  return { activeClassMembership };
}

const { activeClassMembership } = createActiveClassMembershipService({ pool });

module.exports = { createActiveClassMembershipService, activeClassMembership };
