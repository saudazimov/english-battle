(function () {
  "use strict";

  window.createProgressLearningUI = function createProgressLearningUI({
    requestJson,clearElement,makeIcon,renderEmpty,numberOf,clearPeriodCache,
  }) {
    const assessmentDialog = document.getElementById("assessmentDialog");
    let activeAssessmentId = null;
    let assessmentQuestionStartedAt = null;

    const evidenceLabels = {
      OBSERVED: "Kuzatilgan", SUSPECTED: "Taxmin qilinmoqda", LIKELY: "Kuchli taxmin",
      CONFIRMED: "Tasdiqlangan", REMEDIATING: "Dars jarayonida", IMPROVING: "Yaxshilanmoqda",
      STABLE: "Barqaror", MASTERED: "O‘zlashtirilgan", REGRESSED: "Qayta sustlashgan",
    };

    function exactSkillName(item) {
      if (!item) return "Aniqlanmagan ko‘nikma";
      return item.parent_skill_name
        ? item.parent_skill_name + " — " + item.skill_name
        : item.skill_name || item.target_skill_name || "Aniqlanmagan ko‘nikma";
    }

    function renderLearningOverview(data) {
      const overview = data.overview || {};
      const metrics = [
        ["scan-search", "Ishonchli urinish", numberOf(overview.reliable_attempts)],
        ["gauge", "Joriy o‘zlashtirish", numberOf(overview.current_mastery).toFixed(0) + "%"],
        ["shield-check", "Dalil ishonchi", numberOf(overview.confidence).toFixed(0) + "%"],
        ["trending-up", "Yaxshilanayotgan", numberOf(overview.skills_improving)],
        ["calendar-clock", "Bugungi takrorlash", numberOf(overview.reviews_due)],
        ["repeat-2", "Takroriy xato", numberOf(overview.repeated_mistakes)],
        ["badge-check", "Yakunlangan dars", numberOf(overview.completed_lessons)],
      ];
      const container = document.getElementById("learningOverview");
      clearElement(container);
      metrics.forEach(function (metric) {
        const card = document.createElement("div");
        card.className = "overview-stat";
        const value = document.createElement("div");
        value.className = "overview-value";
        value.textContent = metric[2];
        const label = document.createElement("div");
        label.className = "overview-label";
        label.textContent = metric[1];
        card.append(makeIcon(metric[0]),value,label);
        container.appendChild(card);
      });
    }

    function renderExactWeaknesses(items) {
      const container = document.getElementById("exactWeaknesses");
      const weaknesses = Array.isArray(items) ? items : [];
      if (!weaknesses.length) {
        renderEmpty(container,"Hozircha tasdiqlangan aniq bilim bo‘shlig‘i yo‘q.");
        return;
      }
      clearElement(container);
      weaknesses.forEach(function (item) {
        const card = document.createElement("article");
        card.className = "weakness-item";
        const top = document.createElement("div");
        top.className = "weakness-top";
        const name = document.createElement("div");
        name.className = "weakness-name";
        name.textContent = exactSkillName(item);
        const badge = document.createElement("span");
        badge.className = "evidence-badge";
        badge.textContent = evidenceLabels[item.current_evidence_state] || item.current_evidence_state;
        top.append(name,badge);
        const meta = document.createElement("div");
        meta.className = "weakness-meta";
        meta.append(
          document.createTextNode("O‘zlashtirish: " + numberOf(item.mastery_score).toFixed(0) + "%"),
          document.createTextNode("Ishonch: " + numberOf(item.confidence_score).toFixed(0) + "%"),
          document.createTextNode("Takroriy xato: " + numberOf(item.repeated_misconception_count))
        );
        card.append(top,meta);
        container.appendChild(card);
      });
    }

    function timelineText(event) {
      const payload = event.event_payload || {};
      const labels = {
        LESSON_CREATED: "Shaxsiy dars tayyorlandi", LESSON_STARTED: "Dars boshlandi",
        LESSON_COMPLETED: "Dars yakunlandi", RETEST_COMPLETED: "Qayta tekshiruv yakunlandi",
        REVIEW_COMPLETED: "Interval takrorlash yakunlandi",
      };
      let label = labels[event.event_type] || evidenceLabels[event.to_status] || "O‘rganish holati yangilandi";
      if (["RETEST_COMPLETED","REVIEW_COMPLETED"].includes(event.event_type) && payload.accuracy != null) {
        label += " — " + numberOf(payload.accuracy).toFixed(0) + "%";
      }
      return label;
    }

    function renderLearningTimeline(items) {
      const container = document.getElementById("learningTimeline");
      const timeline = Array.isArray(items) ? items : [];
      if (!timeline.length) {
        renderEmpty(container,"Birinchi shaxsiy dars yoki retestdan keyin o‘rganish tarixi shu yerda ko‘rinadi.");
        return;
      }
      clearElement(container);
      timeline.slice(0,12).forEach(function (event) {
        const row = document.createElement("article");
        row.className = "timeline-item";
        const icon = document.createElement("div");
        icon.className = "timeline-icon";
        icon.appendChild(makeIcon(event.event_type === "LESSON_COMPLETED" ? "book-check" : "circle-check-big"));
        const copy = document.createElement("div");
        const title = document.createElement("div");
        title.className = "timeline-title";
        title.textContent = timelineText(event);
        const skill = document.createElement("div");
        skill.className = "timeline-skill";
        skill.textContent = exactSkillName(event);
        copy.append(title,skill);
        const date = document.createElement("time");
        date.className = "timeline-date";
        date.dateTime = event.created_at;
        date.textContent = new Date(event.created_at).toLocaleString("uz-UZ", { day: "numeric",month: "short",hour: "2-digit",minute: "2-digit" });
        row.append(icon,copy,date);
        container.appendChild(row);
      });
    }

    function renderDueAssessments(items) {
      const assessments = Array.isArray(items) ? items : [];
      const container = document.getElementById("reviewDueList");
      document.getElementById("reviewDueBadge").textContent = assessments.length + " ta";
      if (!assessments.length) {
        renderEmpty(container,"Bugun uchun majburiy retest yoki takrorlash yo‘q. Rejadagi mashqlarni davom ettiring.");
        return;
      }
      clearElement(container);
      assessments.forEach(function (assessment) {
        const card = document.createElement("article");
        card.className = "review-item";
        const top = document.createElement("div");
        top.className = "review-top";
        const name = document.createElement("div");
        name.className = "review-name";
        name.textContent = assessment.target_skill_name;
        const badge = document.createElement("span");
        badge.className = "evidence-badge";
        badge.textContent = assessment.assessment_type === "RETEST" ? "Qayta tekshiruv" : assessment.sequence_no + "-takrorlash";
        top.append(name,badge);
        const meta = document.createElement("div");
        meta.className = "review-meta";
        meta.append(document.createTextNode(assessment.question_count + " savol"),document.createTextNode("Mezon: " + assessment.required_correct + "/" + assessment.question_count));
        const actions = document.createElement("div");
        actions.className = "review-actions";
        const progress = document.createElement("span");
        progress.className = "review-progress";
        progress.textContent = numberOf(assessment.answered_count) + "/" + assessment.question_count + " javob";
        const button = document.createElement("button");
        button.className = "btn primary";
        button.type = "button";
        button.textContent = assessment.status === "STARTED" ? "Davom etish" : "Boshlash";
        button.addEventListener("click", function () { openAssessment(assessment.id); });
        actions.append(progress,button);
        card.append(top,meta,actions);
        container.appendChild(card);
      });
    }

    function setAssessmentStatus(message,error) {
      const status = document.getElementById("assessmentDialogStatus");
      status.textContent = message || "";
      status.classList.toggle("error",Boolean(error));
    }

    function renderAssessment(assessment) {
      const questions = Array.isArray(assessment.questions) ? assessment.questions : [];
      const answered = questions.filter(function (question) { return Boolean(question.selected_option); }).length;
      const completed = assessment.status === "COMPLETED";
      document.getElementById("assessmentDialogTitle").textContent = assessment.assessment_type === "RETEST" ? "Qayta tekshiruv" : "Interval takrorlash";
      document.getElementById("assessmentDialogObjective").textContent = assessment.target_skill_name + " — " + assessment.required_correct + "/" + assessment.question_count + " mezon";
      document.getElementById("assessmentProgressFill").style.width = (questions.length ? answered / questions.length * 100 : 0) + "%";
      setAssessmentStatus(completed ? "Natija: " + numberOf(assessment.correct_count) + "/" + numberOf(assessment.total_count) + (assessment.passed ? " — mezon bajarildi." : " — mavzuni yana mustahkamlaymiz.") : answered + "/" + questions.length + " savolga javob berildi.",false);
      const container = document.getElementById("assessmentQuestions");
      clearElement(container);
      questions.forEach(function (question,index) { renderAssessmentQuestion(container,question,index,completed); });
      const complete = document.getElementById("assessmentCompleteButton");
      complete.disabled = completed || !questions.length || answered !== questions.length;
      complete.textContent = completed ? "Tekshiruv yakunlangan" : "Natijani yakunlash";
      assessmentQuestionStartedAt = Date.now();
      if (window.lucide) window.lucide.createIcons();
    }

    function renderAssessmentQuestion(container,question,index,completed) {
      const card = document.createElement("article");
      card.className = "assessment-question";
      const heading = document.createElement("h4");
      heading.textContent = (index + 1) + ". " + question.prompt;
      const options = document.createElement("div");
      options.className = "lesson-options";
      Object.keys(question.options || {}).forEach(function (code) {
        const button = document.createElement("button");
        button.className = "btn lesson-option assessment-option";
        button.type = "button";
        button.textContent = code + ". " + question.options[code];
        button.disabled = completed || Boolean(question.selected_option);
        if (code === question.selected_option) button.classList.add("selected");
        if (completed && code === question.correct_option) button.classList.add("correct");
        if (completed && code === question.selected_option && !question.is_correct) button.classList.add("wrong");
        button.addEventListener("click", function () { answerAssessmentQuestion(question.id,code); });
        options.appendChild(button);
      });
      card.append(heading,options);
      if (completed && question.explanation) {
        const explanation = document.createElement("p");
        explanation.className = "assessment-explanation";
        explanation.textContent = (question.is_correct ? "To‘g‘ri. " : "To‘g‘ri javob: " + question.correct_option + ". ") + question.explanation;
        card.appendChild(explanation);
      }
      container.appendChild(card);
    }

    async function openAssessment(assessmentId) {
      activeAssessmentId = assessmentId;
      assessmentDialog.classList.add("open");
      setAssessmentStatus("Savollar yuklanmoqda...",false);
      try {
        const data = await requestJson("/learning/remediation/assessments/" + assessmentId + "/start", { method: "POST" });
        renderAssessment(data.assessment);
      } catch (error) {
        setAssessmentStatus(error.message || "Tekshiruvni ochib bo‘lmadi.",true);
      }
    }

    async function answerAssessmentQuestion(questionId,selectedOption) {
      if (!activeAssessmentId) return;
      setAssessmentStatus("Javob saqlanmoqda...",false);
      try {
        await requestJson("/learning/remediation/assessments/" + activeAssessmentId + "/questions/" + questionId + "/answer", {
          method: "POST",headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selected_option: selectedOption,response_time_ms: Math.max(0,Date.now() - assessmentQuestionStartedAt) }),
        });
        const data = await requestJson("/learning/remediation/assessments/" + activeAssessmentId,{ method: "GET" });
        renderAssessment(data.assessment);
        await loadLearningJourney();
      } catch (error) {
        setAssessmentStatus(error.message || "Javobni saqlab bo‘lmadi.",true);
      }
    }

    async function completeActiveAssessment() {
      if (!activeAssessmentId) return;
      const button = document.getElementById("assessmentCompleteButton");
      button.disabled = true;
      setAssessmentStatus("Natija hisoblanmoqda...",false);
      try {
        const data = await requestJson("/learning/remediation/assessments/" + activeAssessmentId + "/complete", { method: "POST" });
        renderAssessment(data.assessment);
        clearPeriodCache();
        await loadLearningJourney();
      } catch (error) {
        button.disabled = false;
        setAssessmentStatus(error.message || "Tekshiruvni yakunlab bo‘lmadi.",true);
      }
    }

    async function loadLearningJourney() {
      try {
        const results = await Promise.all([
          requestJson("/learning/progress/overview",{ method: "GET" }),
          requestJson("/learning/remediation/assessments/due",{ method: "GET" }),
        ]);
        renderLearningOverview(results[0]);
        renderExactWeaknesses(results[0].exact_weaknesses);
        renderLearningTimeline(results[0].timeline);
        renderDueAssessments(results[1].assessments);
        if (window.lucide) window.lucide.createIcons();
      } catch (error) {
        console.error("Learning journey:",error);
        renderEmpty(document.getElementById("learningOverview"),"O‘rganish holatini yuklab bo‘lmadi.");
        renderEmpty(document.getElementById("exactWeaknesses"),"Aniq ko‘nikmalarni yuklab bo‘lmadi.");
        renderEmpty(document.getElementById("learningTimeline"),"O‘rganish tarixini yuklab bo‘lmadi.");
        renderEmpty(document.getElementById("reviewDueList"),"Takrorlash rejasini yuklab bo‘lmadi.");
      }
    }


    document.getElementById("assessmentDialogClose").addEventListener("click", function () {
      assessmentDialog.classList.remove("open");
      activeAssessmentId = null;
    });
    assessmentDialog.addEventListener("click", function (event) {
      if (event.target === assessmentDialog) {
        assessmentDialog.classList.remove("open");
        activeAssessmentId = null;
      }
    });
    document.getElementById("assessmentCompleteButton").addEventListener("click", completeActiveAssessment);

    return { load: loadLearningJourney };
  };
})();
