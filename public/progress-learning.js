(function () {
  "use strict";

  window.createProgressLearningUI = function createProgressLearningUI({
    requestJson,clearElement,makeIcon,renderEmpty,numberOf,clearPeriodCache,
  }) {
    const assessmentDialog = document.getElementById("assessmentDialog");
    let activeAssessmentId = null;
    let assessmentQuestionStartedAt = null;
    let cachedOverview = null;
    let cachedAssessments = null;

    function learningT(key, params) {
      if (typeof window.progressT === "function") return window.progressT(key, params);
      return window.IlmLigaI18n ? window.IlmLigaI18n.t(key, params) : key;
    }

    function learningLocale() {
      if (typeof window.progressLocale === "function") return window.progressLocale();
      const language = window.IlmLigaI18n ? window.IlmLigaI18n.getLanguage() : "uz";
      return { uz: "uz-UZ", en: "en-US", ru: "ru-RU" }[language] || "uz-UZ";
    }

    function evidenceLabel(status) {
      const known = ["OBSERVED","SUSPECTED","LIKELY","CONFIRMED","REMEDIATING","IMPROVING","STABLE","MASTERED","REGRESSED"];
      return known.includes(status) ? learningT("progress.evidence." + status.toLowerCase()) : status;
    }

    function exactSkillName(item) {
      if (!item) return learningT("progress.unknownSkill");
      return item.parent_skill_name
        ? item.parent_skill_name + " — " + item.skill_name
        : item.skill_name || item.target_skill_name || learningT("progress.unknownSkill");
    }

    function renderLearningOverview(data) {
      const overview = data.overview || {};
      const metrics = [
        ["scan-search", learningT("progress.reliableAttempts"), numberOf(overview.reliable_attempts)],
        ["gauge", learningT("progress.currentMastery"), numberOf(overview.current_mastery).toFixed(0) + "%"],
        ["shield-check", learningT("progress.evidenceConfidence"), numberOf(overview.confidence).toFixed(0) + "%"],
        ["trending-up", learningT("progress.improving"), numberOf(overview.skills_improving)],
        ["calendar-clock", learningT("progress.reviewsToday"), numberOf(overview.reviews_due)],
        ["repeat-2", learningT("progress.repeatedMistake"), numberOf(overview.repeated_mistakes)],
        ["badge-check", learningT("progress.completedLessons"), numberOf(overview.completed_lessons)],
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
        renderEmpty(container,learningT("progress.noConfirmedGap"));
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
        badge.textContent = evidenceLabel(item.current_evidence_state) || item.current_evidence_state;
        top.append(name,badge);
        const meta = document.createElement("div");
        meta.className = "weakness-meta";
        meta.append(
          document.createTextNode(learningT("progress.masteryPercent", { count: numberOf(item.mastery_score).toFixed(0) })),
          document.createTextNode(learningT("progress.confidencePercent", { count: numberOf(item.confidence_score).toFixed(0) })),
          document.createTextNode(learningT("progress.repeatedErrorCount", { count: numberOf(item.repeated_misconception_count) }))
        );
        card.append(top,meta);
        container.appendChild(card);
      });
    }

    function timelineText(event) {
      const payload = event.event_payload || {};
      const labels = {
        LESSON_CREATED: learningT("progress.timelineLessonCreated"), LESSON_STARTED: learningT("progress.timelineLessonStarted"),
        LESSON_COMPLETED: learningT("progress.timelineLessonCompleted"), RETEST_COMPLETED: learningT("progress.timelineRetestCompleted"),
        REVIEW_COMPLETED: learningT("progress.timelineReviewCompleted"),
      };
      let label = labels[event.event_type] || evidenceLabel(event.to_status) || learningT("progress.timelineUpdated");
      if (["RETEST_COMPLETED","REVIEW_COMPLETED"].includes(event.event_type) && payload.accuracy != null) {
        label += " — " + numberOf(payload.accuracy).toFixed(0) + "%";
      }
      return label;
    }

    function renderLearningTimeline(items) {
      const container = document.getElementById("learningTimeline");
      const timeline = Array.isArray(items) ? items : [];
      if (!timeline.length) {
        renderEmpty(container,learningT("progress.timelineEmpty"));
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
        date.textContent = new Date(event.created_at).toLocaleString(learningLocale(), { day: "numeric",month: "short",hour: "2-digit",minute: "2-digit" });
        row.append(icon,copy,date);
        container.appendChild(row);
      });
    }

    function retestProgressText(assessment) {
      if (assessment.assessment_type !== "RETEST") return "";
      const completed = Math.min(numberOf(assessment.successful_retests),numberOf(assessment.required_successful_retests));
      return learningT("progress.independentRetest", { completed, required: numberOf(assessment.required_successful_retests) });
    }

    function renderDueAssessments(items,upcomingItems) {
      const assessments = Array.isArray(items) ? items : [];
      const upcoming = Array.isArray(upcomingItems) ? upcomingItems : [];
      const container = document.getElementById("reviewDueList");
      document.getElementById("reviewDueBadge").textContent = learningT("progress.itemCount", { count: assessments.length });
      if (!assessments.length && !upcoming.length) {
        renderEmpty(container,learningT("progress.noReviewsDue"));
        return;
      }
      clearElement(container);
      assessments.concat(upcoming).forEach(function (assessment,index) {
        const isUpcoming = index >= assessments.length;
        const card = document.createElement("article");
        card.className = "review-item";
        const top = document.createElement("div");
        top.className = "review-top";
        const name = document.createElement("div");
        name.className = "review-name";
        name.textContent = assessment.target_skill_name;
        const badge = document.createElement("span");
        badge.className = "evidence-badge";
        badge.textContent = isUpcoming ? learningT("progress.nextRetest") : assessment.assessment_type === "RETEST" ? learningT("progress.retest") : learningT("progress.reviewNumber", { number: assessment.sequence_no });
        top.append(name,badge);
        const meta = document.createElement("div");
        meta.className = "review-meta";
        meta.append(document.createTextNode(learningT("progress.questionCount", { count: assessment.question_count })),document.createTextNode(learningT("progress.criterionScore", { correct: assessment.required_correct, total: assessment.question_count })));
        const retestProgress = retestProgressText(assessment);
        if (retestProgress) meta.appendChild(document.createTextNode(retestProgress));
        if (isUpcoming) {
          meta.appendChild(document.createTextNode(learningT("progress.opensAt", { date: new Date(assessment.scheduled_for).toLocaleString(learningLocale(), {
            day: "numeric",month: "short",hour: "2-digit",minute: "2-digit",
          }) })));
        }
        const actions = document.createElement("div");
        actions.className = "review-actions";
        const progress = document.createElement("span");
        progress.className = "review-progress";
        progress.textContent = isUpcoming ? learningT("progress.scheduled") : learningT("progress.answersProgress", { answered: numberOf(assessment.answered_count), total: assessment.question_count });
        const button = document.createElement("button");
        button.className = "btn primary";
        button.type = "button";
        button.textContent = isUpcoming ? learningT("progress.waiting") : assessment.status === "STARTED" ? learningT("progress.continue") : learningT("progress.start");
        button.disabled = isUpcoming;
        if (!isUpcoming) button.addEventListener("click", function () { openAssessment(assessment.id); });
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
      document.getElementById("assessmentDialogTitle").textContent = assessment.assessment_type === "RETEST" ? learningT("progress.retest") : learningT("progress.intervalReview");
      const retestProgress = retestProgressText(assessment);
      document.getElementById("assessmentDialogObjective").textContent = learningT("progress.assessmentObjective", { skill: assessment.target_skill_name, correct: assessment.required_correct, total: assessment.question_count }) + (retestProgress ? " · " + retestProgress : "");
      document.getElementById("assessmentProgressFill").style.width = (questions.length ? answered / questions.length * 100 : 0) + "%";
      setAssessmentStatus(completed
        ? learningT(assessment.passed ? "progress.assessmentPassed" : "progress.assessmentNeedsWork", { correct: numberOf(assessment.correct_count), total: numberOf(assessment.total_count) })
        : learningT("progress.assessmentAnswered", { answered, total: questions.length }),false);
      const container = document.getElementById("assessmentQuestions");
      clearElement(container);
      questions.forEach(function (question,index) { renderAssessmentQuestion(container,question,index,completed); });
      const complete = document.getElementById("assessmentCompleteButton");
      complete.disabled = completed || !questions.length || answered !== questions.length;
      complete.textContent = completed ? learningT("progress.assessmentCompleted") : learningT("progress.completeAssessment");
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
        explanation.textContent = (question.is_correct ? learningT("progress.correctFeedback") : learningT("progress.correctOptionFeedback", { option: question.correct_option })) + question.explanation;
        card.appendChild(explanation);
      }
      container.appendChild(card);
    }

    async function openAssessment(assessmentId) {
      activeAssessmentId = assessmentId;
      assessmentDialog.classList.add("open");
      setAssessmentStatus(learningT("progress.questionsLoading"),false);
      try {
        const data = await requestJson("/learning/remediation/assessments/" + assessmentId + "/start", { method: "POST" });
        renderAssessment(data.assessment);
      } catch (error) {
        setAssessmentStatus(error.message || learningT("progress.openAssessmentFailed"),true);
      }
    }

    async function answerAssessmentQuestion(questionId,selectedOption) {
      if (!activeAssessmentId) return;
      setAssessmentStatus(learningT("progress.answerSaving"),false);
      try {
        await requestJson("/learning/remediation/assessments/" + activeAssessmentId + "/questions/" + questionId + "/answer", {
          method: "POST",headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selected_option: selectedOption,response_time_ms: Math.max(0,Date.now() - assessmentQuestionStartedAt) }),
        });
        const data = await requestJson("/learning/remediation/assessments/" + activeAssessmentId,{ method: "GET" });
        renderAssessment(data.assessment);
        await loadLearningJourney();
      } catch (error) {
        setAssessmentStatus(error.message || learningT("progress.answerSaveFailed"),true);
      }
    }

    async function completeActiveAssessment() {
      if (!activeAssessmentId) return;
      const button = document.getElementById("assessmentCompleteButton");
      button.disabled = true;
      setAssessmentStatus(learningT("progress.resultCalculating"),false);
      try {
        const data = await requestJson("/learning/remediation/assessments/" + activeAssessmentId + "/complete", { method: "POST" });
        renderAssessment(data.assessment);
        clearPeriodCache();
        await loadLearningJourney();
      } catch (error) {
        button.disabled = false;
        setAssessmentStatus(error.message || learningT("progress.completeAssessmentFailed"),true);
      }
    }

    async function loadLearningJourney() {
      try {
        const results = await Promise.all([
          requestJson("/learning/progress/overview",{ method: "GET" }),
          requestJson("/learning/remediation/assessments/due",{ method: "GET" }),
        ]);
        cachedOverview = results[0];
        cachedAssessments = results[1];
        renderLearningOverview(results[0]);
        renderExactWeaknesses(results[0].exact_weaknesses);
        renderLearningTimeline(results[0].timeline);
        renderDueAssessments(results[1].assessments,results[1].upcoming_retests);
        if (window.lucide) window.lucide.createIcons();
      } catch (error) {
        console.error("Learning journey:",error);
        renderEmpty(document.getElementById("learningOverview"),learningT("progress.overviewLoadFailed"));
        renderEmpty(document.getElementById("exactWeaknesses"),learningT("progress.skillsLoadFailed"));
        renderEmpty(document.getElementById("learningTimeline"),learningT("progress.timelineLoadFailed"));
        renderEmpty(document.getElementById("reviewDueList"),learningT("progress.reviewPlanLoadFailed"));
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

    function rerender() {
      if (cachedOverview) {
        renderLearningOverview(cachedOverview);
        renderExactWeaknesses(cachedOverview.exact_weaknesses);
        renderLearningTimeline(cachedOverview.timeline);
      }
      if (cachedAssessments) renderDueAssessments(cachedAssessments.assessments,cachedAssessments.upcoming_retests);
      if (window.lucide) window.lucide.createIcons();
    }

    return { load: loadLearningJourney, rerender };
  };
})();
