const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const pagePath = path.join(__dirname, "..", "public", "teacher-results.html");
const modulePath = path.join(__dirname, "..", "public", "teacher-learning-analytics.js");

test("teacher results page wires learning analytics without replacing existing tabs", () => {
  const html = fs.readFileSync(pagePath, "utf8");

  assert.match(html, /id="tabStudents"/);
  assert.match(html, /id="tabQuestions"/);
  assert.match(html, /id="tabSkills"/);
  assert.match(html, /id="tabAnalytics"/);
  assert.match(html, /teacher-learning-analytics\.js/);
  assert.match(html, /data\.teacher_analytics \|\| null/);
  assert.match(html, /renderTeacherLearningAnalytics\(teacherAnalyticsData\)/);
  assert.match(html, /openStudentLearningReport\(' \+ r\.student_id/);
});

test("teacher learning analytics browser module is valid JavaScript and exposes report controls", () => {
  const source = fs.readFileSync(modulePath, "utf8");

  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /global\.renderTeacherLearningAnalytics = renderTeacherLearningAnalytics/);
  assert.match(source, /global\.openStudentLearningReport = openStudentLearningReport/);
  assert.match(source, /global\.closeStudentLearningReport = closeStudentLearningReport/);
  assert.match(source, /REGRESSED: \["Orqaga ketgan", "regressed"\]/);
  assert.match(source, /safe\(student\.name\)/);
});

test("teacher learning analytics renders heatmap and escaped student report", () => {
  const source = fs.readFileSync(modulePath, "utf8");
  const elements = {
    resultArea: { innerHTML: "" },
    studentReportModal: {
      innerHTML: "",
      classList: { add() {}, remove() {} },
    },
  };
  const context = {
    document: { getElementById(id) { return elements[id]; } },
    window: {},
  };
  vm.runInNewContext(source, context);
  const student = {
    student_id: 4,
    name: "<Ali>",
    profiles: [{ taxonomy_id: 9, taxonomy_name: "Grammar", state: "CONFIRMED", mastery: 35, confidence: 80, retention: 30 }],
    findings: [],
    lesson: null,
    needs_support: true,
    improving: false,
    regressed: false,
    overdue_reviews: 0,
    highest_priority_weakness: { taxonomy_name: "Grammar", state: "CONFIRMED", mastery: 35, confidence: 80, retention: 30 },
    strongest_skill: null,
  };
  const analytics = {
    overview: { class_accuracy: 45, class_mastery: 35, students_needing_support: 1, students_with_evidence: 1 },
    weak_topics: [{ taxonomy_id: 9 }],
    heatmap: { topics: [{ taxonomy_id: 9, name: "Grammar" }], students: [student] },
    students: [student],
    group_recommendations: [],
  };

  context.window.teacherAnalyticsData = analytics;
  context.window.renderTeacherLearningAnalytics(analytics);
  assert.match(elements.resultArea.innerHTML, /Zaifliklar heatmap/);
  assert.match(elements.resultArea.innerHTML, /Tasdiqlangan/);
  assert.match(elements.resultArea.innerHTML, /&lt;Ali&gt;/);

  context.window.openStudentLearningReport(4);
  assert.match(elements.studentReportModal.innerHTML, /Pedagogik xulosa/);
  assert.match(elements.studentReportModal.innerHTML, /&lt;Ali&gt;/);
  assert.doesNotMatch(elements.studentReportModal.innerHTML, /<h2><Ali>/);
});
