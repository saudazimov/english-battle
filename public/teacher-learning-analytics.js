(function teacherLearningAnalyticsModule(global) {
  "use strict";

  var STATE_META = {
    OBSERVED: ["Kuzatilgan", "observed"],
    SUSPECTED: ["Ehtimoliy zaiflik", "weak"],
    LIKELY: ["Kuchli ehtimol", "weak"],
    CONFIRMED: ["Tasdiqlangan", "weak"],
    REMEDIATING: ["Tuzatilmoqda", "remediating"],
    IMPROVING: ["Yaxshilanmoqda", "improving"],
    STABLE: ["Barqaror", "mastered"],
    MASTERED: ["O'zlashtirilgan", "mastered"],
    REGRESSED: ["Orqaga ketgan", "regressed"],
  };

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
    var meta = STATE_META[state] || ["Dalil yetarli emas", "insufficient"];
    return '<span class="heat-state ' + meta[1] + '">' + meta[0] + '</span>';
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
      return '<div class="state-msg">Heatmap uchun hali yetarli diagnostik dalil yo\'q.</div>';
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
    return '<div class="heatmap-wrap"><table class="heatmap"><thead><tr><th>O\'quvchi</th>' +
      head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function renderRecommendations(items) {
    if (!items.length) return '<div class="state-msg">Hozircha guruh darsi talab qiladigan umumiy zaiflik aniqlanmadi.</div>';
    return '<div class="recommendation-list">' + items.map(function recommendation(item) {
      return '<div class="recommendation"><div><strong>' + safe(item.topic) + '</strong><p>' +
        safe(item.affected_students + " / " + item.total_students + " o'quvchida zaiflik kuzatildi. " + item.recommendation) +
        '</p></div><span class="status-badge mid">' + safe(item.affected_students) + " o'quvchi</span></div>";
    }).join("") + "</div>";
  }

  function renderTeacherLearningAnalytics(data) {
    var area = document.getElementById("resultArea");
    if (!area) return;
    if (!data) {
      area.innerHTML = '<div class="state-msg">Sinf diagnostikasini yuklab bo\'lmadi.</div>';
      return;
    }
    var overview = data.overview || {};
    area.innerHTML = '<div class="learning-overview">' +
      metric("Sinf aniqligi", overview.class_accuracy == null ? "—" : overview.class_accuracy + "%") +
      metric("O'rtacha mastery", overview.class_mastery == null ? "—" : overview.class_mastery + "%") +
      metric("Yordam kerak", overview.students_needing_support || 0) +
      metric("Yaxshilanmoqda", overview.students_improving || 0) +
      metric("Regression", overview.students_regressed || 0) +
      metric("Kechikkan takrorlash", overview.overdue_reviews || 0) +
      metric("Dalilli profil", overview.students_with_evidence || 0) +
      metric("Top mavzular", (data.weak_topics || []).length) +
      '</div><section class="learning-section"><h3>Zaifliklar heatmap’i</h3>' +
      renderHeatmap(data.heatmap) +
      '</section><section class="learning-section"><h3>Guruh darsi tavsiyalari</h3>' +
      renderRecommendations(data.group_recommendations || []) + "</section>";
  }

  function reportLine(label, value) {
    return "<p><strong>" + safe(label) + ":</strong> " + safe(value == null ? "—" : value) + "</p>";
  }

  function buildAiSummary(student) {
    var weakness = student.highest_priority_weakness;
    if (!weakness) return "Yetarli dalil asosida faol zaiflik topilmadi. Yangi savollar orqali kuzatuvni davom ettiring.";
    var action = student.findings && student.findings[0] && student.findings[0].recommended_action;
    return weakness.taxonomy_name + " bo'yicha " + weakness.state.toLowerCase() +
      " holati aniqlandi. Mastery " + Math.round(weakness.mastery) + "%, ishonch " +
      Math.round(weakness.confidence) + "%. " + (action ? "Tavsiya: " + action + "." : "Qisqa dars va kechiktirilgan retest tavsiya etiladi.");
  }

  function renderFindings(findings) {
    if (!findings || !findings.length) return "Faol xato patterni topilmadi.";
    return findings.slice(0, 5).map(function finding(item) {
      var classification = item.classification ? " · " + item.classification : "";
      return safe(item.taxonomy_name + classification + " · " + item.occurrences + " marta · ishonch " + item.confidence + "%");
    }).join("<br>");
  }

  function openStudentLearningReport(studentId) {
    var data = global.teacherAnalyticsData;
    var student = data && (data.students || []).find(function find(item) {
      return Number(item.student_id) === Number(studentId);
    });
    if (!student) {
      if (typeof global.showToast === "function") global.showToast("Bu o'quvchi uchun diagnostik profil hali tayyor emas");
      return;
    }
    var weakness = student.highest_priority_weakness;
    var strongest = student.strongest_skill;
    var lesson = student.lesson || {};
    var modal = document.getElementById("studentReportModal");
    modal.innerHTML = '<article class="student-report"><header class="student-report-head"><div><h2>' +
      safe(student.name) + '</h2><div class="stat-sub">Individual o\'quv diagnostikasi</div></div>' +
      '<button class="act-ic" onclick="closeStudentLearningReport()" aria-label="Yopish">×</button></header>' +
      '<div class="student-report-grid">' +
      '<section class="student-report-card"><h4>Asosiy ko\'rsatkichlar</h4>' +
      reportLine("Kuzatilgan ko'nikmalar", student.profiles.length) +
      reportLine("Yordam kerak", student.needs_support ? "Ha" : "Yo'q") +
      reportLine("Regression", student.regressed ? "Aniqlandi" : "Aniqlanmadi") +
      reportLine("Kechikkan takrorlash", student.overdue_reviews) + "</section>" +
      '<section class="student-report-card"><h4>Skill holati</h4>' +
      reportLine("Asosiy zaiflik", weakness && weakness.taxonomy_name) +
      reportLine("Mastery / confidence", weakness ? Math.round(weakness.mastery) + "% / " + Math.round(weakness.confidence) + "%" : "—") +
      reportLine("Kuchli ko'nikma", strongest && strongest.taxonomy_name) +
      reportLine("Retention", weakness ? Math.round(weakness.retention) + "%" : "—") + "</section>" +
      '<section class="student-report-card"><h4>Xato dalillari va distractor patternlari</h4><p>' +
      renderFindings(student.findings) + "</p></section>" +
      '<section class="student-report-card"><h4>Dars va retest</h4>' +
      reportLine("Faol darslar", lesson.active || 0) +
      reportLine("Tugallangan darslar", lesson.completed || 0) +
      reportLine("O'rtacha progress", Math.round(lesson.progress || 0) + "%") +
      reportLine("Retest kutilmoqda", lesson.retest_pending || 0) + "</section>" +
      '<section class="student-report-card" style="grid-column:1/-1"><h4>Pedagogik xulosa</h4><p>' +
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
