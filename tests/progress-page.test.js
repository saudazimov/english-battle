const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicRoot = path.join(__dirname, "..", "public");

test("progress navigation opens the completed page", () => {
  const sidebar = fs.readFileSync(path.join(publicRoot, "sidebar.js"), "utf8");

  assert.match(sidebar, /id: "progress"[^\n]+href: "\/progress\.html"[^\n]+ready: true/);
});

test("progress page includes the universal layout and AI experience", () => {
  const page = fs.readFileSync(path.join(publicRoot, "progress.html"), "utf8");

  assert.match(page, /<aside class="sidebar"><\/aside>/);
  assert.match(page, /<div class="topbar"><\/div>/);
  assert.match(page, /href="\/app\.css"/);
  assert.match(page, /\.app\{display:grid;grid-template-columns:230px minmax\(0,1fr\) 340px;width:100%;max-width:none;margin:0;padding:20px/);
  assert.match(page, /\.sidebar\{height:100%;overflow-y:auto\}/);
  assert.doesNotMatch(page, /\.sidebar\{[^}]*padding:24px/);
  assert.match(page, /html\{background:#070d1c;color-scheme:dark\}/);
  assert.match(page, /body,\.content,\.rightbar\{scrollbar-width:none;-ms-overflow-style:none\}/);
  assert.match(page, /body::-webkit-scrollbar,\.content::-webkit-scrollbar,\.rightbar::-webkit-scrollbar\{width:0;height:0;display:none\}/);
  assert.match(page, /\.content\{min-width:0;width:100%;max-width:none;margin:0;padding:0 0 44px\}/);
  assert.match(page, /<aside class="rightbar">/);
  assert.match(page, /data-period="today"/);
  assert.match(page, /data-period="7d"/);
  assert.match(page, /data-period="30d"/);
  assert.match(page, /id="metricAccuracy"/);
  assert.match(page, /id="topicGrid"/);
  assert.match(page, /id="lessonLibrary"/);
  assert.match(page, /id="lessonCountBadge"/);
  assert.match(page, /id="learningPlan"/);
  assert.match(page, /id="learningOverview"/);
  assert.match(page, /id="exactWeaknesses"/);
  assert.match(page, /id="reviewDueList"/);
  assert.match(page, /id="learningTimeline"/);
  assert.match(page, /id="assessmentDialog"/);
  assert.match(page, /id="qualityConfidence"/);
  assert.match(page, /id="studyMethods"/);
  assert.match(page, /id="aiBody"/);
  assert.doesNotMatch(page, /id="refreshAiButton"/);
  assert.doesNotMatch(page, /Joriy rating|G‘alaba foizi|So‘nggi forma|Current Rank/);
  assert.match(page, /src="\/payment-modal\.js"/);
  assert.match(page, /src="\/progress-learning\.js"/);
  assert.match(page, /src="\/progress\.js"/);
  assert.doesNotMatch(page, /tez kunda/i);
  assert.doesNotMatch(page, /\.topbar\{height:104px/);
  assert.doesNotMatch(page, /grid-template-columns:312px/);
});

test("progress dashboard uses the evidence-based today, 7 and 30 day analysis endpoint", () => {
  const script = fs.readFileSync(path.join(publicRoot, "progress.js"), "utf8");

  assert.match(script, /requestJson\("\/ai\/reports\/student\/weekly\?period=" \+ period/);
  assert.match(script, /loadPeriod\("7d"\)/);
  assert.match(script, /today: "Bugungi natijalar"/);
  assert.match(script, /data\.analysis\.learning_diagnostics/);
  assert.match(script, /diagnostics\.priority_topics/);
  assert.match(script, /report\.topic_lessons/);
  assert.match(script, /renderLessonLibrary\(data\.report \|\| \{\}\)/);
  assert.match(script, /lesson\.worked_examples/);
  assert.match(script, /lesson\.practice_sequence/);
  assert.match(script, /lesson\.review_schedule/);
  assert.match(script, /lesson\.mastery_criterion/);
  assert.match(script, /report\.learning_plan/);
  assert.match(script, /report\.study_principles/);
  assert.doesNotMatch(script, /\?refresh=1|refreshAiButton/);
  assert.match(script, /error\.status === 402/);
  assert.match(script, /window\.openPaymentModal\("student_premium"\)/);
  assert.match(script, /textContent = String\(item\)/);
  assert.doesNotMatch(script, /rating_change|win_rate|battle\.outcome/);
  assert.doesNotMatch(script, /Math\.random/);
});

test("student progress connects real mastery, lesson, retest and review data", () => {
  const pageScript = fs.readFileSync(path.join(publicRoot, "progress.js"), "utf8");
  const script = fs.readFileSync(path.join(publicRoot, "progress-learning.js"), "utf8");

  assert.match(pageScript, /window\.createProgressLearningUI/);
  assert.match(pageScript, /learningUi\.load\(\)/);
  assert.match(pageScript, /requestJson\("\/learning\/remediation\/lessons"/);
  assert.match(pageScript, /requestJson\("\/learning\/remediation\/lessons\/sync"/);
  assert.match(pageScript, /\/lessons\/" \+ lessonId \+ "\/start"/);
  assert.match(pageScript, /\/exercises\/" \+ exerciseId \+ "\/answer"/);
  assert.match(pageScript, /\/lessons\/" \+ activeLessonId \+ "\/complete"/);
  assert.match(script, /requestJson\("\/learning\/progress\/overview"/);
  assert.match(script, /requestJson\("\/learning\/remediation\/assessments\/due"/);
  assert.match(script, /\/assessments\/" \+ assessmentId \+ "\/start"/);
  assert.match(script, /\/questions\/" \+ questionId \+ "\/answer"/);
  assert.match(script, /\/assessments\/" \+ activeAssessmentId \+ "\/complete"/);
  assert.match(script, /renderLearningOverview/);
  assert.match(script, /renderExactWeaknesses/);
  assert.match(script, /renderLearningTimeline/);
  assert.match(script, /renderDueAssessments/);
  assert.match(script, /response_time_ms/);
  assert.doesNotMatch(script, /innerHTML[^\n]+question\.prompt/);
});

test("shared responsive styles provide a visible branded scrollbar", () => {
  const responsive = fs.readFileSync(path.join(publicRoot, "responsive.css"), "utf8");

  assert.match(responsive, /scrollbar-color: #526fa9 #080f20/);
  assert.match(responsive, /\*::-webkit-scrollbar-thumb \{/);
  assert.match(responsive, /background: linear-gradient\(180deg, #526fa9, #7657c9\)/);
  assert.match(responsive, /\*::-webkit-scrollbar-thumb:hover \{/);
  assert.doesNotMatch(responsive, /scrollbar-width:\s*none/);
});
