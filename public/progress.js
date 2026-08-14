(function () {
  "use strict";

  const storedUser = localStorage.getItem("user");
  if (!storedUser) {
    window.location.href = "/index.html";
    return;
  }
  const user = JSON.parse(storedUser);
  if (!user.id) {
    window.location.href = "/index.html";
    return;
  }

  renderSidebar("progress");
  renderTopbar();
  if (window.lucide) window.lucide.createIcons();

  const statusLine = document.getElementById("pageStatus");
  const periodButtons = Array.from(document.querySelectorAll(".period-btn"));
  const periodCache = new Map();
  const lessonDialog = document.getElementById("lessonDialog");
  let activeLessonId = null;
  let currentPeriodData = null;
  let storedLessons = [];
  const lessonPreparationKeys = new Set();

  function progressT(key, params) {
    return window.IlmLigaI18n ? window.IlmLigaI18n.t(key, params) : key;
  }

  function progressLocale() {
    const language = window.IlmLigaI18n ? window.IlmLigaI18n.getLanguage() : "uz";
    return { uz: "uz-UZ", en: "en-US", ru: "ru-RU" }[language] || "uz-UZ";
  }

  window.progressT = progressT;
  window.progressLocale = progressLocale;

  function numberOf(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function setStatus(message, error) {
    statusLine.classList.toggle("show", Boolean(message));
    statusLine.classList.toggle("error", Boolean(error));
    statusLine.innerHTML = "";
    if (!message) return;
    if (!error) {
      const spinner = document.createElement("span");
      spinner.className = "spinner";
      statusLine.appendChild(spinner);
    }
    const text = document.createElement("span");
    text.textContent = message;
    statusLine.appendChild(text);
  }

  async function requestJson(url, options) {
    const response = await authFetch(url, options);
    let data = {};
    try { data = await response.json(); } catch (error) {}
    if (!response.ok) {
      const requestError = new Error(data.error || progressT("progress.errorLoadAnalysis"));
      requestError.status = response.status;
      throw requestError;
    }
    return data;
  }

  function clearElement(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function makeIcon(name) {
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", name);
    return icon;
  }

  function renderEmpty(container, message) {
    clearElement(container);
    const empty = document.createElement("div");
    empty.className = "empty-copy";
    empty.textContent = message;
    container.appendChild(empty);
  }

  function clearPeriodCache() {
    periodCache.clear();
  }

  function appendFlowStat(container, value, label) {
    const item = document.createElement("div");
    item.className = "flow-stat";
    const number = document.createElement("strong");
    number.textContent = value;
    const copy = document.createElement("span");
    copy.textContent = label;
    item.append(number, copy);
    container.appendChild(item);
  }

  function compatibleMistakeTopics(diagnostics) {
    if (Array.isArray(diagnostics.mistake_topics)) return diagnostics.mistake_topics;
    return (Array.isArray(diagnostics.priority_topics) ? diagnostics.priority_topics : []).map(function (topic) {
      return {
        topic: topic.topic, attempts: topic.attempts, errors: topic.errors, accuracy: topic.accuracy,
        rules: [{ rule: topic.topic, attempts: topic.attempts, errors: topic.errors,
          accuracy: topic.accuracy, evidence: topic.evidence || [] }],
      };
    });
  }

  function lessonForEvidence(evidence) {
    return storedLessons.find(function (lesson) {
      return Number(lesson.source_answer_event_id) === Number(evidence && evidence.answer_event_id);
    });
  }

  function lessonPreparationKey(rule,evidence) {
    const taxonomyId = Number(rule && rule.taxonomy_id);
    const answerEventId = Number(evidence && evidence.answer_event_id);
    return taxonomyId > 0 && answerEventId > 0 ? taxonomyId + ":" + answerEventId : "";
  }

  function errorAction(rule, evidence) {
    const button = document.createElement("button");
    button.className = "btn primary rule-action";
    button.type = "button";
    const lesson = lessonForEvidence(evidence);
    const preparationKey = lessonPreparationKey(rule,evidence);
    if (!rule.taxonomy_id || !evidence || !evidence.answer_event_id) {
      button.disabled = true;
      button.textContent = progressT("progress.detectingError");
    } else if (lessonPreparationKeys.has(preparationKey)) {
      button.disabled = true;
      button.setAttribute("aria-busy","true");
      button.textContent = progressT("progress.preparing");
    } else if (lesson) {
      button.textContent = lesson.status === "COMPLETED" ? progressT("progress.viewLesson") : progressT("progress.startLesson");
      button.addEventListener("click", function () { openStoredLesson(lesson.id, lesson.status); });
    } else {
      button.textContent = progressT("progress.prepareErrorLesson");
      button.addEventListener("click", function () { prepareErrorLesson(rule, evidence, button); });
    }
    return button;
  }

  function diagnosisForRule(rule) {
    const errors = numberOf(rule && rule.errors);
    const attempts = numberOf(rule && rule.attempts);
    const state = String(rule && (rule.evidence_state || rule.diagnosis_state) || "").toUpperCase();
    if (state === "REGRESSED") return { key: "regressed", label: progressT("progress.knowledgeDecay") };
    if (state === "CONFIRMED" || errors >= 3) return { key: "confirmed", label: progressT("progress.confirmedGap") };
    if (state === "LIKELY" || errors >= 2) return { key: "likely", label: progressT("progress.likelyGap") };
    return { key: "possible", label: progressT("progress.possibleGap"), attempts: attempts };
  }

  function renderRuleRow(rule) {
    const row = document.createElement("article");
    row.className = "rule-row";
    const copy = document.createElement("div");
    const name = document.createElement("h3");
    name.className = "rule-name";
    name.textContent = rule.rule || progressT("progress.unknownRule");
    const meta = document.createElement("div");
    meta.className = "rule-meta";
    meta.append(
      document.createTextNode(progressT("progress.errorCount", { count: numberOf(rule.errors) })),
      document.createTextNode(progressT("progress.attemptCount", { count: numberOf(rule.attempts) })),
      document.createTextNode(progressT("progress.accuracyPercent", { count: numberOf(rule.accuracy) }))
    );
    const diagnosis = diagnosisForRule(rule);
    const diagnosisRow = document.createElement("div");
    diagnosisRow.className = "rule-diagnosis";
    const diagnosisBadge = document.createElement("span");
    diagnosisBadge.className = "diagnosis-badge " + diagnosis.key;
    diagnosisBadge.textContent = diagnosis.label;
    const diagnosisText = document.createElement("span");
    diagnosisText.textContent = progressT("progress.diagnosisEvidence", {
      errors: numberOf(rule.errors), attempts: numberOf(rule.attempts), accuracy: numberOf(rule.accuracy),
    });
    diagnosisRow.append(diagnosisBadge, diagnosisText);
    copy.append(name, meta, diagnosisRow);
    const evidenceList = document.createElement("div");
    evidenceList.className = "rule-error-list";
    (Array.isArray(rule.evidence) ? rule.evidence : []).forEach(function (evidence, index) {
      const item = document.createElement("div");
      item.className = "rule-error-item";
      const evidenceCopy = document.createElement("p");
      evidenceCopy.className = "rule-evidence";
      evidenceCopy.textContent = progressT("progress.evidenceLine", {
        index: index + 1,
        question: evidence.question || progressT("progress.wrongQuestionFallback"),
        selected: evidence.selected_answer || "—",
        correct: evidence.correct_answer || "—",
      });
      item.append(evidenceCopy, errorAction(rule,evidence));
      evidenceList.appendChild(item);
    });
    copy.appendChild(evidenceList);
    row.appendChild(copy);
    return row;
  }

  function renderRuleFlow(data) {
    const analysis = data.analysis || {};
    const diagnostics = analysis.learning_diagnostics || {};
    const topics = compatibleMistakeTopics(diagnostics);
    const summary = document.getElementById("flowSummaryStats");
    clearElement(summary);
    appendFlowStat(summary, numberOf(diagnostics.analyzed_answers), progressT("progress.answer"));
    const classified = diagnostics.classified_errors == null
      ? topics.reduce(function (total, topic) { return total + numberOf(topic.errors); }, 0)
      : numberOf(diagnostics.classified_errors);
    appendFlowStat(summary, classified, progressT("progress.exactError"));
    appendFlowStat(summary, topics.length, progressT("progress.topic"));
    const container = document.getElementById("ruleTopicList");
    if (!topics.length) {
      renderEmpty(container, progressT("progress.noRuleErrors"));
      return;
    }
    clearElement(container);
    topics.forEach(function (topic) {
      const card = document.createElement("article");
      card.className = "card rule-topic";
      const head = document.createElement("div");
      head.className = "rule-topic-head";
      const titleWrap = document.createElement("div");
      const title = document.createElement("h2");
      title.className = "rule-topic-title";
      title.textContent = topic.topic || progressT("progress.unknownTopic");
      const meta = document.createElement("p");
      meta.className = "rule-topic-meta";
      meta.textContent = progressT("progress.topicMeta", { attempts: numberOf(topic.attempts), accuracy: numberOf(topic.accuracy) });
      titleWrap.append(title, meta);
      const count = document.createElement("span");
      count.className = "rule-count";
      count.textContent = progressT("progress.errorCount", { count: numberOf(topic.errors) });
      head.append(titleWrap, count);
      const rules = document.createElement("div");
      rules.className = "rule-list";
      (Array.isArray(topic.rules) ? topic.rules : []).forEach(function (rule) { rules.appendChild(renderRuleRow(rule)); });
      card.append(head, rules);
      container.appendChild(card);
    });
    if (window.lucide) window.lucide.createIcons();
  }

  async function waitForStoredLesson(evidence, attempts, intervalMs) {
    const maximumAttempts = Number.isInteger(attempts) ? attempts : 6;
    const delay = Number.isInteger(intervalMs) ? intervalMs : 1500;
    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      storedLessons = await loadStoredLessons(false);
      const lesson = lessonForEvidence(evidence);
      if (lesson) return lesson;
      if (attempt < maximumAttempts - 1) {
        await new Promise(function (resolve) { setTimeout(resolve, delay); });
      }
    }
    return null;
  }

  async function prepareErrorLesson(rule, evidence, button) {
    const key = lessonPreparationKey(rule,evidence);
    if (!key || lessonPreparationKeys.has(key)) return;
    lessonPreparationKeys.add(key);
    button.disabled = true;
    button.setAttribute("aria-busy","true");
    button.textContent = progressT("progress.preparing");
    setStatus(progressT("progress.preparingSelectedLesson"), false);
    try {
      const result = await requestJson("/learning/remediation/lessons/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxonomy_id: rule.taxonomy_id, answer_event_id: evidence.answer_event_id }),
      });
      storedLessons = await loadStoredLessons(true);
      let lesson = lessonForEvidence(evidence);
      if (!lesson && numberOf(result.pending_count) > 0) {
        setStatus(progressT("progress.lessonPendingOtherRequest"), false);
        lesson = await waitForStoredLesson(evidence);
        if (lesson) renderStoredLessons(storedLessons);
      }
      if (lesson) setStatus("", false);
      else if (numberOf(result.pending_count) > 0) {
        setStatus(progressT("progress.lessonStillPreparing"), false);
      } else if (numberOf(result.review_required_count) > 0) {
        setStatus(progressT("progress.lessonReviewRequired"), true);
      } else if (numberOf(result.target_count) === 0) {
        setStatus(progressT("progress.noDiagnosticEvidence"), true);
      } else {
        setStatus(progressT("progress.lessonPrepareFailedRetry"), true);
      }
    } catch (error) {
      setStatus(error.message || progressT("progress.lessonPrepareFailed"), true);
    } finally {
      lessonPreparationKeys.delete(key);
      if (currentPeriodData) renderRuleFlow(currentPeriodData);
      if (button.isConnected) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = lessonForEvidence(evidence) ? progressT("progress.startLesson") : progressT("progress.retry");
      }
    }
  }

  function renderMetrics(data) {
    const analysis = data.analysis || {};
    const performance = analysis.performance || {};
    const diagnostics = analysis.learning_diagnostics || {};
    const priority = Array.isArray(diagnostics.priority_topics) ? diagnostics.priority_topics : [];
    const errors = numberOf(performance.wrong_count) + numberOf(performance.timeout_count);
    document.getElementById("metricAccuracy").textContent = numberOf(performance.accuracy) + "%";
    document.getElementById("metricAccuracyFoot").textContent = progressT("progress.correctAnswersCount", { count: numberOf(performance.correct_count) });
    document.getElementById("metricAnswers").textContent = numberOf(diagnostics.analyzed_answers);
    const periodLabels = {
      today: progressT("progress.periodResultsToday"),
      "7d": progressT("progress.periodResults7d"),
      "30d": progressT("progress.periodResults30d"),
    };
    document.getElementById("metricAnswersFoot").textContent = periodLabels[data.period] || periodLabels["7d"];
    document.getElementById("metricErrors").textContent = errors;
    document.getElementById("metricErrorsFoot").textContent = progressT("progress.unansweredCount", { count: numberOf(performance.timeout_count) });
    document.getElementById("metricTopics").textContent = priority.length;
    document.getElementById("metricTopicsFoot").textContent = priority.length ? priority[0].topic : progressT("progress.noRepeatedError");
  }

  function appendInsight(container, title, items, kind, iconName) {
    const box = document.createElement("section");
    box.className = "insight-box " + kind;
    const heading = document.createElement("h4");
    heading.append(makeIcon(iconName), document.createTextNode(title));
    const list = document.createElement("ul");
    list.className = "insight-list";
    const safeItems = Array.isArray(items) && items.length ? items : [kind === "good" ? progressT("progress.notEnoughEvidenceYet") : progressT("progress.noRepeatedWeakness")];
    safeItems.slice(0, 5).forEach(function (item) {
      const row = document.createElement("li");
      row.textContent = String(item);
      list.appendChild(row);
    });
    box.append(heading, list);
    container.appendChild(box);
  }

  function renderReport(data) {
    const report = data.report || {};
    const body = document.getElementById("aiBody");
    clearElement(body);
    const diagnosis = document.createElement("section");
    diagnosis.className = "diagnosis-box";
    const label = document.createElement("span");
    label.className = "diagnosis-label";
    label.append(makeIcon("microscope"), document.createTextNode(progressT("progress.evidenceBasedConclusion")));
    const title = document.createElement("h3");
    title.textContent = report.title || progressT("progress.heading");
    const summary = document.createElement("p");
    summary.textContent = report.summary || progressT("progress.analysisPreparing");
    const detail = document.createElement("p");
    detail.textContent = report.diagnosis || progressT("progress.moreAnswersForDiagnosis");
    diagnosis.append(label, title, summary, detail);
    const columns = document.createElement("div");
    columns.className = "insight-columns";
    appendInsight(columns, progressT("progress.strongKnowledge"), report.strengths, "good", "badge-check");
    appendInsight(columns, progressT("progress.needsAttention"), report.weaknesses, "focus", "focus");
    const motivation = document.createElement("div");
    motivation.className = "ai-motivation";
    motivation.textContent = report.motivation || progressT("progress.motivationFallback");
    body.append(diagnosis, columns, motivation);
    document.getElementById("aiConfidence").textContent = progressT("progress.confidence", { level: data.confidence || report.confidence || "low" });
  }

  function renderTopics(data) {
    const diagnostics = (data.analysis && data.analysis.learning_diagnostics) || {};
    const topics = Array.isArray(diagnostics.priority_topics) ? diagnostics.priority_topics : [];
    const container = document.getElementById("topicGrid");
    document.getElementById("topicCountBadge").textContent = progressT("progress.topicCount", { count: topics.length });
    if (!topics.length) {
      renderEmpty(container, progressT("progress.noRepeatedTopic"));
      return;
    }
    clearElement(container);
    topics.forEach(function (topic) {
      const card = document.createElement("article");
      card.className = "topic-card";
      const top = document.createElement("div");
      top.className = "topic-top";
      const name = document.createElement("div");
      name.className = "topic-name";
      name.textContent = topic.topic;
      const risk = document.createElement("span");
      risk.className = "topic-risk";
      risk.textContent = progressT("progress.errorCount", { count: numberOf(topic.errors) });
      top.append(name, risk);
      const stats = document.createElement("div");
      stats.className = "topic-stats";
      stats.textContent = progressT("progress.topicStats", { attempts: numberOf(topic.attempts), accuracy: numberOf(topic.accuracy), confidence: topic.confidence || "low" });
      const bar = document.createElement("div");
      bar.className = "topic-bar";
      const fill = document.createElement("div");
      fill.className = "topic-fill";
      fill.style.width = Math.min(100, numberOf(topic.error_rate)) + "%";
      bar.appendChild(fill);
      const evidenceList = document.createElement("div");
      evidenceList.className = "evidence-list";
      (topic.evidence || []).slice(0, 2).forEach(function (evidence) {
        const row = document.createElement("div");
        row.className = "evidence";
        row.textContent = evidence.question + (evidence.correct_answer ? progressT("progress.correctAnswerSuffix", { answer: evidence.correct_answer }) : "");
        evidenceList.appendChild(row);
      });
      card.append(top, stats, bar, evidenceList);
      container.appendChild(card);
    });
  }

  function lessonTextBlock(title, iconName, text) {
    const block = document.createElement("section");
    block.className = "lesson-block";
    const heading = document.createElement("h4");
    heading.append(makeIcon(iconName), document.createTextNode(title));
    const copy = document.createElement("p");
    copy.textContent = text || progressT("progress.moreEvidenceForExplanation");
    block.append(heading, copy);
    return block;
  }

  function lessonListBlock(title, iconName, items, className, formatter) {
    const block = document.createElement("section");
    block.className = "lesson-block";
    const heading = document.createElement("h4");
    heading.append(makeIcon(iconName), document.createTextNode(title));
    const list = document.createElement("div");
    list.className = className;
    (Array.isArray(items) ? items : []).slice(0, 4).forEach(function (item, index) {
      const row = document.createElement("div");
      row.className = className === "worked-list" ? "worked-example" : "practice-item";
      formatter(row, item || {}, index);
      list.appendChild(row);
    });
    if (!list.childNodes.length) {
      const row = document.createElement("div");
      row.className = className === "worked-list" ? "worked-example" : "practice-item";
      row.textContent = progressT("progress.moreEvidenceForSection");
      list.appendChild(row);
    }
    block.append(heading, list);
    return block;
  }

  function renderLessonLibrary(report) {
    const container = document.getElementById("lessonLibrary");
    const lessons = Array.isArray(report.topic_lessons) ? report.topic_lessons : [];
    document.getElementById("lessonCountBadge").textContent = progressT("progress.lessonCount", { count: lessons.length });
    if (!lessons.length) {
      renderEmpty(container, progressT("progress.needEvidenceForLesson"));
      return;
    }
    clearElement(container);
    lessons.slice(0, 3).forEach(function (lesson, lessonIndex) {
      const card = document.createElement("article");
      card.className = "lesson-card";
      const head = document.createElement("div");
      head.className = "lesson-head";
      const heading = document.createElement("div");
      const topic = document.createElement("h3");
      topic.className = "lesson-topic";
      topic.textContent = lesson.topic || progressT("progress.personalTopic");
      const objective = document.createElement("p");
      objective.className = "lesson-objective";
      objective.textContent = progressT("progress.objective", { text: lesson.objective || progressT("progress.objectiveFallback") });
      heading.append(topic, objective);
      const badge = document.createElement("span");
      badge.className = "badge-pill";
      badge.textContent = progressT("progress.lessonNumber", { number: lessonIndex + 1 });
      head.append(heading, badge);
      const grid = document.createElement("div");
      grid.className = "lesson-grid";
      grid.append(
        lessonTextBlock(progressT("progress.errorPattern"), "scan-search", lesson.misconception),
        lessonTextBlock(progressT("progress.coreRule"), "book-open", lesson.rule),
        lessonListBlock(progressT("progress.workedExamples"), "list-checks", lesson.worked_examples, "worked-list", function (row, item) {
          const strong = document.createElement("strong");
          strong.textContent = item.prompt || progressT("progress.example");
          row.append(strong, document.createTextNode(" — " + (item.answer || progressT("progress.answer")) + ". " + (item.reasoning || "")));
        }),
        lessonListBlock(progressT("progress.activePractice"), "brain-circuit", lesson.practice_sequence, "practice-sequence", function (row, item, index) {
          const strong = document.createElement("strong");
          strong.textContent = item.step || progressT("progress.stepNumber", { number: index + 1 });
          row.append(strong, document.createTextNode(" — " + (item.task || progressT("progress.independentPractice"))));
        })
      );
      const footer = document.createElement("div");
      footer.className = "lesson-footer";
      const chips = document.createElement("div");
      chips.className = "review-chips";
      (Array.isArray(lesson.review_schedule) ? lesson.review_schedule : []).slice(0, 4).forEach(function (review) {
        const chip = document.createElement("span");
        chip.className = "review-chip";
        chip.textContent = String(review);
        chips.appendChild(chip);
      });
      const mastery = document.createElement("div");
      mastery.className = "mastery";
      mastery.textContent = progressT("progress.masteryCriterion", { text: lesson.mastery_criterion || progressT("progress.masteryFallback") });
      footer.append(chips, mastery);
      card.append(head, grid, footer);
      container.appendChild(card);
    });
  }

  function remediationStatus(status) {
    const labels = { ASSIGNED: progressT("progress.readyToStart"), STARTED: progressT("progress.inProgress"), COMPLETED: progressT("progress.lessonCompleted") };
    return labels[status] || status || progressT("progress.ready");
  }

  function renderStoredLessons(lessons) {
    const container = document.getElementById("lessonLibrary");
    document.getElementById("lessonCountBadge").textContent = progressT("progress.lessonCount", { count: lessons.length });
    clearElement(container);
    lessons.forEach(function (stored) {
      const content = stored.lesson_content || {};
      const card = document.createElement("article");
      card.className = "lesson-card";
      const head = document.createElement("div");
      head.className = "lesson-head";
      const titleWrap = document.createElement("div");
      const title = document.createElement("h3");
      title.className = "lesson-topic";
      title.textContent = content.lesson_title || stored.target_skill_name || progressT("progress.personalLesson");
      const objective = document.createElement("p");
      objective.className = "lesson-objective";
      objective.textContent = progressT("progress.objective", { text: content.learning_objective || progressT("progress.reinforceSkill") });
      titleWrap.append(title, objective);
      const sourceError = content.source_error || {};
      if (sourceError.question) {
        const exactError = document.createElement("p");
        exactError.className = "lesson-objective";
        exactError.textContent = progressT("progress.exactErrorLine", {
          question: sourceError.question,
          selected: sourceError.selected_answer || "—",
          correct: sourceError.correct_answer || "—",
        });
        titleWrap.appendChild(exactError);
      }
      const badge = document.createElement("span");
      badge.className = "badge-pill";
      badge.textContent = remediationStatus(stored.status);
      head.append(titleWrap, badge);
      const summary = lessonTextBlock(progressT("progress.evidenceBasedDirection"), "scan-search",
        content.diagnostic_summary && content.diagnostic_summary.student_message);
      const rule = lessonTextBlock(progressT("progress.shortRule"), "book-open",
        content.micro_explanation && content.micro_explanation.rule);
      const grid = document.createElement("div");
      grid.className = "lesson-grid";
      grid.append(summary, rule);
      const actions = document.createElement("div");
      actions.className = "lesson-actions";
      const progress = document.createElement("div");
      progress.className = "lesson-progress";
      const fill = document.createElement("span");
      fill.style.width = Math.max(0, Math.min(100, numberOf(stored.progress_percent))) + "%";
      progress.appendChild(fill);
      const state = document.createElement("span");
      state.className = "lesson-status";
      state.textContent = progressT("progress.exerciseProgress", { answered: numberOf(stored.answered_count), total: numberOf(stored.exercise_count) });
      const button = document.createElement("button");
      button.className = "btn primary";
      button.type = "button";
      button.textContent = stored.status === "ASSIGNED" ? progressT("progress.startLesson") : stored.status === "COMPLETED" ? progressT("progress.review") : progressT("progress.continue");
      button.addEventListener("click", function () { openStoredLesson(stored.id, stored.status); });
      actions.append(progress, state, button);
      card.append(head, grid, actions);
      container.appendChild(card);
    });
    if (window.lucide) window.lucide.createIcons();
  }

  async function loadStoredLessons(shouldRender) {
    const data = await requestJson("/learning/remediation/lessons", { method: "GET" });
    const lessons = Array.isArray(data.lessons) ? data.lessons : [];
    if (shouldRender !== false) {
      if (lessons.length) renderStoredLessons(lessons);
      else renderEmpty(document.getElementById("lessonLibrary"), progressT("progress.noLessonsYet"));
    }
    return lessons;
  }

  function renderLessonExamples(content) {
    const container = document.getElementById("lessonDialogExamples");
    clearElement(container);
    const micro = content.micro_explanation || {};
    const examples = Array.isArray(micro.examples) && micro.examples.length
      ? micro.examples : (Array.isArray(content.worked_examples) ? content.worked_examples : []);
    examples.slice(0, 10).forEach(function (example, index) {
      const card = document.createElement("article");
      card.className = "lesson-example";
      const sentence = document.createElement("strong");
      sentence.textContent = (index + 1) + ". " + (example.sentence || example.prompt || progressT("progress.example"));
      const explanation = document.createElement("p");
      explanation.textContent = example.rule_application || example.reasoning || example.explanation || progressT("progress.ruleAppliedHere");
      card.append(sentence, explanation);
      container.appendChild(card);
    });
    if (!container.childNodes.length) renderEmpty(container, progressT("progress.noLegacyExamples"));
    document.getElementById("lessonExampleCount").textContent = Math.min(10, examples.length) + "/10";
  }

  function renderLessonExercises(lesson) {
    const container = document.getElementById("lessonDialogExercises");
    clearElement(container);
    (lesson.exercises || []).forEach(function (exercise, index) {
      const card = document.createElement("article");
      card.className = "lesson-exercise";
      const phase = document.createElement("span");
      phase.className = "exercise-phase";
      const phaseKeys = {
        guided_practice: "guidedPractice", independent_practice: "independentPracticePhase",
        error_correction: "errorCorrection", transfer_practice: "transferPractice", final_check: "finalCheck",
      };
      phase.textContent = progressT("progress." + (phaseKeys[exercise.section] || "focusedPractice"));
      const heading = document.createElement("h4");
      heading.textContent = (index + 1) + ". " + exercise.prompt;
      const options = document.createElement("div");
      options.className = "lesson-options";
      Object.keys(exercise.options || {}).forEach(function (code) {
        const button = document.createElement("button");
        button.className = "btn lesson-option";
        button.type = "button";
        button.textContent = code + ". " + exercise.options[code];
        if (exercise.selected_option) {
          button.disabled = lesson.status === "COMPLETED";
          if (code === exercise.correct_option) button.classList.add("correct");
          else if (code === exercise.selected_option) button.classList.add("wrong");
        }
        if (lesson.status !== "COMPLETED") {
          button.addEventListener("click", function () { answerStoredExercise(exercise.id, code); });
        }
        options.appendChild(button);
      });
      card.append(phase, heading, options);
      if (exercise.explanation && exercise.selected_option) {
        const feedback = document.createElement("p");
        feedback.className = "lesson-feedback";
        feedback.textContent = (exercise.is_correct ? progressT("progress.correctFeedback") : progressT("progress.correctOptionFeedback", { option: exercise.correct_option })) + exercise.explanation;
        card.appendChild(feedback);
      }
      container.appendChild(card);
    });
  }

  function renderLessonPath(content, lesson) {
    const container = document.getElementById("lessonDialogPath");
    clearElement(container);
    const examples = content.micro_explanation && Array.isArray(content.micro_explanation.examples)
      ? content.micro_explanation.examples.length : 0;
    const exercises = Array.isArray(lesson.exercises) ? lesson.exercises.length : 0;
    const mastery = content.mastery_criteria || {};
    const required = numberOf(mastery.required_correct) || 8;
    const total = numberOf(mastery.total_questions) || exercises || 10;
    [
      ["diagnoseStep", "diagnoseStepText"], ["ruleStep", "ruleStepText"],
      ["examplesStep", "examplesStepText", { count: examples }],
      ["practiceStep", "practiceStepText", { count: exercises }],
      ["masteryStep", "masteryStepText", { required: required, total: total }],
    ].forEach(function (step, index) {
      const card = document.createElement("article");
      card.className = "lesson-path-step";
      const number = document.createElement("span");
      number.textContent = progressT("progress.lessonPathStep", { number: index + 1 });
      const title = document.createElement("strong");
      title.textContent = progressT("progress." + step[1], step[2] || {});
      card.append(number, title);
      container.appendChild(card);
    });
    const reviewPlan = Array.isArray(content.review_plan) ? content.review_plan : [];
    const days = reviewPlan.map(function (item) { return numberOf(item.delay_days); }).filter(function (day) { return day > 0; });
    const review = document.createElement("div");
    review.className = "lesson-path-review";
    const reviewTitle = document.createElement("strong");
    reviewTitle.textContent = progressT("progress.spacedReviewPlan");
    const reviewText = document.createElement("span");
    reviewText.textContent = progressT("progress.reviewDays", { days: days.length ? days.join(", ") : "1, 3, 7, 21" });
    review.append(reviewTitle, reviewText);
    container.appendChild(review);
  }

  async function fetchLesson(lessonId) {
    const data = await requestJson("/learning/remediation/lessons/" + lessonId, { method: "GET" });
    const lesson = data.lesson;
    const content = lesson.lesson_content || {};
    const sourceError = content.source_error || {};
    document.getElementById("lessonDialogTitle").textContent = content.lesson_title || progressT("progress.personalLesson");
    document.getElementById("lessonDialogObjective").textContent = content.learning_objective || "";
    const sourceErrorBox = document.getElementById("lessonDialogSourceError");
    const hasSourceError = Boolean(sourceError.question || sourceError.selected_answer || sourceError.correct_answer);
    sourceErrorBox.hidden = !hasSourceError;
    document.getElementById("lessonDialogQuestion").textContent = sourceError.question || "—";
    document.getElementById("lessonDialogSelectedAnswer").textContent = sourceError.selected_answer || "—";
    document.getElementById("lessonDialogCorrectAnswer").textContent = sourceError.correct_answer || "—";
    document.querySelector("#lessonDialogDiagnosis span").textContent = sourceError.explanation
      || content.diagnostic_summary && content.diagnostic_summary.student_message
      || progressT("progress.diagnosisFallback");
    renderLessonPath(content, lesson);
    document.getElementById("lessonDialogRule").textContent = content.micro_explanation && content.micro_explanation.rule || progressT("progress.noRuleExplanation");
    renderLessonExamples(content);
    renderLessonExercises(lesson);
    const completionStatus = document.getElementById("lessonCompletionStatus");
    completionStatus.textContent = "";
    completionStatus.classList.remove("error","success");
    document.getElementById("lessonTestCount").textContent = (lesson.exercises || []).length + "/10";
    const complete = document.getElementById("lessonCompleteButton");
    complete.disabled = lesson.status === "COMPLETED" || (lesson.exercises || []).some(function (item) { return !item.selected_option; });
    complete.textContent = lesson.status === "COMPLETED" ? progressT("progress.lessonCompleted") : progressT("progress.completeLesson");
    if (window.lucide) window.lucide.createIcons();
  }

  async function openStoredLesson(lessonId, status) {
    activeLessonId = lessonId;
    if (status === "ASSIGNED") await requestJson("/learning/remediation/lessons/" + lessonId + "/start", { method: "POST" });
    await fetchLesson(lessonId);
    lessonDialog.classList.add("open");
  }

  async function answerStoredExercise(exerciseId, selectedOption) {
    await requestJson("/learning/remediation/lessons/" + activeLessonId + "/exercises/" + exerciseId + "/answer", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selected_option: selectedOption }),
    });
    await fetchLesson(activeLessonId);
    storedLessons = await loadStoredLessons(true);
    if (currentPeriodData) renderRuleFlow(currentPeriodData);
  }

  document.getElementById("lessonDialogClose").addEventListener("click", function () { lessonDialog.classList.remove("open"); });
  lessonDialog.addEventListener("click", function (event) { if (event.target === lessonDialog) lessonDialog.classList.remove("open"); });
  document.getElementById("lessonCompleteButton").addEventListener("click", async function () {
    if (!activeLessonId) return;
    const button = document.getElementById("lessonCompleteButton");
    const completionStatus = document.getElementById("lessonCompletionStatus");
    button.disabled = true;
    completionStatus.textContent = progressT("progress.checkingResult");
    completionStatus.classList.remove("error","success");
    try {
      await requestJson("/learning/remediation/lessons/" + activeLessonId + "/complete", { method: "POST" });
      await fetchLesson(activeLessonId);
      completionStatus.textContent = progressT("progress.lessonCompletedSuccess");
      completionStatus.classList.add("success");
      storedLessons = await loadStoredLessons(true);
      if (currentPeriodData) renderRuleFlow(currentPeriodData);
      periodCache.clear();
    } catch (error) {
      button.disabled = false;
      completionStatus.textContent = error.message || progressT("progress.checkResultFailed");
      completionStatus.classList.add("error");
    }
  });

  function renderLearningPlan(report) {
    const container = document.getElementById("learningPlan");
    const plan = Array.isArray(report.learning_plan) ? report.learning_plan : [];
    if (!plan.length) {
      renderEmpty(container, progressT("progress.noPlanEvidence"));
      return;
    }
    clearElement(container);
    plan.forEach(function (item, index) {
      const step = document.createElement("article");
      step.className = "plan-step";
      const number = document.createElement("div");
      number.className = "plan-number";
      number.textContent = index + 1;
      const content = document.createElement("div");
      const head = document.createElement("div");
      head.className = "plan-head";
      const title = document.createElement("div");
      title.className = "plan-title";
      title.textContent = (item.stage || progressT("progress.stage")) + " · " + (item.focus || progressT("progress.topic"));
      const method = document.createElement("span");
      method.className = "method-tag";
      method.textContent = item.method || progressT("progress.practicalExercise");
      head.append(title, method);
      const task = document.createElement("div");
      task.className = "plan-task";
      task.textContent = item.task || progressT("progress.practiceTopicAgain");
      const success = document.createElement("div");
      success.className = "success";
      success.textContent = progressT("progress.successCriterion", { text: item.success_criterion || progressT("progress.stableCorrectAnswers") });
      content.append(head, task, success);
      step.append(number, content);
      container.appendChild(step);
    });
  }

  function renderSidePanels(data) {
    const analysis = data.analysis || {};
    const quality = analysis.data_quality || data.data_quality || {};
    const activity = analysis.activity || {};
    const confidence = quality.confidence || data.confidence || "low";
    const qualityPercent = confidence === "high" ? 100 : confidence === "medium" ? 66 : 33;
    document.getElementById("qualityConfidence").textContent = confidence;
    document.getElementById("qualityFill").style.width = qualityPercent + "%";
    document.getElementById("qualityAnswers").textContent = numberOf(quality.total_answers);
    document.getElementById("qualityDays").textContent = numberOf(activity.active_days);
    document.getElementById("qualityAssignments").textContent = numberOf(activity.assignments_completed);
    document.getElementById("qualityExams").textContent = numberOf(activity.exams_taken);
    document.getElementById("qualityNote").textContent = quality.enough_data ? progressT("progress.enoughEvidence", { confidence }) : progressT("progress.evidenceRequirement");
    const period = analysis.period || {};
    const format = function (value) { return value ? new Date(value).toLocaleDateString(progressLocale(), { day: "numeric", month: "short" }) : "—"; };
    document.getElementById("periodDates").textContent = format(period.start) + " — " + format(period.end);
    renderMethods(data.report || {});
    renderNextSteps(data.report || {});
  }

  function renderMethods(report) {
    const container = document.getElementById("studyMethods");
    const methods = Array.isArray(report.study_principles) ? report.study_principles : [];
    if (!methods.length) {
      renderEmpty(container, progressT("progress.methodsAppearWithAnalysis"));
      return;
    }
    clearElement(container);
    methods.slice(0, 4).forEach(function (item) {
      const row = document.createElement("div");
      row.className = "method-item";
      row.append(makeIcon("brain"), document.createTextNode(String(item)));
      container.appendChild(row);
    });
  }

  function renderNextSteps(report) {
    const container = document.getElementById("nextSteps");
    const steps = Array.isArray(report.next_steps) ? report.next_steps : [];
    if (!steps.length) {
      renderEmpty(container, progressT("progress.moreDataForNextSteps"));
      return;
    }
    clearElement(container);
    steps.slice(0, 4).forEach(function (item) {
      const row = document.createElement("div");
      row.className = "method-item";
      row.append(makeIcon("check-circle-2"), document.createTextNode(String(item)));
      container.appendChild(row);
    });
  }














  function renderPremiumLock() {
    const body = document.getElementById("aiBody");
    body.innerHTML = '<div class="ai-empty"><div><div class="ai-empty-icon"><i data-lucide="crown"></i></div><h3>'
      + progressT("progress.premiumTitle") + '</h3><p>' + progressT("progress.premiumText")
      + '</p><button class="btn primary" id="progressPremiumButton" type="button"><i data-lucide="crown"></i> '
      + progressT("progress.getPremium") + '</button></div></div>';
    document.getElementById("progressPremiumButton").addEventListener("click", function () { window.openPaymentModal("student_premium"); });
    renderEmpty(document.getElementById("topicGrid"), progressT("progress.premiumTopicsLocked"));
    renderEmpty(document.getElementById("lessonLibrary"), progressT("progress.premiumLessonsLocked"));
    renderEmpty(document.getElementById("learningPlan"), progressT("progress.premiumPlanLocked"));
    if (window.lucide) window.lucide.createIcons();
  }

  function renderDashboard(data) {
    renderMetrics(data);
    renderReport(data);
    renderTopics(data);
    renderLessonLibrary(data.report || {});
    renderLearningPlan(data.report || {});
    renderSidePanels(data);
    setStatus("", false);
    if (window.lucide) window.lucide.createIcons();
  }

  async function loadPeriod(period) {
    periodButtons.forEach(function (button) {
      button.classList.toggle("active", button.dataset.period === period);
      button.disabled = true;
    });
    const loadingLabels = {
      today: progressT("progress.loadingToday"),
      "7d": progressT("progress.loading7d"),
      "30d": progressT("progress.loading30d"),
    };
    setStatus(progressT("progress.loadingPeriod", { period: loadingLabels[period] || loadingLabels["7d"] }), false);
    try {
      let data = periodCache.get(period);
      if (!data) {
        data = await requestJson("/ai/reports/student/weekly?period=" + period, { method: "POST" });
        periodCache.set(period, data);
      }
      currentPeriodData = data;
      try { storedLessons = await loadStoredLessons(true); }
      catch (lessonError) { storedLessons = []; console.error("Personalized lessons:", lessonError); }
      renderRuleFlow(data);
      setStatus("", false);
    } catch (error) {
      if (error.status === 402) {
        setStatus("", false);
        renderEmpty(document.getElementById("ruleTopicList"), progressT("progress.deepDiagnosisPremium"));
      } else setStatus(error.message || progressT("progress.errorLoadAnalysis"), true);
    } finally {
      periodButtons.forEach(function (button) { button.disabled = false; });
    }
  }

  periodButtons.forEach(function (button) {
    button.addEventListener("click", function () { loadPeriod(button.dataset.period); });
  });

  const learningUi = window.createProgressLearningUI({
    requestJson, clearElement, makeIcon, renderEmpty, numberOf, clearPeriodCache,
  });
  window.addEventListener("ilmliga:languagechange", function () {
    if (currentPeriodData) renderRuleFlow(currentPeriodData);
    if (storedLessons.length) renderStoredLessons(storedLessons);
    if (learningUi.rerender) learningUi.rerender();
  });
  learningUi.load();
  loadPeriod("7d");
})();
