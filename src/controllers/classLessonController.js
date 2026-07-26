function createTeacherLessonListHandler({ pool, ownedActiveClass, logger }) {
  return async function listTeacherLessons(req, res) {
    try {
      const classId = parseInt(req.params.classId, 10);
      if (!Number.isInteger(classId)) {
        return res.status(400).json({ error: "Noto'g'ri sinf ID" });
      }
      if (!(await ownedActiveClass(classId, req.user.id))) {
        return res.status(404).json({ error: "Sinf topilmadi" });
      }
      const rows = await pool.query(
        `SELECT id, title, description, meeting_url, status, starts_at, ended_at, created_at
           FROM class_lessons WHERE class_id=$1 ORDER BY created_at DESC LIMIT 20`,
        [classId]
      );
      res.json({ lessons: rows.rows });
    } catch (error) {
      logger.error("Darslarni yuklash xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createTeacherLessonStartHandler({
  pool,
  sanitizeText,
  validMeetingUrl,
  ownedActiveClass,
  io,
  logger,
}) {
  return async function startTeacherLesson(req, res) {
    try {
      const classId = parseInt(req.params.classId, 10);
      const title = sanitizeText(req.body.title || "", 160);
      const description = sanitizeText(req.body.description || "", 1000);
      const meetingUrl = String(req.body.meeting_url || "").trim();
      if (!Number.isInteger(classId)) {
        return res.status(400).json({ error: "Noto'g'ri sinf ID" });
      }
      if (!title || !validMeetingUrl(meetingUrl)) {
        return res
          .status(400)
          .json({ error: "Dars nomi va to'g'ri havolani kiriting" });
      }
      if (!(await ownedActiveClass(classId, req.user.id))) {
        return res.status(404).json({ error: "Sinf topilmadi" });
      }
      await pool.query(
        "UPDATE class_lessons SET status='finished', ended_at=NOW(), updated_at=NOW() WHERE class_id=$1 AND status='live'",
        [classId]
      );
      const inserted = await pool.query(
        `INSERT INTO class_lessons (class_id, teacher_id, title, description, meeting_url, status, starts_at)
         VALUES ($1,$2,$3,$4,$5,'live',NOW())
         RETURNING id, title, description, meeting_url, status, starts_at, created_at`,
        [classId, req.user.id, title, description || null, meetingUrl]
      );
      io.to("class_" + String(classId)).emit("classLessonStarted", { classId });
      res.status(201).json({ lesson: inserted.rows[0] });
    } catch (error) {
      logger.error("Dars boshlash xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createTeacherLessonFinishHandler({
  pool,
  ownedActiveClass,
  io,
  logger,
}) {
  return async function finishTeacherLesson(req, res) {
    try {
      const classId = parseInt(req.params.classId, 10);
      const lessonId = parseInt(req.params.lessonId, 10);
      if (!Number.isInteger(classId) || !Number.isInteger(lessonId)) {
        return res.status(400).json({ error: "Noto'g'ri ID" });
      }
      if (!(await ownedActiveClass(classId, req.user.id))) {
        return res.status(404).json({ error: "Sinf topilmadi" });
      }
      const updated = await pool.query(
        `UPDATE class_lessons SET status='finished', ended_at=NOW(), updated_at=NOW()
          WHERE id=$1 AND class_id=$2 AND teacher_id=$3 AND status='live' RETURNING id`,
        [lessonId, classId, req.user.id]
      );
      if (!updated.rows.length) {
        return res.status(404).json({ error: "Faol dars topilmadi" });
      }
      io.to("class_" + String(classId)).emit("classLessonFinished", { classId });
      res.json({ success: true });
    } catch (error) {
      logger.error("Darsni tugatish xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createStudentLiveLessonHandler({
  pool,
  activeClassMembership,
  logger,
}) {
  return async function getStudentLiveLesson(req, res) {
    try {
      const classId = parseInt(req.params.classId, 10);
      if (!Number.isInteger(classId)) {
        return res.status(400).json({ error: "Noto'g'ri sinf ID" });
      }
      if (!(await activeClassMembership(classId, req.user.id))) {
        return res.status(404).json({ error: "Sinf topilmadi" });
      }
      const rows = await pool.query(
        `SELECT id, title, description, meeting_url, status, starts_at
           FROM class_lessons WHERE class_id=$1 AND status='live'
          ORDER BY starts_at DESC LIMIT 1`,
        [classId]
      );
      res.json({ lesson: rows.rows[0] || null });
    } catch (error) {
      logger.error("Faol dars xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createClassLessonController(dependencies) {
  const logger = dependencies.logger || console;
  const shared = { ...dependencies, logger };
  return {
    listTeacherLessons: createTeacherLessonListHandler(shared),
    startTeacherLesson: createTeacherLessonStartHandler(shared),
    finishTeacherLesson: createTeacherLessonFinishHandler(shared),
    getStudentLiveLesson: createStudentLiveLessonHandler(shared),
  };
}

module.exports = { createClassLessonController };
