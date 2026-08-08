const express = require("express");
const { authMiddleware, requireStudent } = require("../../auth");
const {
  createStudentWeeklyAiReportController,
} = require("../controllers/studentWeeklyAiReportController");
const {
  createStudentRemediationController,
} = require("../controllers/studentRemediationController");
const {
  createPersonalizedLessonService,
} = require("../services/personalizedLessonService");
const {
  createLearningReviewService,
} = require("../services/learningReviewService");

function createStudentWeeklyAiReportRoutes({
  pool,
  aiSnapshot,
  aiService,
}) {
  const router = express.Router();
  const controller = createStudentWeeklyAiReportController({
    pool,
    aiSnapshot,
    aiService,
  });
  const reviewService = createLearningReviewService({ pool });
  const remediation = createStudentRemediationController({
    lessonService: createPersonalizedLessonService({ pool, aiService }),
    reviewService,
  });
  router.post(
    "/ai/reports/student/weekly",
    authMiddleware,
    requireStudent,
    controller.generate
  );
  router.post("/learning/remediation/lessons/sync", authMiddleware, requireStudent, remediation.sync);
  router.get("/learning/remediation/lessons", authMiddleware, requireStudent, remediation.list);
  router.get("/learning/remediation/lessons/:lessonId", authMiddleware, requireStudent, remediation.detail);
  router.post("/learning/remediation/lessons/:lessonId/start", authMiddleware, requireStudent, remediation.start);
  router.post(
    "/learning/remediation/lessons/:lessonId/exercises/:exerciseId/answer",
    authMiddleware,
    requireStudent,
    remediation.answer
  );
  router.post("/learning/remediation/lessons/:lessonId/complete", authMiddleware, requireStudent, remediation.complete);
  router.post("/learning/remediation/assessments/sync", authMiddleware, requireStudent, remediation.syncAssessments);
  router.get("/learning/remediation/assessments/due", authMiddleware, requireStudent, remediation.dueAssessments);
  router.get("/learning/progress/overview", authMiddleware, requireStudent, remediation.progressOverview);
  router.get("/learning/remediation/assessments/:assessmentId", authMiddleware, requireStudent, remediation.assessmentDetail);
  router.post("/learning/remediation/assessments/:assessmentId/start", authMiddleware, requireStudent, remediation.startAssessment);
  router.post(
    "/learning/remediation/assessments/:assessmentId/questions/:questionId/answer",
    authMiddleware,
    requireStudent,
    remediation.answerAssessment
  );
  router.post("/learning/remediation/assessments/:assessmentId/complete", authMiddleware, requireStudent, remediation.completeAssessment);
  return router;
}

module.exports = createStudentWeeklyAiReportRoutes;
