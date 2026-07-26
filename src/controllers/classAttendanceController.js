function createTeacherAttendanceListHandler({ pool, ownedActiveClass, logger }) {
  return async function listTeacherAttendance(req, res) {
    try {
      const classId = parseInt(req.params.classId, 10);
      if (!Number.isInteger(classId)) {
        return res.status(400).json({ error: "Noto'g'ri sinf ID" });
      }
      if (!(await ownedActiveClass(classId, req.user.id))) {
        return res.status(404).json({ error: "Sinf topilmadi" });
      }
      const sessions = await pool.query(
        `SELECT s.id, s.title, s.session_date, s.status, s.created_at,
                COUNT(r.id)::int AS marked_count,
                COUNT(r.id) FILTER (WHERE r.status='present')::int AS present_count
           FROM class_attendance_sessions s
           LEFT JOIN class_attendance_records r ON r.session_id=s.id
          WHERE s.class_id=$1 GROUP BY s.id ORDER BY s.session_date DESC, s.created_at DESC`,
        [classId]
      );
      const students = await pool.query(
        `SELECT u.id, u.first_name, u.last_name FROM class_students cs
         JOIN users u ON u.id=cs.student_id
         WHERE cs.class_id=$1 AND cs.status='active' ORDER BY u.first_name, u.last_name`,
        [classId]
      );
      let records = [];
      const requestedId = parseInt(req.query.sessionId, 10);
      const sessionId = Number.isInteger(requestedId)
        ? requestedId
        : sessions.rows[0] && Number(sessions.rows[0].id);
      if (sessionId) {
        const result = await pool.query(
          `SELECT r.student_id, r.status FROM class_attendance_records r
           JOIN class_attendance_sessions s ON s.id=r.session_id
           WHERE r.session_id=$1 AND s.class_id=$2`,
          [sessionId, classId]
        );
        records = result.rows;
      }
      res.json({
        sessions: sessions.rows,
        students: students.rows,
        selected_session_id: sessionId || null,
        records,
      });
    } catch (error) {
      logger.error("Davomatni yuklash xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createTeacherAttendanceCreateHandler({
  pool,
  sanitizeText,
  ownedActiveClass,
  logger,
}) {
  return async function createTeacherAttendance(req, res) {
    try {
      const classId = parseInt(req.params.classId, 10);
      const title = sanitizeText(req.body.title || "", 160) || "Dars davomati";
      const sessionDate = /^\d{4}-\d{2}-\d{2}$/.test(
        req.body.session_date || ""
      )
        ? req.body.session_date
        : null;
      if (!Number.isInteger(classId)) {
        return res.status(400).json({ error: "Noto'g'ri sinf ID" });
      }
      if (!(await ownedActiveClass(classId, req.user.id))) {
        return res.status(404).json({ error: "Sinf topilmadi" });
      }
      const inserted = await pool.query(
        `INSERT INTO class_attendance_sessions (class_id, teacher_id, title, session_date)
         VALUES ($1,$2,$3,COALESCE($4::date,CURRENT_DATE))
         RETURNING id, title, session_date, status, created_at`,
        [classId, req.user.id, title, sessionDate]
      );
      res.status(201).json({ session: inserted.rows[0] });
    } catch (error) {
      logger.error("Davomat yaratish xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createTeacherAttendanceUpdateHandler({
  pool,
  ownedActiveClass,
  io,
  logger,
}) {
  return async function updateTeacherAttendance(req, res) {
    const client = await pool.connect();
    try {
      const classId = parseInt(req.params.classId, 10);
      const sessionId = parseInt(req.params.sessionId, 10);
      const records = Array.isArray(req.body.records) ? req.body.records : [];
      if (!Number.isInteger(classId) || !Number.isInteger(sessionId)) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }
      if (!records.length || records.length > 500) {
        return res.status(400).json({ error: "Davomat belgilarini kiriting" });
      }
      if (!(await ownedActiveClass(classId, req.user.id))) {
        return res.status(404).json({ error: "Sinf topilmadi" });
      }
      const session = await client.query(
        "SELECT id, status FROM class_attendance_sessions WHERE id=$1 AND class_id=$2 AND teacher_id=$3",
        [sessionId, classId, req.user.id]
      );
      if (!session.rows.length) {
        return res.status(404).json({ error: "Davomat topilmadi" });
      }
      if (session.rows[0].status === "closed") {
        return res
          .status(409)
          .json({ error: "Yopilgan davomatni o'zgartirib bo'lmaydi" });
      }
      const allowed = new Set(
        (
          await client.query(
            "SELECT student_id FROM class_students WHERE class_id=$1 AND status='active'",
            [classId]
          )
        ).rows.map((row) => Number(row.student_id))
      );
      const validStatuses = new Set(["present", "absent", "late", "excused"]);
      for (const item of records) {
        if (
          !allowed.has(Number(item.student_id)) ||
          !validStatuses.has(item.status)
        ) {
          return res
            .status(400)
            .json({ error: "Davomat ma'lumotlari noto'g'ri" });
        }
      }
      await client.query("BEGIN");
      for (const item of records) {
        await client.query(
          `INSERT INTO class_attendance_records (session_id, student_id, status)
           VALUES ($1,$2,$3)
           ON CONFLICT (session_id, student_id)
           DO UPDATE SET status=EXCLUDED.status, marked_at=NOW()`,
          [sessionId, Number(item.student_id), item.status]
        );
      }
      if (req.body.close === true) {
        await client.query(
          "UPDATE class_attendance_sessions SET status='closed', updated_at=NOW() WHERE id=$1",
          [sessionId]
        );
      }
      await client.query("COMMIT");
      io.to("class_" + String(classId)).emit("classAttendanceUpdated", {
        classId,
      });
      res.json({ success: true });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error("Davomat saqlash xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    } finally {
      client.release();
    }
  };
}

function createStudentAttendanceListHandler({
  pool,
  activeClassMembership,
  logger,
}) {
  return async function listStudentAttendance(req, res) {
    try {
      const classId = parseInt(req.params.classId, 10);
      if (!Number.isInteger(classId)) {
        return res.status(400).json({ error: "Noto'g'ri sinf ID" });
      }
      if (!(await activeClassMembership(classId, req.user.id))) {
        return res.status(404).json({ error: "Sinf topilmadi" });
      }
      const rows = await pool.query(
        `SELECT s.id, s.title, s.session_date, s.status AS session_status, r.status
           FROM class_attendance_sessions s
           LEFT JOIN class_attendance_records r ON r.session_id=s.id AND r.student_id=$2
          WHERE s.class_id=$1 ORDER BY s.session_date DESC, s.created_at DESC`,
        [classId, req.user.id]
      );
      const marked = rows.rows.filter((row) => row.status);
      const attended = marked.filter(
        (row) => row.status === "present" || row.status === "late"
      ).length;
      res.json({
        records: rows.rows,
        summary: {
          total: marked.length,
          attended,
          percent: marked.length
            ? Math.round((attended * 100) / marked.length)
            : null,
        },
      });
    } catch (error) {
      logger.error("O'quvchi davomati xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createClassAttendanceController(dependencies) {
  const shared = { ...dependencies, logger: dependencies.logger || console };
  return {
    listTeacherAttendance: createTeacherAttendanceListHandler(shared),
    createTeacherAttendance: createTeacherAttendanceCreateHandler(shared),
    updateTeacherAttendance: createTeacherAttendanceUpdateHandler(shared),
    listStudentAttendance: createStudentAttendanceListHandler(shared),
  };
}

module.exports = { createClassAttendanceController };
