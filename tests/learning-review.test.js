const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_REVIEW_CONFIG,
  assessmentQuality,
  determineAssessmentOutcome,
  reviewAdjustment,
  calculateAssessmentProfile,
  createLearningReviewService,
} = require("../src/services/learningReviewService");
const { DEFAULT_CONFIG } = require("../src/services/learningAnalyticsService");
const { createNotificationService } = require("../src/services/notificationService");
const createStudentWeeklyAiReportRoutes = require("../src/routes/studentWeeklyAiReportRoutes");
const { authMiddleware, requireStudent } = require("../auth");

function exercises(count = 10, formats = 2) {
  return Array.from({ length: count }, (_, index) => ({
    source_question_id: index + 1,
    question_format: index % formats ? "multiple_choice" : "gap_fill",
  }));
}

test("assessment quality requires ten new questions and at least two formats", () => {
  assert.deepEqual(assessmentQuality(exercises()), {
    approved: true, warnings: [], formatCount: 2,
  });
  assert.deepEqual(assessmentQuality(exercises(9)), {
    approved: false, warnings: ["INSUFFICIENT_NEW_QUESTIONS"], formatCount: 2,
  });
  assert.deepEqual(assessmentQuality(exercises(10, 1)), {
    approved: false, warnings: ["INSUFFICIENT_FORMAT_DIVERSITY"], formatCount: 1,
  });
});

test("mastery requires two successful retests before spaced review", () => {
  const first = determineAssessmentOutcome({
    assessmentType: "RETEST", passed: true, sequenceNo: 1,
    successfulRetests: 1, failedReviews: 0, priorPlanStatus: "RETEST_PENDING",
  });
  assert.deepEqual(first, {
    planStatus: "RETEST_PENDING", evidenceState: "IMPROVING", next: "RETEST",
  });
  const second = determineAssessmentOutcome({
    assessmentType: "RETEST", passed: true, sequenceNo: 2,
    successfulRetests: 2, failedReviews: 0, priorPlanStatus: "RETEST_PENDING",
  });
  assert.deepEqual(second, {
    planStatus: "REVIEW_PENDING", evidenceState: "STABLE", next: "REVIEWS",
  });
});

test("long-term review can master while failed stable review regresses", () => {
  const final = determineAssessmentOutcome({
    assessmentType: "REVIEW", passed: true,
    sequenceNo: DEFAULT_REVIEW_CONFIG.review_days.length,
    successfulRetests: 2, failedReviews: 0, priorPlanStatus: "REVIEW_PENDING",
    masteryScore: 88,confidenceScore: 82,retentionScore: 91,
  });
  assert.deepEqual(final, {
    planStatus: "MASTERED", evidenceState: "MASTERED", next: "DONE",
  });
  const regressed = determineAssessmentOutcome({
    assessmentType: "REVIEW", passed: false, sequenceNo: 3,
    successfulRetests: 2, failedReviews: 1, priorPlanStatus: "STABLE",
  });
  assert.deepEqual(regressed, {
    planStatus: "REGRESSED", evidenceState: "REGRESSED", next: "LESSON_REVIEW",
  });
  const extended = determineAssessmentOutcome({
    assessmentType: "REVIEW",passed: true,
    sequenceNo: DEFAULT_REVIEW_CONFIG.review_days.length,
    successfulRetests: 2,failedReviews: 0,priorPlanStatus: "REVIEW_PENDING",
    masteryScore: 79,confidenceScore: 90,retentionScore: 100,
  });
  assert.deepEqual(extended, {
    planStatus: "STABLE",evidenceState: "STABLE",next: "EXTENDED_REVIEW",
  });
});

test("review interval adaptation distinguishes strong, slow and wrong answers", () => {
  assert.equal(reviewAdjustment({ passed: false,accuracy: 40 }),"SHORTEN");
  assert.equal(reviewAdjustment({ passed: true,accuracy: 90,averageResponseTimeMs: 12000,
    expectedResponseTimeMs: 20000 }),"EXPAND");
  assert.equal(reviewAdjustment({ passed: true,accuracy: 80,averageResponseTimeMs: 25000,
    expectedResponseTimeMs: 20000 }),"MAINTAIN");
});

test("assessment profile separates mastery, confidence, accuracy and retention", () => {
  const profile = {
    exposure_count: 20,weighted_accuracy: 60,distinct_question_count: 12,
    session_count: 4,format_count: 2,analysis_quality: 0.9,retention_score: 50,
    expected_response_time_ms: 20000,hint_usage_rate: 0,repeated_misconception_count: 1,
    current_evidence_state: "STABLE",
  };
  const result = calculateAssessmentProfile(profile,{
    type: "REVIEW",total: 10,correct: 9,accuracy: 90,passed: true,
    formatCount: 2,averageResponseTimeMs: 15000,
  },DEFAULT_REVIEW_CONFIG,DEFAULT_CONFIG,new Date("2026-08-07T00:00:00Z"));
  assert.equal(result.retentionScore, 66);
  assert.notEqual(result.masteryScore, 90);
  assert.ok(result.confidenceScore > 0 && result.confidenceScore <= 100);
  assert.equal(result.regressionFlag, false);
});

test("notification service reports persistence success and failure", async () => {
  const success = createNotificationService({
    pool: { async query() {} }, logger: { error() {} }, reportStatus: true,
  });
  assert.equal(await success(1,"learning_review_due","Review tayyor"), true);
  const failure = createNotificationService({
    pool: { async query() { throw new Error("db"); } }, logger: { error() {} }, reportStatus: true,
  });
  assert.equal(await failure(1,"learning_review_due","Review tayyor"), false);
});

test("due review notification is claimed and persisted in one transaction", async () => {
  const queries = [];
  const client = {
    async query(sql,values) {
      queries.push({ sql,values });
      if (sql.includes("SELECT r.id")) {
        return { rows: [{
          id: 7,student_id: 11,assessment_type: "REVIEW",skill_name: "Present simple",
        }] };
      }
      return { rows: [] };
    },
    release() { queries.push({ sql: "RELEASE" }); },
  };
  const pool = { async connect() { return client; } };
  const createNotification = createNotificationService({
    pool,logger: { error() {} },reportStatus: true,
  });
  const service = createLearningReviewService({ pool,createNotification });

  assert.equal(await service.notifyDueAssessments(1),1);
  assert.ok(queries.some(({ sql }) => sql.includes("FOR UPDATE OF r SKIP LOCKED")));
  assert.ok(queries.some(({ sql }) => sql.includes("INSERT INTO notifications")));
  assert.ok(queries.some(({ sql }) => sql.includes("UPDATE targeted_retests")));
  assert.deepEqual(queries.slice(-2).map(({ sql }) => sql),["COMMIT","RELEASE"]);
});

test("student progress overview is scoped to the authenticated student data", async () => {
  const calls = [];
  const pool = {
    async query(sql,values) {
      calls.push({ sql,values });
      if (sql.includes("AS reliable_attempts")) return { rows: [{ reliable_attempts: 12,current_mastery: 64 }] };
      if (sql.includes("current_priority DESC")) return { rows: [{ taxonomy_id: 3,skill_name: "Verb endings" }] };
      return { rows: [{ id: 5,event_type: "LESSON_COMPLETED" }] };
    },
  };
  const service = createLearningReviewService({ pool });

  const result = await service.getProgressOverview(19);
  assert.equal(result.overview.reliable_attempts,12);
  assert.equal(result.exact_weaknesses[0].taxonomy_id,3);
  assert.equal(result.timeline[0].event_type,"LESSON_COMPLETED");
  assert.equal(calls.length,3);
  assert.ok(calls.every(({ values }) => values.length === 1 && values[0] === 19));
  assert.ok(calls.every(({ sql }) => sql.includes("$1")));
});

test("assessment endpoints preserve auth and student middleware order", () => {
  const router = createStudentWeeklyAiReportRoutes({ pool: {},aiSnapshot: {},aiService: {} });
  const paths = [
    "/learning/remediation/assessments/sync",
    "/learning/remediation/assessments/due",
    "/learning/progress/overview",
    "/learning/remediation/assessments/:assessmentId",
    "/learning/remediation/assessments/:assessmentId/start",
    "/learning/remediation/assessments/:assessmentId/questions/:questionId/answer",
    "/learning/remediation/assessments/:assessmentId/complete",
  ];
  for (const path of paths) {
    const layer = router.stack.find((item) => item.route && item.route.path === path);
    assert.ok(layer, `missing route ${path}`);
    assert.equal(layer.route.stack[0].handle,authMiddleware);
    assert.equal(layer.route.stack[1].handle,requireStudent);
  }
});
