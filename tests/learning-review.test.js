const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_REVIEW_CONFIG,
  assessmentQuality,
  determineAssessmentOutcome,
  reviewAdjustment,
  pendingRetestRecovery,
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

function recoveryQuestions() {
  return Array.from({ length: 10 },(_,index) => ({
    id: index + 1,
    question_text: `Recovery question ${index + 1}: She ___ English item ${index + 1}.`,
    option_a: "study",option_b: "studies",option_c: "studying",option_d: "studied",
    correct_option: "B",explanation: "Third-person singular takes -s.",
    diagnostic_eligible: true,cefr_level: "A1",
    question_type: index % 2 ? "multiple_choice" : "gap_fill",
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

test("pending retest recovery recreates only the missing next independent attempt", () => {
  const now = new Date("2026-08-10T10:00:00.000Z");
  assert.deepEqual(pendingRetestRecovery({
    max_sequence: 0,active_retests: 0,successful_retests: 0,last_success_at: null,
  },DEFAULT_REVIEW_CONFIG,now),{ sequenceNo: 1,scheduledFor: now });

  const recovered = pendingRetestRecovery({
    max_sequence: 1,active_retests: 0,successful_retests: 1,
    last_success_at: "2026-08-09T08:30:00.000Z",
  },DEFAULT_REVIEW_CONFIG,now);
  assert.equal(recovered.sequenceNo,2);
  assert.equal(recovered.scheduledFor.toISOString(),"2026-08-10T08:30:00.000Z");

  assert.equal(pendingRetestRecovery({
    max_sequence: 2,active_retests: 1,successful_retests: 1,
  },DEFAULT_REVIEW_CONFIG,now),null);
  assert.equal(pendingRetestRecovery({
    max_sequence: 2,active_retests: 0,successful_retests: 2,
  },DEFAULT_REVIEW_CONFIG,now),null);
});

test("sync recovers a second retest after post-commit scheduling interruption exactly once", async () => {
  const fixedNow = new Date("2026-08-10T10:00:00.000Z");
  const state = { activeRetests: 0,insertions: 0 };
  const transactionCalls = [];
  const questions = recoveryQuestions();
  const client = {
    async query(sql,values) {
      transactionCalls.push({ sql,values });
      if (sql.includes("INSERT INTO targeted_retests")) {
        state.insertions += 1;
        state.activeRetests = 1;
        return { rows: [{ id: 501,remediation_plan_id: 91,student_id: 19,taxonomy_id: 7 }] };
      }
      return { rows: [] };
    },
    release() { transactionCalls.push({ sql: "RELEASE" }); },
  };
  const pool = {
    async query(sql) {
      if (sql.includes("setting_key=ANY")) return { rows: [] };
      if (sql.includes("status='RETEST_PENDING'")) return { rows: [{ id: 91,status: "RETEST_PENDING" }] };
      if (sql.includes("AS max_sequence")) return { rows: [{
        max_sequence: state.activeRetests ? 2 : 1,
        active_retests: state.activeRetests,
        successful_retests: 1,
        last_success_at: "2026-08-09T10:00:00.000Z",
      }] };
      if (sql.includes("SELECT rp.*")) return { rows: [{
        id: 91,student_id: 19,taxonomy_id: 7,cefr_level: "A1",
      }] };
      if (sql.includes("SELECT * FROM targeted_retests")) return { rows: [] };
      if (sql.includes("SELECT DISTINCT LOWER")) return { rows: [] };
      if (sql.includes("WITH RECURSIVE lineage")) return { rows: questions };
      if (sql.includes("FROM review_schedules")) return { rows: [] };
      return { rows: [] };
    },
    async connect() { return client; },
  };
  const service = createLearningReviewService({ pool,now: () => fixedNow });

  await service.syncStudentAssessments(19);
  await service.syncStudentAssessments(19);

  assert.equal(state.insertions,1);
  const insert = transactionCalls.find(({ sql }) => sql.includes("INSERT INTO targeted_retests"));
  assert.equal(insert.values[4],2);
  assert.equal(insert.values[9].toISOString(),"2026-08-10T10:00:00.000Z");
  assert.equal(transactionCalls.filter(({ sql }) => sql === "BEGIN").length,1);
  assert.equal(transactionCalls.filter(({ sql }) => sql === "COMMIT").length,1);
  assert.equal(transactionCalls.filter(({ sql }) => sql === "ROLLBACK").length,0);
  assert.equal(transactionCalls.filter(({ sql }) => sql.includes("INSERT INTO targeted_retest_questions")).length,10);
});

test("background worker recovers a missing retest once without waiting for the student", async () => {
  const fixedNow = new Date("2026-08-10T10:00:00.000Z");
  const state = { activeRetests: 0,insertions: 0 };
  const calls = [];
  const metricCalls = [];
  const clock = [1000,1250,2000,2100];
  const client = {
    async query(sql,values) {
      calls.push({ sql,values });
      if (sql.includes("INSERT INTO targeted_retests")) {
        state.insertions++;
        state.activeRetests = 1;
        return { rows: [{ id: 501,remediation_plan_id: 91,student_id: 19,taxonomy_id: 7 }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async query(sql,values) {
      calls.push({ sql,values });
      if (sql.includes("setting_key=ANY")) return { rows: [] };
      if (sql.includes("SELECT rp.id,rp.student_id")) {
        return { rows: state.activeRetests ? [] : [{ id: 91,student_id: 19,recovery_backlog: 1 }] };
      }
      if (sql.includes("AS max_sequence")) return { rows: [{
        max_sequence: 0,active_retests: state.activeRetests,successful_retests: 0,last_success_at: null,
      }] };
      if (sql.includes("SELECT rp.*")) return { rows: [{
        id: 91,student_id: 19,taxonomy_id: 7,cefr_level: "A1",
      }] };
      if (sql.includes("SELECT * FROM targeted_retests")) return { rows: [] };
      if (sql.includes("SELECT DISTINCT LOWER")) return { rows: [] };
      if (sql.includes("WITH RECURSIVE lineage")) return { rows: recoveryQuestions() };
      if (sql.includes("FROM review_schedules")) return { rows: [] };
      return { rows: [] };
    },
    async connect() { return client; },
  };
  const service = createLearningReviewService({
    pool,
    now: () => fixedNow,
    monotonicNow: () => clock.shift(),
    observability: {
      increment(metric,value) { metricCalls.push(["increment",metric,value]); },
      setGauge(metric,value) { metricCalls.push(["gauge",metric,value]); },
    },
  });

  const first = await service.processBatchSafe();
  const second = await service.processBatchSafe();

  assert.deepEqual(first.retestRecoveries,{ scanned: 1,recovered: 1,failed: 0,backlog: 1 });
  assert.deepEqual(second.retestRecoveries,{ scanned: 0,recovered: 0,failed: 0,backlog: 0 });
  assert.equal(state.insertions,1);
  const scan = calls.find(({ sql }) => sql.includes("SELECT rp.id,rp.student_id"));
  assert.deepEqual(scan.values,[2,25]);
  const insert = calls.find(({ sql }) => sql.includes("INSERT INTO targeted_retests"));
  assert.equal(insert.values[4],1);
  assert.deepEqual(metricCalls,[
    ["increment","learning_retest_recoveries_total",1],
    ["gauge","learning_retest_recovery_backlog",0],
    ["gauge","learning_retest_recovery_batch_duration_seconds",0.25],
    ["gauge","learning_retest_recovery_backlog",0],
    ["gauge","learning_retest_recovery_batch_duration_seconds",0.1],
  ]);
});

test("concurrent recovery workers converge on one assessment and ten unique questions", async () => {
  let existingReaders = 0;
  let releaseExistingReaders;
  const bothReadMissing = new Promise((resolve) => { releaseExistingReaders = resolve; });
  const state = {
    assessment: null,assessmentInsertAttempts: 0,assessmentRowsCreated: 0,
    questionInsertAttempts: 0,questionRows: new Set(),commits: 0,rollbacks: 0,
  };
  const capturedSql = [];
  const pool = {
    async query(sql) {
      capturedSql.push(sql);
      if (sql.includes("setting_key=ANY")) return { rows: [] };
      if (sql.includes("SELECT rp.*")) return { rows: [{
        id: 91,student_id: 19,taxonomy_id: 7,cefr_level: "A1",
      }] };
      if (sql.includes("SELECT * FROM targeted_retests")) {
        existingReaders++;
        if (existingReaders === 2) releaseExistingReaders();
        await bothReadMissing;
        return { rows: [] };
      }
      if (sql.includes("SELECT DISTINCT LOWER")) return { rows: [] };
      if (sql.includes("WITH RECURSIVE lineage")) return { rows: recoveryQuestions() };
      return { rows: [] };
    },
    async connect() {
      return {
        async query(sql,values) {
          capturedSql.push(sql);
          if (sql.includes("INSERT INTO targeted_retests")) {
            state.assessmentInsertAttempts++;
            if (!state.assessment) {
              state.assessmentRowsCreated++;
              state.assessment = {
                id: 501,remediation_plan_id: 91,student_id: 19,taxonomy_id: 7,
              };
            }
            return { rows: [state.assessment] };
          }
          if (sql.includes("INSERT INTO targeted_retest_questions")) {
            state.questionInsertAttempts++;
            state.questionRows.add(`${values[0]}:${values[1]}`);
          }
          if (sql === "COMMIT") state.commits++;
          if (sql === "ROLLBACK") state.rollbacks++;
          return { rows: [] };
        },
        release() {},
      };
    },
  };
  const service = createLearningReviewService({
    pool,now: () => new Date("2026-08-10T10:00:00.000Z"),
  });

  const [first,second] = await Promise.all([
    service.ensureInitialRetest(19,91),
    service.ensureInitialRetest(19,91),
  ]);

  assert.equal(first.id,501);
  assert.equal(second.id,501);
  assert.equal(existingReaders,2);
  assert.equal(state.assessmentInsertAttempts,2);
  assert.equal(state.assessmentRowsCreated,1);
  assert.equal(state.questionInsertAttempts,20);
  assert.equal(state.questionRows.size,10);
  assert.equal(state.commits,2);
  assert.equal(state.rollbacks,0);
  assert.ok(capturedSql.some((sql) => (
    sql.includes("ON CONFLICT (remediation_plan_id,assessment_type,sequence_no) DO UPDATE SET")
  )));
  assert.ok(capturedSql.some((sql) => (
    sql.includes("INSERT INTO targeted_retest_questions") && sql.includes("ON CONFLICT DO NOTHING")
  )));
});

test("mid-question persistence failure rolls back fully and the next retry succeeds", async () => {
  const committed = { assessment: null,questions: new Set() };
  const state = {
    nextAssessmentId: 501,failureInjected: false,begins: 0,commits: 0,rollbacks: 0,releases: 0,
  };
  const pool = {
    async query(sql) {
      if (sql.includes("setting_key=ANY")) return { rows: [] };
      if (sql.includes("SELECT rp.*")) return { rows: [{
        id: 91,student_id: 19,taxonomy_id: 7,cefr_level: "A1",
      }] };
      if (sql.includes("SELECT * FROM targeted_retests")) {
        return { rows: committed.assessment ? [committed.assessment] : [] };
      }
      if (sql.includes("SELECT DISTINCT LOWER")) return { rows: [] };
      if (sql.includes("WITH RECURSIVE lineage")) return { rows: recoveryQuestions() };
      return { rows: [] };
    },
    async connect() {
      const transaction = { assessment: null,questions: new Set(),questionAttempts: 0 };
      return {
        async query(sql,values) {
          if (sql === "BEGIN") {
            state.begins++;
            return { rows: [] };
          }
          if (sql.includes("INSERT INTO targeted_retests")) {
            transaction.assessment = {
              id: state.nextAssessmentId++,remediation_plan_id: 91,
              student_id: 19,taxonomy_id: 7,
            };
            return { rows: [transaction.assessment] };
          }
          if (sql.includes("INSERT INTO targeted_retest_questions")) {
            transaction.questionAttempts++;
            if (!state.failureInjected && transaction.questionAttempts === 5) {
              state.failureInjected = true;
              throw new Error("injected fifth question failure");
            }
            transaction.questions.add(`${values[0]}:${values[1]}`);
            return { rows: [] };
          }
          if (sql === "COMMIT") {
            state.commits++;
            committed.assessment = transaction.assessment;
            committed.questions = new Set(transaction.questions);
            return { rows: [] };
          }
          if (sql === "ROLLBACK") {
            state.rollbacks++;
            transaction.assessment = null;
            transaction.questions.clear();
            return { rows: [] };
          }
          return { rows: [] };
        },
        release() { state.releases++; },
      };
    },
  };
  const service = createLearningReviewService({
    pool,now: () => new Date("2026-08-10T10:00:00.000Z"),
  });

  await assert.rejects(
    service.ensureInitialRetest(19,91),
    /injected fifth question failure/
  );
  assert.equal(committed.assessment,null);
  assert.equal(committed.questions.size,0);

  const recovered = await service.ensureInitialRetest(19,91);

  assert.equal(recovered.id,502);
  assert.equal(committed.assessment.id,502);
  assert.equal(committed.questions.size,10);
  assert.equal(state.begins,2);
  assert.equal(state.commits,1);
  assert.equal(state.rollbacks,1);
  assert.equal(state.releases,2);
});

test("ambiguous commit outcome converges on the committed assessment without duplicates", async () => {
  const committed = { assessment: null,questions: new Set() };
  const state = {
    connections: 0,commitAttempts: 0,rollbackAttempts: 0,releases: 0,
  };
  const pool = {
    async query(sql) {
      if (sql.includes("setting_key=ANY")) return { rows: [] };
      if (sql.includes("SELECT rp.*")) return { rows: [{
        id: 91,student_id: 19,taxonomy_id: 7,cefr_level: "A1",
      }] };
      if (sql.includes("SELECT * FROM targeted_retests")) {
        return { rows: committed.assessment ? [committed.assessment] : [] };
      }
      if (sql.includes("SELECT DISTINCT LOWER")) return { rows: [] };
      if (sql.includes("WITH RECURSIVE lineage")) return { rows: recoveryQuestions() };
      return { rows: [] };
    },
    async connect() {
      state.connections++;
      const transaction = { assessment: null,questions: new Set() };
      return {
        async query(sql,values) {
          if (sql.includes("INSERT INTO targeted_retests")) {
            transaction.assessment = {
              id: 501,remediation_plan_id: 91,student_id: 19,taxonomy_id: 7,
              assessment_type: "RETEST",sequence_no: 1,status: "READY",
            };
            return { rows: [transaction.assessment] };
          }
          if (sql.includes("INSERT INTO targeted_retest_questions")) {
            transaction.questions.add(`${values[0]}:${values[1]}`);
            return { rows: [] };
          }
          if (sql === "COMMIT") {
            state.commitAttempts++;
            committed.assessment = transaction.assessment;
            committed.questions = new Set(transaction.questions);
            throw new Error("connection lost after commit");
          }
          if (sql === "ROLLBACK") {
            state.rollbackAttempts++;
            throw new Error("transaction outcome already committed");
          }
          return { rows: [] };
        },
        release() { state.releases++; },
      };
    },
  };
  const service = createLearningReviewService({
    pool,now: () => new Date("2026-08-10T10:00:00.000Z"),
  });

  await assert.rejects(
    service.ensureInitialRetest(19,91),
    /connection lost after commit/
  );
  assert.equal(committed.assessment.id,501);
  assert.equal(committed.questions.size,10);

  const recovered = await service.ensureInitialRetest(19,91);

  assert.equal(recovered.id,501);
  assert.equal(committed.questions.size,10);
  assert.equal(state.connections,1);
  assert.equal(state.commitAttempts,1);
  assert.equal(state.rollbackAttempts,1);
  assert.equal(state.releases,1);
});

test("background recovery isolates an ambiguous commit and the next batch creates no duplicates", async () => {
  const committed = new Map();
  const metrics = [];
  const gauges = [];
  const errors = [];
  const state = { connections: 0,commits: 0,rollbacks: 0,ambiguousInjected: false };
  const plans = [
    { id: 91,student_id: 19,taxonomy_id: 7,cefr_level: "A1" },
    { id: 92,student_id: 20,taxonomy_id: 8,cefr_level: "A1" },
  ];
  const pool = {
    async query(sql,values = []) {
      if (sql.includes("setting_key=ANY")) return { rows: [] };
      if (sql.includes("WITH recovery_candidates")) {
        const candidates = plans.filter((plan) => !committed.has(plan.id));
        return { rows: candidates.map((plan) => ({
          id: plan.id,student_id: plan.student_id,recovery_backlog: candidates.length,
        })) };
      }
      if (sql.includes("AS max_sequence")) return { rows: [{
        max_sequence: 0,active_retests: 0,successful_retests: 0,last_success_at: null,
      }] };
      if (sql.includes("SELECT rp.*")) {
        const plan = plans.find(({ id }) => id === values[0]);
        return { rows: plan ? [plan] : [] };
      }
      if (sql.includes("SELECT * FROM targeted_retests")) {
        const saved = committed.get(values[0]);
        return { rows: saved ? [saved.assessment] : [] };
      }
      if (sql.includes("SELECT DISTINCT LOWER")) return { rows: [] };
      if (sql.includes("WITH RECURSIVE lineage")) return { rows: recoveryQuestions() };
      return { rows: [] };
    },
    async connect() {
      state.connections++;
      const transaction = { assessment: null,questions: new Set() };
      return {
        async query(sql,values) {
          if (sql.includes("INSERT INTO targeted_retests")) {
            transaction.assessment = {
              id: values[0] + 410,remediation_plan_id: values[0],student_id: values[1],
              taxonomy_id: values[2],assessment_type: values[3],sequence_no: values[4],status: values[6],
            };
            return { rows: [transaction.assessment] };
          }
          if (sql.includes("INSERT INTO targeted_retest_questions")) {
            transaction.questions.add(`${values[0]}:${values[1]}`);
          }
          if (sql === "COMMIT") {
            state.commits++;
            const planId = transaction.assessment.remediation_plan_id;
            committed.set(planId,{
              assessment: transaction.assessment,questions: new Set(transaction.questions),
            });
            if (planId === 91 && !state.ambiguousInjected) {
              state.ambiguousInjected = true;
              throw new Error("connection lost after worker commit");
            }
          }
          if (sql === "ROLLBACK") {
            state.rollbacks++;
            throw new Error("transaction outcome already committed");
          }
          return { rows: [] };
        },
        release() {},
      };
    },
  };
  const service = createLearningReviewService({
    pool,
    observability: {
      increment(metric,value = 1) { metrics.push([metric,value]); },
      setGauge(metric,value) { gauges.push([metric,value]); },
    },
    logger: { error(...args) { errors.push(args); } },
    now: () => new Date("2026-08-10T10:00:00.000Z"),
  });

  const first = await service.processPendingRetestRecoveries();
  const second = await service.processPendingRetestRecoveries();

  assert.deepEqual(first,{ scanned: 2,recovered: 1,failed: 1,backlog: 2 });
  assert.deepEqual(second,{ scanned: 0,recovered: 0,failed: 0,backlog: 0 });
  assert.equal(committed.size,2);
  assert.deepEqual([...committed.values()].map(({ questions }) => questions.size),[10,10]);
  assert.equal(state.connections,2);
  assert.equal(state.commits,2);
  assert.equal(state.rollbacks,1);
  assert.deepEqual(metrics,[
    ["learning_retest_schedule_failures_total",1],["learning_retest_recoveries_total",1],
  ]);
  assert.equal(errors[0][1],"connection lost after worker commit");
  assert.ok(gauges.some(([metric,value]) => metric === "learning_retest_recovery_backlog" && value === 0));
});

test("one background recovery failure is observable and does not block other worker phases", async () => {
  const metrics = [];
  const gauges = [];
  const errors = [];
  const pool = {
    async query(sql) {
      if (sql.includes("setting_key=ANY")) return { rows: [] };
      if (sql.includes("SELECT rp.id,rp.student_id")) {
        return { rows: [{ id: 91,student_id: 19,recovery_backlog: 1 }] };
      }
      if (sql.includes("AS max_sequence")) throw new Error("temporary recovery failure");
      if (sql.includes("FROM review_schedules")) return { rows: [] };
      return { rows: [] };
    },
  };
  const service = createLearningReviewService({
    pool,
    observability: {
      increment(metric) { metrics.push(metric); },
      setGauge(metric,value) { gauges.push([metric,value]); },
    },
    logger: { error(...args) { errors.push(args); } },
  });

  const result = await service.processBatchSafe();

  assert.deepEqual(result, {
    retestRecoveries: { scanned: 1,recovered: 0,failed: 1,backlog: 1 },reviews: 0,notifications: 0,
  });
  assert.deepEqual(metrics,["learning_retest_schedule_failures_total"]);
  assert.ok(gauges.some(([metric,value]) => (
    metric === "learning_retest_recovery_backlog" && value === 1
  )));
  assert.equal(errors[0][0],"Background retest recovery xatosi:");
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

test("upcoming retests expose independent mastery progress without becoming due early", async () => {
  const calls = [];
  const pool = {
    async query(sql,values) {
      calls.push({ sql,values });
      if (sql.includes("setting_key=ANY")) return { rows: [] };
      if (sql.includes("status='RETEST_PENDING'")) return { rows: [] };
      if (sql.includes("FROM review_schedules")) return { rows: [] };
      if (sql.includes("DISTINCT ON")) return { rows: [{
        id: 12,assessment_type: "RETEST",successful_retests: 1,
        required_successful_retests: 2,scheduled_for: "2026-08-11T10:00:00.000Z",
      }] };
      return { rows: [] };
    },
  };
  const service = createLearningReviewService({ pool });

  const result = await service.listUpcomingRetests(19);

  assert.equal(result[0].successful_retests,1);
  assert.equal(result[0].required_successful_retests,2);
  const query = calls.find(({ sql }) => sql.includes("DISTINCT ON"));
  assert.match(query.sql,/r\.scheduled_for>NOW\(\)/);
  assert.deepEqual(query.values,[19,2]);
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
