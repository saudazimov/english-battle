function createTeacherConversationsController({ pool, onlineUsers, logger = console }) {
  async function list(req, res) {
    try {
      const result = await pool.query(
        `SELECT DISTINCT ON (u.id) u.id, u.first_name, u.last_name, u.profile_picture,
              u.cefr_level, c.name AS class_name,
              lm.message AS last_message, lm.created_at AS last_message_at,
              (SELECT COUNT(*)::int FROM teacher_messages tm
               WHERE tm.teacher_id=$1 AND tm.student_id=u.id
                 AND tm.sender_id=u.id AND tm.read_at IS NULL) AS unread_count
       FROM classes c
       JOIN class_students cs ON cs.class_id=c.id AND cs.status='active'
       JOIN users u ON u.id=cs.student_id
       LEFT JOIN LATERAL (
         SELECT message, created_at FROM teacher_messages tm
         WHERE tm.teacher_id=$1 AND tm.student_id=u.id
         ORDER BY tm.created_at DESC LIMIT 1
       ) lm ON TRUE
       WHERE c.teacher_id=$1 AND c.archived_at IS NULL
       ORDER BY u.id, lm.created_at DESC NULLS LAST`,
        [req.user.id]
      );
      return res.json({
        conversations: result.rows.map((row) => ({
          ...row,
          is_online: !!onlineUsers[String(row.id)],
        })),
      });
    } catch (error) {
      logger.error("Teacher conversations xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createTeacherConversationsController };
