const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createAdminQuestionUpdateController } = require("../src/controllers/adminQuestionUpdateController");
const { createQuestionAnalysisService } = require("../src/services/questionAnalysisService");

const pagePath = path.join(__dirname, "..", "public", "admin.html");
const modulePath = path.join(__dirname, "..", "public", "admin-question-analysis.js");

test("admin page delegates question analysis UI and opens it after save", () => {
  const html = fs.readFileSync(pagePath, "utf8");

  assert.match(html, /src="\/admin-question-analysis\.js"/);
  assert.match(html, /id="questionAnalysisModal"/);
  assert.match(html, /id="questionAnalysisReviewQueueModal"/);
  assert.match(html, /openQuestionAnalysisReviewQueue\(\)/);
  assert.match(html, /openQuestionAnalysis\(data\.id, \{ created: true \}\)/);
  assert.doesNotMatch(html, /var _analysisQuestionId/);
  assert.match(html, /\.qa-summary \{/);
  assert.match(html, /function renderQualityEngine\(engine\)/);
  assert.match(html, /counts\.POSSIBLE_WRONG_KEY/);
  assert.match(html, /openQuestionAnalysis\(' \+ q\.question_id/);
});

test("admin question analysis module renders escaped detailed evidence and override controls", async () => {
  const source = fs.readFileSync(modulePath, "utf8");
  const elements = {
    questionAnalysisBody: { innerHTML: "" },
    questionAnalysisModal: { classList: { add() {}, remove() {} } },
    questionAnalysisReviewQueueBody: { innerHTML: "", className: "" },
    questionAnalysisReviewQueueModal: { classList: { add() {}, remove() {} } },
    qaReviewQueueCount: { textContent: "" },
    qaReviewQueuePageInfo: { textContent: "" },
    qaReviewQueuePrev: { disabled: false },
    qaReviewQueueNext: { disabled: false },
  };
  const analysis = {
    estimated_level: "A2",
    level_confidence: 0.91,
    analysis_confidence: 0.93,
    status: "READY",
    main_skill_name: "Grammar",
    topic_name: "<Present Simple>",
    subskill_name: "Third-person singular",
    micro_skill_name: "Selecting endings",
    diagnostic_eligible: true,
    level_evidence: ["Sentence structure matches A2"],
    prerequisites: [{ id: 1, name: "Verb forms", node_type: "subskill" }],
    quality_warnings: [],
    distractors: [{ option_code: "A", error_code: "RULE_GAP", likely_reason: "Missing -s", confidence: 0.9, source: "ai" }],
    overrides: [],
    required_vocabulary: ["watch"],
    raw_analysis: { rule_signature_candidate: "grammar.present_simple.third_person_consonant_y_to_ies" },
    rule_signature: "grammar.present_simple.third_person_consonant_y_to_ies",
    rule_signature_version: "canonical_rule_signature_v1",
    rule_signature_confidence: 1,
    rule_signature_reviewed: true,
  };
  const context = {
    document: { getElementById(id) { return elements[id]; } },
    setTimeout,
    window: {
      async apiGet(url) {
        if (url.includes("review-queue")) {
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                items: [{
                  question_id: 42,
                  question_text: "<script>unsafe</script>",
                  estimated_level: "A2",
                  topic_name: "Present Simple",
                  status: "REVIEW_REQUIRED",
                  rule_signature_candidate: "grammar.present_simple.third_person_s_affirmative",
                  rule_signature: null,
                  rule_signature_reviewed: false,
                  rule_signature_quarantined: true,
                }],
                total: 1,
              };
            },
          };
        }
        return { ok: true, status: 200, async json() { return { analysis }; } };
      },
      async apiPost() { return { ok: true }; },
      icons() {},
      toast() {},
      loadQuestions() {},
    },
  };

  assert.doesNotThrow(() => new vm.Script(source));
  vm.runInNewContext(source, context);
  context.window.openQuestionAnalysis(42);
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(elements.questionAnalysisBody.innerHTML, /AI ishonchi/);
  assert.match(elements.questionAnalysisBody.innerHTML, /Daraja dalillari/);
  assert.match(elements.questionAnalysisBody.innerHTML, /Prerequisite ko'nikmalar/);
  assert.match(elements.questionAnalysisBody.innerHTML, /Admin override/);
  assert.match(elements.questionAnalysisBody.innerHTML, /AI qoida nomzodi/);
  assert.match(elements.questionAnalysisBody.innerHTML, /Canonical qoida/);
  assert.match(elements.questionAnalysisBody.innerHTML, /qaOverrideSignatureAction/);
  assert.match(elements.questionAnalysisBody.innerHTML, /qaOverrideSignature/);
  assert.match(elements.questionAnalysisBody.innerHTML, /&lt;Present Simple&gt;/);
  assert.doesNotMatch(elements.questionAnalysisBody.innerHTML, /<Present Simple>/);

  context.window.openQuestionAnalysisReviewQueue();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(elements.questionAnalysisReviewQueueBody.innerHTML, /Karantin/);
  assert.match(elements.questionAnalysisReviewQueueBody.innerHTML, /REVIEW_REQUIRED/);
  assert.match(elements.questionAnalysisReviewQueueBody.innerHTML, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.equal(elements.qaReviewQueueCount.textContent, "1 ta savol");
});

test("admin question analysis review exposes validation errors as HTTP 400", async () => {
  const controller = createAdminQuestionUpdateController({
    pool: {},
    logAudit: async () => {},
    logger: { error() {} },
    questionAnalysisService: {
      async review() {
        const error = new Error("Canonical qoida formati noto'g'ri");
        error.statusCode = 400;
        throw error;
      },
    },
  });
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await controller.reviewAnalysis({ params: { id: "42" }, body: {}, admin: { name: "Admin" } }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Canonical qoida formati noto'g'ri" });
});

test("question analysis review queue filters and paginates with parameterized SQL", async () => {
  const calls = [];
  const service = createQuestionAnalysisService({
    pool: {
      async query(sql, params) {
        calls.push([sql.replace(/\s+/g, " ").trim(), params]);
        return {
          rows: [{
            question_id: 42,
            question_text: "Question",
            rule_signature_quarantined: true,
            total_count: "1",
          }],
        };
      },
    },
    aiService: {},
    logger: { error() {} },
  });

  const result = await service.listReviewQueue({ filter: "quarantined", limit: "10", offset: "5" });

  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /ANY\(\$1::text\[\]\)/);
  assert.match(calls[0][0], /LIMIT \$2 OFFSET \$3/);
  assert.ok(calls[0][1][0].includes("grammar.present_simple.third_person_s_affirmative"));
  assert.deepEqual(calls[0][1].slice(1), [10, 5]);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].total_count, undefined);
  await assert.rejects(service.listReviewQueue({ filter: "invalid" }), { statusCode: 400 });
});
