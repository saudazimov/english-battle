const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const pagePath = path.join(__dirname, "..", "public", "admin.html");
const modulePath = path.join(__dirname, "..", "public", "admin-question-analysis.js");

test("admin page delegates question analysis UI and opens it after save", () => {
  const html = fs.readFileSync(pagePath, "utf8");

  assert.match(html, /src="\/admin-question-analysis\.js"/);
  assert.match(html, /id="questionAnalysisModal"/);
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
  };
  const context = {
    document: { getElementById(id) { return elements[id]; } },
    setTimeout,
    window: {
      async apiGet() { return { ok: true, status: 200, async json() { return { analysis }; } }; },
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
  assert.match(elements.questionAnalysisBody.innerHTML, /&lt;Present Simple&gt;/);
  assert.doesNotMatch(elements.questionAnalysisBody.innerHTML, /<Present Simple>/);
});
