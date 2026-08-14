(function teacherLearningAnalyticsModule(global) {
  "use strict";

  var STATE_META = {
    OBSERVED: ["teacher.results.stateObserved", "Kuzatilgan", "observed"],
    SUSPECTED: ["teacher.results.stateSuspected", "Ehtimoliy zaiflik", "weak"],
    LIKELY: ["teacher.results.stateLikely", "Kuchli ehtimol", "weak"],
    CONFIRMED: ["teacher.results.stateConfirmed", "Tasdiqlangan", "weak"],
    REMEDIATING: ["teacher.results.stateRemediating", "Tuzatilmoqda", "remediating"],
    IMPROVING: ["teacher.results.stateImproving", "Yaxshilanmoqda", "improving"],
    STABLE: ["teacher.results.stateStable", "Barqaror", "mastered"],
    MASTERED: ["teacher.results.stateMastered", "O'zlashtirilgan", "mastered"],
    REGRESSED: ["teacher.results.stateRegressed", "Orqaga ketgan", "regressed"],
  };

  function tr(key, fallback, params) {
    return typeof global.resultsT === "function" ? global.resultsT(key, fallback, params) : fallback;
  }

  function safe(value) {
    if (typeof global.esc === "function") return global.esc(value);
    return String(value == null ? "" : value).replace(/[&<>"']/g, function replace(char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function metric(label, value) {
    return '<div class="learning-metric"><span>' + safe(label) + '</span><b>' + safe(value) + '</b></div>';
  }

  function stateBadge(state) {
    var meta = STATE_META[state] || ["teacher.results.stateInsufficient", "Dalil yetarli emas", "insufficient"];
    return '<span class="heat-state ' + meta[2] + '">' + safe(tr(meta[0], meta[1])) + '</span>';
  }

  function profileFor(student, taxonomyId) {
    return (student.profiles || []).find(function find(profile) {
      return String(profile.taxonomy_id) === String(taxonomyId);
    });
  }

  function renderHeatmap(heatmap) {
    var topics = (heatmap && heatmap.topics) || [];
    var students = (heatmap && heatmap.students) || [];
    if (!topics.length || !students.length) {
      return '<div class="state-msg">' + safe(tr("teacher.results.heatmapNoEvidence", "Xarita uchun hali yetarli diagnostik dalil yo'q.")) + '</div>';
    }
    var head = topics.map(function topicHead(topic) {
      return "<th>" + safe(topic.name) + "</th>";
    }).join("");
    var body = students.map(function studentRow(student) {
      var cells = topics.map(function topicCell(topic) {
        var profile = profileFor(student, topic.taxonomy_id);
        return "<td>" + stateBadge(profile && profile.state) + "</td>";
      }).join("");
      return '<tr><td><button class="btn-link" onclick="openStudentLearningReport(' +
        Number(student.student_id) + ')">' + safe(student.name) + "</button></td>" + cells + "</tr>";
    }).join("");
    return '<div class="heatmap-wrap"><table class="heatmap"><thead><tr><th>' + safe(tr("teacher.results.studentFallback", "O'quvchi")) + '</th>' +
      head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function renderRecommendations(items) {
    if (!items.length) return '<div class="state-msg">' + safe(tr("teacher.results.noGroupWeakness", "Hozircha guruh darsi talab qiladigan umumiy zaiflik aniqlanmadi.")) + '</div>';
    return '<div class="recommendation-list">' + items.map(function recommendation(item) {
      return '<div class="recommendation"><div><strong>' + safe(item.topic) + '</strong><p>' +
        safe(tr("teacher.results.weaknessObserved", "{affected} / {total} o'quvchida zaiflik kuzatildi. {recommendation}", { affected: item.affected_students, total: item.total_students, recommendation: item.recommendation })) +
        '</p></div><span class="status-badge mid">' + safe(tr("teacher.results.affectedStudents", "{count} o'quvchi", { count: item.affected_students })) + "</span></div>";
    }).join("") + "</div>";
  }

  function renderTeacherLearningAnalytics(data) {
    var area = document.getElementById("resultArea");
    if (!area) return;
    if (!data) {
      area.innerHTML = '<div class="state-msg">' + safe(tr("teacher.results.diagnosticsUnavailable", "Sinf diagnostikasini yuklab bo'lmadi.")) + '</div>';
      return;
    }
    var overview = data.overview || {};
    area.innerHTML = '<div class="learning-overview">' +
      metric(tr("teacher.results.classAccuracy", "Sinf aniqligi"), overview.class_accuracy == null ? "—" : overview.class_accuracy + "%") +
      metric(tr("teacher.results.averageMastery", "O'rtacha o'zlashtirish"), overview.class_mastery == null ? "—" : overview.class_mastery + "%") +
      metric(tr("teacher.results.needsSupport", "Yordam kerak"), overview.students_needing_support || 0) +
      metric(tr("teacher.results.improving", "Yaxshilanmoqda"), overview.students_improving || 0) +
      metric(tr("teacher.results.regression", "Orqaga ketish"), overview.students_regressed || 0) +
      metric(tr("teacher.results.overdueReviews", "Kechikkan takrorlash"), overview.overdue_reviews || 0) +
      metric(tr("teacher.results.evidenceProfiles", "Dalilli profil"), overview.students_with_evidence || 0) +
      metric(tr("teacher.results.topTopics", "Top mavzular"), (data.weak_topics || []).length) +
      '</div><section class="learning-section"><h3>' + safe(tr("teacher.results.heatmapTitle", "Zaifliklar xaritasi")) + '</h3>' +
      renderHeatmap(data.heatmap) +
      '</section><section class="learning-section"><h3>' + safe(tr("teacher.results.groupRecommendations", "Guruh darsi tavsiyalari")) + '</h3>' +
      renderRecommendations(data.group_recommendations || []) + "</section>";
  }

  function reportLine(label, value) {
    return "<p><strong>" + safe(label) + ":</strong> " + safe(value == null ? "—" : value) + "</p>";
  }

  function buildAiSummary(student) {
    var weakness = student.highest_priority_weakness;
    if (!weakness) return tr("teacher.results.noActiveWeakness", "Yetarli dalil asosida faol zaiflik topilmadi. Yangi savollar orqali kuzatuvni davom ettiring.");
    var action = student.findings && student.findings[0] && student.findings[0].recommended_action;
    var stateMeta = STATE_META[weakness.state] || ["teacher.results.stateInsufficient", "Dalil yetarli emas", "insufficient"];
    var recommendation = action
      ? tr("teacher.results.recommendationPrefix", "Tavsiya: {action}.", { action: action })
      : tr("teacher.results.defaultRecommendation", "Qisqa dars va kechiktirilgan qayta test tavsiya etiladi.");
    return tr("teacher.results.aiSummary", "{topic} bo'yicha {state} holati aniqlandi. O'zlashtirish {mastery}%, ishonch {confidence}%. {recommendation}", {
      topic: weakness.taxonomy_name,
      state: tr(stateMeta[0], stateMeta[1]).toLowerCase(),
      mastery: Math.round(weakness.mastery),
      confidence: Math.round(weakness.confidence),
      recommendation: recommendation,
    });
  }

  function renderFindings(findings) {
    if (!findings || !findings.length) return safe(tr("teacher.results.noActivePattern", "Faol xato naqshi topilmadi."));
    return findings.slice(0, 5).map(function finding(item) {
      var classification = item.classification ? " · " + item.classification : "";
      return safe(tr("teacher.results.findingLine", "{name}{classification} · {count} marta · ishonch {confidence}%", {
        name: item.taxonomy_name,
        classification: classification,
        count: item.occurrences,
        confidence: item.confidence,
      }));
    }).join("<br>");
  }

  function openStudentLearningReport(studentId) {
    var data = global.teacherAnalyticsData;
    var student = data && (data.students || []).find(function find(item) {
      return Number(item.student_id) === Number(studentId);
    });
    if (!student) {
      if (typeof global.showToast === "function") global.showToast(tr("teacher.results.profileNotReady", "Bu o'quvchi uchun diagnostik profil hali tayyor emas"));
      return;
    }
    var weakness = student.highest_priority_weakness;
    var strongest = student.strongest_skill;
    var lesson = student.lesson || {};
    var modal = document.getElementById("studentReportModal");
    modal.innerHTML = '<article class="student-report"><header class="student-report-head"><div><h2>' +
      safe(student.name) + '</h2><div class="stat-sub">' + safe(tr("teacher.results.individualDiagnostics", "Individual o'quv diagnostikasi")) + '</div></div>' +
      '<button class="act-ic" onclick="closeStudentLearningReport()" aria-label="' + safe(tr("teacher.results.close", "Yopish")) + '">×</button></header>' +
      '<div class="student-report-grid">' +
      '<section class="student-report-card"><h4>' + safe(tr("teacher.results.keyMetrics", "Asosiy ko'rsatkichlar")) + '</h4>' +
      reportLine(tr("teacher.results.observedSkills", "Kuzatilgan ko'nikmalar"), student.profiles.length) +
      reportLine(tr("teacher.results.needsSupport", "Yordam kerak"), student.needs_support ? tr("teacher.results.yes", "Ha") : tr("teacher.results.no", "Yo'q")) +
      reportLine(tr("teacher.results.regression", "Orqaga ketish"), student.regressed ? tr("teacher.results.detected", "Aniqlandi") : tr("teacher.results.notDetected", "Aniqlanmadi")) +
      reportLine(tr("teacher.results.overdueReviews", "Kechikkan takrorlash"), student.overdue_reviews) + "</section>" +
      '<section class="student-report-card"><h4>' + safe(tr("teacher.results.skillState", "Ko'nikma holati")) + '</h4>' +
      reportLine(tr("teacher.results.mainWeakness", "Asosiy zaiflik"), weakness && weakness.taxonomy_name) +
      reportLine(tr("teacher.results.masteryConfidence", "O'zlashtirish / ishonch"), weakness ? Math.round(weakness.mastery) + "% / " + Math.round(weakness.confidence) + "%" : "—") +
      reportLine(tr("teacher.results.strongSkill", "Kuchli ko'nikma"), strongest && strongest.taxonomy_name) +
      reportLine(tr("teacher.results.retention", "Saqlanish"), weakness ? Math.round(weakness.retention) + "%" : "—") + "</section>" +
      '<section class="student-report-card"><h4>' + safe(tr("teacher.results.evidenceTitle", "Xato dalillari va chalg'ituvchi variantlar naqshi")) + '</h4><p>' +
      renderFindings(student.findings) + "</p></section>" +
      '<section class="student-report-card"><h4>' + safe(tr("teacher.results.lessonRetest", "Dars va qayta test")) + '</h4>' +
      reportLine(tr("teacher.results.activeLessons", "Faol darslar"), lesson.active || 0) +
      reportLine(tr("teacher.results.completedLessons", "Tugallangan darslar"), lesson.completed || 0) +
      reportLine(tr("teacher.results.averageProgress", "O'rtacha progress"), Math.round(lesson.progress || 0) + "%") +
      reportLine(tr("teacher.results.retestPending", "Qayta test kutilmoqda"), lesson.retest_pending || 0) + "</section>" +
      '<section class="student-report-card" style="grid-column:1/-1"><h4>' + safe(tr("teacher.results.pedagogicalSummary", "Pedagogik xulosa")) + '</h4><p>' +
      safe(buildAiSummary(student)) + "</p></section></div></article>";
    modal.classList.add("open");
  }

  function closeStudentLearningReport() {
    var modal = document.getElementById("studentReportModal");
    if (modal) modal.classList.remove("open");
  }

  global.renderTeacherLearningAnalytics = renderTeacherLearningAnalytics;
  global.openStudentLearningReport = openStudentLearningReport;
  global.closeStudentLearningReport = closeStudentLearningReport;
}(window));
