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
      const requestError = new Error(data.error || "Tahlilni olib bo‘lmadi");
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
      button.textContent = "Xato aniqlanmoqda";
    } else if (lessonPreparationKeys.has(preparationKey)) {
      button.disabled = true;
      button.setAttribute("aria-busy","true");
      button.textContent = "Tayyorlanmoqda...";
    } else if (lesson) {
      button.textContent = lesson.status === "COMPLETED" ? "Darsni ko'rish" : "Darsni boshlash";
      button.addEventListener("click", function () { openStoredLesson(lesson.id, lesson.status); });
    } else {
      button.textContent = "Xato uchun dars tayyorlash";
      button.addEventListener("click", function () { prepareErrorLesson(rule, evidence, button); });
    }
    return button;
  }

  function renderRuleRow(rule) {
    const row = document.createElement("article");
    row.className = "rule-row";
    const copy = document.createElement("div");
    const name = document.createElement("h3");
    name.className = "rule-name";
    name.textContent = rule.rule || "Aniqlanmagan qoida";
    const meta = document.createElement("div");
    meta.className = "rule-meta";
    meta.append(
      document.createTextNode(numberOf(rule.errors) + " xato"),
      document.createTextNode(numberOf(rule.attempts) + " urinish"),
      document.createTextNode(numberOf(rule.accuracy) + "% aniqlik")
    );
    copy.append(name, meta);
    const evidenceList = document.createElement("div");
    evidenceList.className = "rule-error-list";
    (Array.isArray(rule.evidence) ? rule.evidence : []).forEach(function (evidence, index) {
      const item = document.createElement("div");
      item.className = "rule-error-item";
      const evidenceCopy = document.createElement("p");
      evidenceCopy.className = "rule-evidence";
      evidenceCopy.textContent = (index + 1) + ". " + (evidence.question || "Xato savol")
        + " — siz: " + (evidence.selected_answer || "—") + "; to'g'ri: " + (evidence.correct_answer || "—");
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
    appendFlowStat(summary, numberOf(diagnostics.analyzed_answers), "Javob");
    const classified = diagnostics.classified_errors == null
      ? topics.reduce(function (total, topic) { return total + numberOf(topic.errors); }, 0)
      : numberOf(diagnostics.classified_errors);
    appendFlowStat(summary, classified, "Aniq xato");
    appendFlowStat(summary, topics.length, "Mavzu");
    const container = document.getElementById("ruleTopicList");
    if (!topics.length) {
      renderEmpty(container, "Tanlangan davrda darslik talab qiladigan aniq qoida xatosi topilmadi.");
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
      title.textContent = topic.topic || "Aniqlanmagan mavzu";
      const meta = document.createElement("p");
      meta.className = "rule-topic-meta";
      meta.textContent = numberOf(topic.attempts) + " urinish · " + numberOf(topic.accuracy) + "% aniqlik";
      titleWrap.append(title, meta);
      const count = document.createElement("span");
      count.className = "rule-count";
      count.textContent = numberOf(topic.errors) + " xato";
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
    button.textContent = "Tayyorlanmoqda...";
    setStatus("Tanlangan xato uchun alohida dars tayyorlanmoqda...", false);
    try {
      const result = await requestJson("/learning/remediation/lessons/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxonomy_id: rule.taxonomy_id, answer_event_id: evidence.answer_event_id }),
      });
      storedLessons = await loadStoredLessons(true);
      let lesson = lessonForEvidence(evidence);
      if (!lesson && numberOf(result.pending_count) > 0) {
        setStatus("Dars boshqa so'rovda tayyorlanmoqda. Natija avtomatik tekshiriladi...", false);
        lesson = await waitForStoredLesson(evidence);
        if (lesson) renderStoredLessons(storedLessons);
      }
      if (lesson) setStatus("", false);
      else if (numberOf(result.pending_count) > 0) {
        setStatus("Dars hali tayyorlanmoqda. Birozdan keyin holatni qayta tekshiring.", false);
      } else if (numberOf(result.review_required_count) > 0) {
        setStatus("Dars xavfsizlik tekshiruvidan o'tmadi va ko'rib chiqishga yuborildi.", true);
      } else if (numberOf(result.target_count) === 0) {
        setStatus("Bu xato uchun ishonchli diagnostik dalil topilmadi.", true);
      } else {
        setStatus("Bu xato uchun darsni hozir tayyorlab bo'lmadi. Qayta urinib ko'ring.", true);
      }
    } catch (error) {
      setStatus(error.message || "Darslikni tayyorlab bo‘lmadi.", true);
    } finally {
      lessonPreparationKeys.delete(key);
      if (currentPeriodData) renderRuleFlow(currentPeriodData);
      if (button.isConnected) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = lessonForEvidence(evidence) ? "Darsni boshlash" : "Qayta urinish";
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
    document.getElementById("metricAccuracyFoot").textContent = numberOf(performance.correct_count) + " ta to‘g‘ri javob";
    document.getElementById("metricAnswers").textContent = numberOf(diagnostics.analyzed_answers);
    const periodLabels = { today: "Bugungi natijalar", "7d": "So‘nggi 7 kun", "30d": "So‘nggi 30 kun" };
    document.getElementById("metricAnswersFoot").textContent = periodLabels[data.period] || periodLabels["7d"];
    document.getElementById("metricErrors").textContent = errors;
    document.getElementById("metricErrorsFoot").textContent = numberOf(performance.timeout_count) + " ta javobsiz qolgan";
    document.getElementById("metricTopics").textContent = priority.length;
    document.getElementById("metricTopicsFoot").textContent = priority.length ? priority[0].topic : "Takroriy xato aniqlanmadi";
  }

  function appendInsight(container, title, items, kind, iconName) {
    const box = document.createElement("section");
    box.className = "insight-box " + kind;
    const heading = document.createElement("h4");
    heading.append(makeIcon(iconName), document.createTextNode(title));
    const list = document.createElement("ul");
    list.className = "insight-list";
    const safeItems = Array.isArray(items) && items.length ? items : [kind === "good" ? "Yetarli dalil hali to‘planmagan." : "Takroriy zaiflik aniqlanmadi."];
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
    label.append(makeIcon("microscope"), document.createTextNode("Dalillarga asoslangan xulosa"));
    const title = document.createElement("h3");
    title.textContent = report.title || "Bilim diagnostikasi";
    const summary = document.createElement("p");
    summary.textContent = report.summary || "Tahlil tayyorlanmoqda.";
    const detail = document.createElement("p");
    detail.textContent = report.diagnosis || "Mavzu diagnostikasi uchun ko‘proq javob kerak.";
    diagnosis.append(label, title, summary, detail);
    const columns = document.createElement("div");
    columns.className = "insight-columns";
    appendInsight(columns, "Mustahkam bilimlar", report.strengths, "good", "badge-check");
    appendInsight(columns, "Diqqat talab qiladigan bilimlar", report.weaknesses, "focus", "focus");
    const motivation = document.createElement("div");
    motivation.className = "ai-motivation";
    motivation.textContent = report.motivation || "Har bir aniqlangan xato — o‘sish uchun aniq yo‘nalish.";
    body.append(diagnosis, columns, motivation);
    document.getElementById("aiConfidence").textContent = (data.confidence || report.confidence || "low") + " confidence";
  }

  function renderTopics(data) {
    const diagnostics = (data.analysis && data.analysis.learning_diagnostics) || {};
    const topics = Array.isArray(diagnostics.priority_topics) ? diagnostics.priority_topics : [];
    const container = document.getElementById("topicGrid");
    document.getElementById("topicCountBadge").textContent = topics.length + " mavzu";
    if (!topics.length) {
      renderEmpty(container, "Tanlangan davrda takroriy xato mavzusi aniqlanmadi yoki dalil yetarli emas.");
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
      risk.textContent = numberOf(topic.errors) + " xato";
      top.append(name, risk);
      const stats = document.createElement("div");
      stats.className = "topic-stats";
      stats.textContent = numberOf(topic.attempts) + " urinish · " + numberOf(topic.accuracy) + "% aniqlik · " + (topic.confidence || "low") + " ishonch";
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
        row.textContent = evidence.question + (evidence.correct_answer ? " · To‘g‘ri javob: " + evidence.correct_answer : "");
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
    copy.textContent = text || "Aniq izoh uchun ko‘proq xato dalili kerak.";
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
      row.textContent = "Ushbu qism uchun ko‘proq javob dalili kerak.";
      list.appendChild(row);
    }
    block.append(heading, list);
    return block;
  }

  function renderLessonLibrary(report) {
    const container = document.getElementById("lessonLibrary");
    const lessons = Array.isArray(report.topic_lessons) ? report.topic_lessons : [];
    document.getElementById("lessonCountBadge").textContent = lessons.length + " dars";
    if (!lessons.length) {
      renderEmpty(container, "Shaxsiy darslik yaratish uchun takroriy xato mavzusi va yetarli dalil kerak.");
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
      topic.textContent = lesson.topic || "Shaxsiy mavzu";
      const objective = document.createElement("p");
      objective.className = "lesson-objective";
      objective.textContent = "Maqsad: " + (lesson.objective || "Mavzuni tushunib, barqaror qo‘llash.");
      heading.append(topic, objective);
      const badge = document.createElement("span");
      badge.className = "badge-pill";
      badge.textContent = "Dars " + (lessonIndex + 1);
      head.append(heading, badge);
      const grid = document.createElement("div");
      grid.className = "lesson-grid";
      grid.append(
        lessonTextBlock("Xato modeli", "scan-search", lesson.misconception),
        lessonTextBlock("Asosiy qoida", "book-open", lesson.rule),
        lessonListBlock("Yechilgan misollar", "list-checks", lesson.worked_examples, "worked-list", function (row, item) {
          const strong = document.createElement("strong");
          strong.textContent = item.prompt || "Misol";
          row.append(strong, document.createTextNode(" — " + (item.answer || "Javob") + ". " + (item.reasoning || "")));
        }),
        lessonListBlock("Faol mashq", "brain-circuit", lesson.practice_sequence, "practice-sequence", function (row, item, index) {
          const strong = document.createElement("strong");
          strong.textContent = item.step || (index + 1) + "-qadam";
          row.append(strong, document.createTextNode(" — " + (item.task || "Mustaqil mashq bajaring.")));
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
      mastery.textContent = "O‘zlashtirish mezoni: " + (lesson.mastery_criterion || "Ikki urinishda kamida 80% aniqlik");
      footer.append(chips, mastery);
      card.append(head, grid, footer);
      container.appendChild(card);
    });
  }

  function remediationStatus(status) {
    const labels = { ASSIGNED: "Boshlashga tayyor", STARTED: "Davom etmoqda", COMPLETED: "Dars tugallandi" };
    return labels[status] || status || "Tayyor";
  }

  function renderStoredLessons(lessons) {
    const container = document.getElementById("lessonLibrary");
    document.getElementById("lessonCountBadge").textContent = lessons.length + " dars";
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
      title.textContent = content.lesson_title || stored.target_skill_name || "Shaxsiy dars";
      const objective = document.createElement("p");
      objective.className = "lesson-objective";
      objective.textContent = "Maqsad: " + (content.learning_objective || "Ko'nikmani mustahkamlash");
      titleWrap.append(title, objective);
      const sourceError = content.source_error || {};
      if (sourceError.question) {
        const exactError = document.createElement("p");
        exactError.className = "lesson-objective";
        exactError.textContent = "Xato: " + sourceError.question + " — sizning javobingiz: "
          + (sourceError.selected_answer || "—") + "; to'g'ri javob: " + (sourceError.correct_answer || "—");
        titleWrap.appendChild(exactError);
      }
      const badge = document.createElement("span");
      badge.className = "badge-pill";
      badge.textContent = remediationStatus(stored.status);
      head.append(titleWrap, badge);
      const summary = lessonTextBlock("Dalilga asoslangan yo'nalish", "scan-search",
        content.diagnostic_summary && content.diagnostic_summary.student_message);
      const rule = lessonTextBlock("Qisqa qoida", "book-open",
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
      state.textContent = numberOf(stored.answered_count) + "/" + numberOf(stored.exercise_count) + " mashq";
      const button = document.createElement("button");
      button.className = "btn primary";
      button.type = "button";
      button.textContent = stored.status === "ASSIGNED" ? "Darsni boshlash" : stored.status === "COMPLETED" ? "Ko'rib chiqish" : "Davom etish";
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
      else renderEmpty(document.getElementById("lessonLibrary"), "Hozircha tayyor xato darslari yo'q.");
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
      sentence.textContent = (index + 1) + ". " + (example.sentence || example.prompt || "Misol");
      const explanation = document.createElement("p");
      explanation.textContent = example.rule_application || example.reasoning || example.explanation || "Qoida shu gapda qo‘llangan.";
      card.append(sentence, explanation);
      container.appendChild(card);
    });
    if (!container.childNodes.length) renderEmpty(container, "Bu eski dars formatida misollar saqlanmagan.");
    document.getElementById("lessonExampleCount").textContent = Math.min(10, examples.length) + "/10";
  }

  function renderLessonExercises(lesson) {
    const container = document.getElementById("lessonDialogExercises");
    clearElement(container);
    (lesson.exercises || []).forEach(function (exercise, index) {
      const card = document.createElement("article");
      card.className = "lesson-exercise";
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
      card.append(heading, options);
      if (exercise.explanation && exercise.selected_option) {
        const feedback = document.createElement("p");
        feedback.className = "lesson-feedback";
        feedback.textContent = (exercise.is_correct ? "To'g'ri. " : "To'g'ri javob: " + exercise.correct_option + ". ") + exercise.explanation;
        card.appendChild(feedback);
      }
      container.appendChild(card);
    });
  }

  async function fetchLesson(lessonId) {
    const data = await requestJson("/learning/remediation/lessons/" + lessonId, { method: "GET" });
    const lesson = data.lesson;
    const content = lesson.lesson_content || {};
    const sourceError = content.source_error || {};
    document.getElementById("lessonDialogTitle").textContent = content.lesson_title || "Shaxsiy dars";
    document.getElementById("lessonDialogObjective").textContent = content.learning_objective || "";
    const sourceErrorBox = document.getElementById("lessonDialogSourceError");
    const hasSourceError = Boolean(sourceError.question || sourceError.selected_answer || sourceError.correct_answer);
    sourceErrorBox.hidden = !hasSourceError;
    document.getElementById("lessonDialogQuestion").textContent = sourceError.question || "—";
    document.getElementById("lessonDialogSelectedAnswer").textContent = sourceError.selected_answer || "—";
    document.getElementById("lessonDialogCorrectAnswer").textContent = sourceError.correct_answer || "—";
    document.getElementById("lessonDialogRule").textContent = content.micro_explanation && content.micro_explanation.rule || "Qoida izohi mavjud emas.";
    renderLessonExamples(content);
    renderLessonExercises(lesson);
    const completionStatus = document.getElementById("lessonCompletionStatus");
    completionStatus.textContent = "";
    completionStatus.classList.remove("error","success");
    document.getElementById("lessonTestCount").textContent = (lesson.exercises || []).length + "/10";
    const complete = document.getElementById("lessonCompleteButton");
    complete.disabled = lesson.status === "COMPLETED" || (lesson.exercises || []).some(function (item) { return !item.selected_option; });
    complete.textContent = lesson.status === "COMPLETED" ? "Dars yakunlangan" : "Darsni yakunlash";
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
    completionStatus.textContent = "Natija tekshirilmoqda...";
    completionStatus.classList.remove("error","success");
    try {
      await requestJson("/learning/remediation/lessons/" + activeLessonId + "/complete", { method: "POST" });
      await fetchLesson(activeLessonId);
      completionStatus.textContent = "Mezon bajarildi — dars muvaffaqiyatli yakunlandi.";
      completionStatus.classList.add("success");
      storedLessons = await loadStoredLessons(true);
      if (currentPeriodData) renderRuleFlow(currentPeriodData);
      periodCache.clear();
    } catch (error) {
      button.disabled = false;
      completionStatus.textContent = error.message || "Natijani tekshirib bo'lmadi.";
      completionStatus.classList.add("error");
    }
  });

  function renderLearningPlan(report) {
    const container = document.getElementById("learningPlan");
    const plan = Array.isArray(report.learning_plan) ? report.learning_plan : [];
    if (!plan.length) {
      renderEmpty(container, "O‘quv reja uchun yetarli dalil mavjud emas.");
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
      title.textContent = (item.stage || "Bosqich") + " · " + (item.focus || "Mavzu");
      const method = document.createElement("span");
      method.className = "method-tag";
      method.textContent = item.method || "amaliy mashq";
      head.append(title, method);
      const task = document.createElement("div");
      task.className = "plan-task";
      task.textContent = item.task || "Mavzuni qayta mashq qiling.";
      const success = document.createElement("div");
      success.className = "success";
      success.textContent = "Natija mezoni: " + (item.success_criterion || "Barqaror to‘g‘ri javoblar");
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
    document.getElementById("qualityNote").textContent = quality.enough_data ? "Xulosa chiqarish uchun dalil yetarli. Ishonch darajasi: " + confidence + "." : "Aniq xulosa uchun kamida 30 ta javob, 2 ta topshiriq yoki 1 ta imtihon kerak.";
    const period = analysis.period || {};
    const format = function (value) { return value ? new Date(value).toLocaleDateString("uz-UZ", { day: "numeric", month: "short" }) : "—"; };
    document.getElementById("periodDates").textContent = format(period.start) + " — " + format(period.end);
    renderMethods(data.report || {});
    renderNextSteps(data.report || {});
  }

  function renderMethods(report) {
    const container = document.getElementById("studyMethods");
    const methods = Array.isArray(report.study_principles) ? report.study_principles : [];
    if (!methods.length) {
      renderEmpty(container, "Metodlar tahlil bilan birga paydo bo‘ladi.");
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
      renderEmpty(container, "Keyingi qadamlar uchun ko‘proq ma’lumot kerak.");
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
    body.innerHTML = '<div class="ai-empty"><div><div class="ai-empty-icon"><i data-lucide="crown"></i></div><h3>Chuqur bilim diagnostikasi — Premium</h3><p>7 va 30 kunlik xato mavzulari, pedagogik tahlil va ilmiy o‘quv rejasini oling.</p><button class="btn primary" id="progressPremiumButton" type="button"><i data-lucide="crown"></i> Premium olish</button></div></div>';
    document.getElementById("progressPremiumButton").addEventListener("click", function () { window.openPaymentModal("student_premium"); });
    renderEmpty(document.getElementById("topicGrid"), "Premium tahlil faollashtirilgach mavzu diagnostikasi ko‘rinadi.");
    renderEmpty(document.getElementById("lessonLibrary"), "Premium tahlil faollashtirilgach xatolardan shaxsiy darslik yaratiladi.");
    renderEmpty(document.getElementById("learningPlan"), "Premium tahlil faollashtirilgach shaxsiy reja yaratiladi.");
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
    const loadingLabels = { today: "Bugungi", "7d": "7 kunlik", "30d": "30 kunlik" };
    setStatus((loadingLabels[period] || loadingLabels["7d"]) + " bilim tahlili yuklanmoqda...", false);
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
        renderEmpty(document.getElementById("ruleTopicList"), "Chuqur qoida diagnostikasi Premium tarifda mavjud.");
      } else setStatus(error.message || "Tahlilni yuklab bo‘lmadi.", true);
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
  learningUi.load();
  loadPeriod("7d");
})();
