(function adminQuestionAnalysisModule(global) {
  "use strict";

  var currentQuestionId = null;
  var requestVersion = 0;
  var reviewQueueOffset = 0;
  var reviewQueueLimit = 20;
  var reviewQueueTotal = 0;
  var reviewQueueFilter = "all";
  var STATUS_LABELS = {
    ANALYSIS_PENDING: "Navbatda",
    ANALYZING: "Tahlil qilinmoqda",
    READY: "Tayyor",
    REVIEW_SUGGESTED: "Ko'rib chiqish tavsiya etiladi",
    REVIEW_REQUIRED: "Admin tekshiruvi shart",
    ANALYSIS_FAILED: "Tahlil xatosi",
    DISABLED: "O'chirilgan",
  };

  function safe(value) {
    if (typeof global.esc === "function") return global.esc(value);
    return String(value == null ? "" : value).replace(/[&<>"']/g, function replace(char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function percent(value) {
    return Math.round(Number(value || 0) * 100) + "%";
  }

  function list(items, emptyText) {
    if (!Array.isArray(items) || !items.length) return '<div class="qa-empty">' + safe(emptyText) + "</div>";
    return '<ul class="qa-list">' + items.map(function item(value) {
      return "<li>" + safe(typeof value === "string" ? value : JSON.stringify(value)) + "</li>";
    }).join("") + "</ul>";
  }

  function summaryItem(label, value, extraClass) {
    return '<div class="qa-summary-item ' + (extraClass || "") + '"><span>' + safe(label) +
      "</span><strong>" + safe(value == null || value === "" ? "—" : value) + "</strong></div>";
  }

  function renderDistractors(items) {
    if (!Array.isArray(items) || !items.length) return '<div class="qa-empty">Distractor tahlili mavjud emas.</div>';
    return '<div class="qa-distractors">' + items.map(function distractor(item) {
      return '<article class="qa-distractor"><div class="qa-option">' + safe(item.option_code) +
        '</div><div><strong>' + safe(item.error_code || "Aniqlanmagan pattern") + '</strong><p>' +
        safe(item.likely_reason || "Sabab aniqlanmagan") + '</p><span>Ishonch: ' + percent(item.confidence) +
        " · Manba: " + safe(item.source || "—") + "</span></div></article>";
    }).join("") + "</div>";
  }

  function renderPrerequisites(items) {
    if (!Array.isArray(items) || !items.length) return '<div class="qa-empty">Prerequisite ko\'nikma ko\'rsatilmagan.</div>';
    return '<div class="qa-tags">' + items.map(function prerequisite(item) {
      return '<span class="qa-tag">' + safe(item.name) + " · " + safe(item.node_type) + "</span>";
    }).join("") + "</div>";
  }

  function renderOverrides(items) {
    if (!Array.isArray(items) || !items.length) return '<div class="qa-empty">Admin override tarixi yo\'q.</div>';
    return '<div class="qa-history">' + items.map(function override(item) {
      return '<div><strong>' + safe(item.override_author || "Admin") + '</strong><span>' +
        safe(item.reason || "Sabab kiritilmagan") + " · " + safe(item.created_at ? new Date(item.created_at).toLocaleString("uz-UZ") : "—") +
        "</span></div>";
    }).join("") + "</div>";
  }

  function option(value, current) {
    return '<option value="' + value + '"' + (value === current ? " selected" : "") + ">" + value + "</option>";
  }

  function renderAnalysis(analysis) {
    var status = analysis.status || "ANALYSIS_PENDING";
    var rawAnalysis = analysis.raw_analysis || {};
    var signatureCandidate = rawAnalysis.rule_signature_candidate || "—";
    var canonicalSignature = analysis.rule_signature || "—";
    var signatureInput = analysis.rule_signature || rawAnalysis.rule_signature_candidate || "";
    var qualityWarnings = analysis.quality_warnings || [];
    var warningHtml = qualityWarnings.length
      ? '<div class="qa-tags danger">' + qualityWarnings.map(function warning(item) {
        return '<span class="qa-tag">' + safe(item) + "</span>";
      }).join("") + "</div>"
      : '<div class="qa-good">Sifat bo\'yicha jiddiy ogohlantirish yo\'q.</div>';
    var levels = ["A1", "A2", "B1", "B2", "C1", "C2"].map(function level(value) {
      return option(value, analysis.estimated_level);
    }).join("");
    var statuses = ["READY", "REVIEW_SUGGESTED", "REVIEW_REQUIRED", "DISABLED"].map(function analysisStatus(value) {
      return option(value, status);
    }).join("");

    return '<div class="qa-summary">' +
      summaryItem("Taxminiy daraja", analysis.estimated_level + " · " + percent(analysis.level_confidence)) +
      summaryItem("Skill", analysis.main_skill_name) + summaryItem("Topic", analysis.topic_name) +
      summaryItem("Subskill", analysis.subskill_name) + summaryItem("Micro-skill", analysis.micro_skill_name) +
      summaryItem("AI ishonchi", percent(analysis.analysis_confidence)) +
      summaryItem("Sifat holati", STATUS_LABELS[status] || status) +
      summaryItem("Diagnostikaga yaroqli", analysis.diagnostic_eligible ? "Ha" : "Yo'q", analysis.diagnostic_eligible ? "good" : "bad") +
      summaryItem("AI qoida nomzodi", signatureCandidate) +
      summaryItem("Canonical qoida", canonicalSignature) +
      summaryItem("Canonical tekshiruv", analysis.rule_signature_reviewed ? "Admin tasdiqlagan" : "Tasdiqlanmagan", analysis.rule_signature_reviewed ? "good" : "bad") +
      '</div><div class="qa-grid"><section class="qa-section"><h4>Daraja dalillari</h4>' +
      list(analysis.level_evidence, "Daraja dalili mavjud emas.") +
      '</section><section class="qa-section"><h4>Prerequisite ko\'nikmalar</h4>' +
      renderPrerequisites(analysis.prerequisites) +
      '</section><section class="qa-section full"><h4>Sifat va diagnostika ogohlantirishlari</h4>' + warningHtml +
      '</section><section class="qa-section full"><h4>Noto\'g\'ri variantlar tahlili</h4>' +
      renderDistractors(analysis.distractors) +
      '</section><section class="qa-section"><h4>To\'g\'ri javob izohi</h4><p>' +
      safe(analysis.correct_answer_explanation || "Izoh mavjud emas.") + '</p></section>' +
      '<section class="qa-section"><h4>Til materiali</h4><p><strong>Struktura:</strong> ' +
      safe(analysis.grammar_structure || "—") + '</p><p><strong>Lug\'at:</strong> ' +
      safe(Array.isArray(analysis.required_vocabulary) ? analysis.required_vocabulary.join(", ") : analysis.required_vocabulary || "—") +
      '</p></section><section class="qa-section full"><h4>Admin override</h4><div class="qa-override-form">' +
      '<label>Daraja<select id="qaOverrideLevel">' + levels + '</select></label>' +
      '<label>Status<select id="qaOverrideStatus">' + statuses + '</select></label>' +
      '<label>Diagnostika<select id="qaOverrideEligible"><option value="true"' + (analysis.diagnostic_eligible ? " selected" : "") +
      '>Yaroqli</option><option value="false"' + (!analysis.diagnostic_eligible ? " selected" : "") +
      '>Yaroqsiz</option></select></label>' +
      '<label>Canonical amal<select id="qaOverrideSignatureAction"><option value="preserve">O\'zgartirmaslik</option>' +
      '<option value="approve">Tasdiqlash / almashtirish</option><option value="clear">Bekor qilish</option></select></label>' +
      '<label class="wide">Canonical qoida<input id="qaOverrideSignature" maxlength="160" value="' + safe(signatureInput) +
      '" placeholder="grammar.present_continuous.affirmative.plural_are"></label>' +
      '<label class="wide">Sabab<textarea id="qaOverrideReason" rows="2" placeholder="Pedagogik sababni yozing"></textarea></label>' +
      '<button class="qa-save" onclick="saveQuestionAnalysisOverride()">Override saqlash</button></div>' +
      '<h4 class="qa-history-title">Override tarixi</h4>' + renderOverrides(analysis.overrides) +
      "</section></div>";
  }

  function renderPending(body, message) {
    body.innerHTML = '<div class="qa-pending"><div class="qa-spinner"></div><strong>AI tahlil tayyorlanmoqda</strong><p>' +
      safe(message || "Savol navbatga qo'shildi. Tahlil tugagach natija shu oynada ko'rinadi.") + "</p></div>";
  }

  async function loadAnalysis(id, version, retryCount) {
    var body = document.getElementById("questionAnalysisBody");
    try {
      var response = await global.apiGet("/admin/questions/" + id + "/analysis");
      var data = await response.json();
      if (version !== requestVersion || currentQuestionId !== id) return;
      if (!response.ok) {
        if (response.status === 404 && retryCount > 0) {
          renderPending(body, data.error);
          setTimeout(function retry() { loadAnalysis(id, version, retryCount - 1); }, 1200);
          return;
        }
        body.innerHTML = '<div class="empty-state">' + safe(data.error || "Tahlil topilmadi") + "</div>";
        return;
      }
      body.innerHTML = renderAnalysis(data.analysis || {});
      if (typeof global.icons === "function") global.icons();
    } catch (error) {
      if (error.message !== "auth" && version === requestVersion) {
        body.innerHTML = '<div class="empty-state">Server bilan aloqa yo\'q</div>';
      }
    }
  }

  function openQuestionAnalysis(id, options) {
    currentQuestionId = Number(id);
    requestVersion += 1;
    var body = document.getElementById("questionAnalysisBody");
    renderPending(body, options && options.created ? "Savol saqlandi va AI diagnostika navbatiga qo'shildi." : "Tahlil yuklanmoqda.");
    document.getElementById("questionAnalysisModal").classList.add("show");
    loadAnalysis(currentQuestionId, requestVersion, options && options.created ? 6 : 0);
  }

  function closeQuestionAnalysis() {
    currentQuestionId = null;
    requestVersion += 1;
    document.getElementById("questionAnalysisModal").classList.remove("show");
  }

  async function saveQuestionAnalysisOverride() {
    if (!currentQuestionId) return;
    var payload = {
      estimated_level: document.getElementById("qaOverrideLevel").value,
      status: document.getElementById("qaOverrideStatus").value,
      diagnostic_eligible: document.getElementById("qaOverrideEligible").value === "true",
      rule_signature_action: document.getElementById("qaOverrideSignatureAction").value,
      rule_signature: document.getElementById("qaOverrideSignature").value.trim(),
      reason: document.getElementById("qaOverrideReason").value.trim(),
    };
    if (!payload.reason) {
      global.toast("Override sababini kiriting", "error");
      return;
    }
    var response = await global.apiPost("/admin/questions/" + currentQuestionId + "/analysis/review", payload);
    if (!response.ok) {
      var errorBody = await response.json().catch(function invalidJson() { return {}; });
      global.toast(errorBody.error || "Override saqlanmadi", "error");
      return;
    }
    global.toast("Admin override saqlandi", "success");
    loadAnalysis(currentQuestionId, requestVersion, 0);
    global.loadQuestions();
  }

  async function approveQuestionAnalysis() {
    if (!currentQuestionId) return;
    var response = await global.apiPost("/admin/questions/" + currentQuestionId + "/analysis/review", {
      status: "READY", diagnostic_eligible: true, reason: "Admin tomonidan tekshirildi",
    });
    if (!response.ok) return global.toast("Tahlilni tasdiqlab bo'lmadi", "error");
    global.toast("AI tahlil tasdiqlandi", "success");
    loadAnalysis(currentQuestionId, requestVersion, 0);
    global.loadQuestions();
  }

  async function requeueQuestionAnalysis() {
    if (!currentQuestionId) return;
    var response = await global.apiPost("/admin/questions/" + currentQuestionId + "/analysis/requeue", {});
    if (!response.ok) return global.toast("Navbatga qo'shib bo'lmadi", "error");
    global.toast("Qayta tahlil navbatiga qo'shildi", "success");
    renderPending(document.getElementById("questionAnalysisBody"));
    loadAnalysis(currentQuestionId, requestVersion, 6);
  }

  function renderReviewQueueItem(item) {
    var badges = [];
    if (item.rule_signature_quarantined) badges.push('<span class="qa-queue-badge danger">Karantin</span>');
    if (item.status === "REVIEW_REQUIRED") badges.push('<span class="qa-queue-badge danger">REVIEW_REQUIRED</span>');
    if (!item.rule_signature_reviewed) badges.push('<span class="qa-queue-badge warn">Tasdiqlanmagan</span>');
    return '<div class="qa-queue-item"><div><div class="qa-queue-question">#' + Number(item.question_id) + " · " +
      safe(item.question_text || "Savol matni mavjud emas") + '</div><div class="qa-queue-meta">' +
      safe(item.estimated_level || item.cefr_level || "—") + " · " + safe(item.topic_name || item.skill || "—") +
      " · " + safe(item.status || "—") + '</div><div class="qa-queue-signature"><strong>Nomzod:</strong> ' +
      safe(item.rule_signature_candidate || "—") + '<br><strong>Canonical:</strong> ' +
      safe(item.rule_signature || "—") + '</div><div class="qa-queue-badges">' + badges.join("") +
      '</div></div><button class="qa-queue-open" onclick="openQuestionAnalysisFromReviewQueue(' +
      Number(item.question_id) + ')">Tekshirish</button></div>';
  }

  async function loadQuestionAnalysisReviewQueue(offset) {
    reviewQueueOffset = Math.max(Number(offset) || 0, 0);
    var body = document.getElementById("questionAnalysisReviewQueueBody");
    if (!body) return;
    body.innerHTML = '<div class="loading-row">Yuklanmoqda...</div>';
    try {
      var url = "/admin/questions/analysis/review-queue?filter=" + encodeURIComponent(reviewQueueFilter) +
        "&limit=" + reviewQueueLimit + "&offset=" + reviewQueueOffset;
      var response = await global.apiGet(url);
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || "Review navbatini yuklab bo'lmadi");
      reviewQueueTotal = Number(data.total) || 0;
      var items = Array.isArray(data.items) ? data.items : [];
      body.className = "qa-queue-list";
      body.innerHTML = items.length ? items.map(renderReviewQueueItem).join("") :
        '<div class="empty-state">Bu filter bo\'yicha review talab qiladigan savol yo\'q.</div>';
      document.getElementById("qaReviewQueueCount").textContent = reviewQueueTotal + " ta savol";
      var start = reviewQueueTotal ? reviewQueueOffset + 1 : 0;
      var end = Math.min(reviewQueueOffset + items.length, reviewQueueTotal);
      document.getElementById("qaReviewQueuePageInfo").textContent = start + "–" + end + " / " + reviewQueueTotal;
      document.getElementById("qaReviewQueuePrev").disabled = reviewQueueOffset === 0;
      document.getElementById("qaReviewQueueNext").disabled = reviewQueueOffset + reviewQueueLimit >= reviewQueueTotal;
      if (global.icons) global.icons();
    } catch (error) {
      body.className = "";
      body.innerHTML = '<div class="empty-state">' + safe(error.message) + "</div>";
    }
  }

  function openQuestionAnalysisReviewQueue() {
    document.getElementById("questionAnalysisReviewQueueModal").classList.add("show");
    reviewQueueOffset = 0;
    loadQuestionAnalysisReviewQueue(0);
  }

  function closeQuestionAnalysisReviewQueue() {
    document.getElementById("questionAnalysisReviewQueueModal").classList.remove("show");
  }

  function changeQuestionAnalysisReviewQueueFilter(value) {
    reviewQueueFilter = value || "all";
    loadQuestionAnalysisReviewQueue(0);
  }

  function moveQuestionAnalysisReviewQueue(direction) {
    var nextOffset = reviewQueueOffset + Number(direction) * reviewQueueLimit;
    if (nextOffset < 0 || nextOffset >= reviewQueueTotal) return;
    loadQuestionAnalysisReviewQueue(nextOffset);
  }

  function openQuestionAnalysisFromReviewQueue(questionId) {
    closeQuestionAnalysisReviewQueue();
    openQuestionAnalysis(Number(questionId));
  }

  global.openQuestionAnalysis = openQuestionAnalysis;
  global.closeQuestionAnalysis = closeQuestionAnalysis;
  global.saveQuestionAnalysisOverride = saveQuestionAnalysisOverride;
  global.approveQuestionAnalysis = approveQuestionAnalysis;
  global.requeueQuestionAnalysis = requeueQuestionAnalysis;
  global.openQuestionAnalysisReviewQueue = openQuestionAnalysisReviewQueue;
  global.closeQuestionAnalysisReviewQueue = closeQuestionAnalysisReviewQueue;
  global.changeQuestionAnalysisReviewQueueFilter = changeQuestionAnalysisReviewQueueFilter;
  global.moveQuestionAnalysisReviewQueue = moveQuestionAnalysisReviewQueue;
  global.openQuestionAnalysisFromReviewQueue = openQuestionAnalysisFromReviewQueue;
}(window));
