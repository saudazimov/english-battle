const express = require("express");
const {
  authMiddleware,
  requireStudent,
  requireTeacher,
} = require("../../auth");
const {
  createClassLessonController,
} = require("../controllers/classLessonController");

function createClassLessonRoutes(dependencies) {
  const router = express.Router();
  const controller = createClassLessonController(dependencies);

  router.get(
    "/teacher/classes/:classId/lessons",
    authMiddleware,
    requireTeacher,
    controller.listTeacherLessons
  );
  router.post(
    "/teacher/classes/:classId/lessons",
    authMiddleware,
    requireTeacher,
    controller.startTeacherLesson
  );
  router.post(
    "/teacher/classes/:classId/lessons/:lessonId/finish",
    authMiddleware,
    requireTeacher,
    controller.finishTeacherLesson
  );
  router.get(
    "/student/classes/:classId/live-lesson",
    authMiddleware,
    requireStudent,
    controller.getStudentLiveLesson
  );

  return router;
}

module.exports = createClassLessonRoutes;
