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

  async function loadStoredLessons() {
    let data = await requestJson("/learning/remediation/lessons", { method: "GET" });
    if (!Array.isArray(data.lessons) || !data.lessons.length) {
      await requestJson("/learning/remediation/lessons/sync", { method: "POST" });
      data = await requestJson("/learning/remediation/lessons", { method: "GET" });
    }
    if (Array.isArray(data.lessons) && data.lessons.length) renderStoredLessons(data.lessons);
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
          button.disabled = true;
          if (code === exercise.correct_option) button.classList.add("correct");
          else if (code === exercise.selected_option) button.classList.add("wrong");
        } else {
          button.addEventListener("click", function () { answerStoredExercise(exercise.id, code); });
        }
        options.appendChild(button);
      });
      card.append(heading, options);
      if (exercise.explanation) {
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
    document.getElementById("lessonDialogTitle").textContent = content.lesson_title || "Shaxsiy dars";
    document.getElementById("lessonDialogObjective").textContent = content.learning_objective || "";
    document.getElementById("lessonDialogRule").textContent = content.micro_explanation && content.micro_explanation.rule || "Qoida izohi mavjud emas.";
    renderLessonExercises(lesson);
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
    await loadStoredLessons();
  }

  document.getElementById("lessonDialogClose").addEventListener("click", function () { lessonDialog.classList.remove("open"); });
  lessonDialog.addEventListener("click", function (event) { if (event.target === lessonDialog) lessonDialog.classList.remove("open"); });
  document.getElementById("lessonCompleteButton").addEventListener("click", async function () {
    if (!activeLessonId) return;
    await requestJson("/learning/remediation/lessons/" + activeLessonId + "/complete", { method: "POST" });
    await fetchLesson(activeLessonId);
    await loadStoredLessons();
    periodCache.clear();
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
      renderDashboard(data);
      try { await loadStoredLessons(); } catch (lessonError) { console.error("Personalized lessons:", lessonError); }
    } catch (error) {
      if (error.status === 402) {
        setStatus("", false);
        renderPremiumLock();
      } else setStatus(error.message || "Tahlilni yuklab bo‘lmadi.", true);
    } finally {
      periodButtons.forEach(function (button) { button.disabled = false; });
    }
  }

  periodButtons.forEach(function (button) {
    button.addEventListener("click", function () { loadPeriod(button.dataset.period); });
  });
  const learningUi = window.createProgressLearningUI({
    requestJson,clearElement,makeIcon,renderEmpty,numberOf,
    clearPeriodCache: function () { periodCache.clear(); },
  });
  learningUi.load();
  loadPeriod("7d");
})();
