function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function createStudentRemediationController({ lessonService, reviewService, logger = console }) {
  return {
    async sync(req, res) {
      try {
        const result = await lessonService.syncLessons(req.user.id);
        res.json(result);
      } catch (error) {
        logger.error("Remediation sync xatosi:", error.message);
        res.status(500).json({ error: "Shaxsiy darslarni tayyorlab bo'lmadi." });
      }
    },

    async list(req, res) {
      try {
        res.json({ lessons: await lessonService.listLessons(req.user.id) });
      } catch (error) {
        logger.error("Remediation list xatosi:", error.message);
        res.status(500).json({ error: "Shaxsiy darslarni yuklab bo'lmadi." });
      }
    },

    async detail(req, res) {
      try {
        const lessonId = positiveInteger(req.params.lessonId);
        if (!lessonId) return res.status(400).json({ error: "Noto'g'ri dars ID." });
        const lesson = await lessonService.getLesson(req.user.id, lessonId);
        if (!lesson) return res.status(404).json({ error: "Dars topilmadi." });
        res.json({ lesson });
      } catch (error) {
        logger.error("Remediation detail xatosi:", error.message);
        res.status(500).json({ error: "Darsni yuklab bo'lmadi." });
      }
    },

    async start(req, res) {
      try {
        const lessonId = positiveInteger(req.params.lessonId);
        if (!lessonId) return res.status(400).json({ error: "Noto'g'ri dars ID." });
        const lesson = await lessonService.startLesson(req.user.id, lessonId);
        if (!lesson) return res.status(404).json({ error: "Boshlash mumkin bo'lgan dars topilmadi." });
        res.json({ lesson });
      } catch (error) {
        logger.error("Remediation start xatosi:", error.message);
        res.status(500).json({ error: "Darsni boshlab bo'lmadi." });
      }
    },

    async answer(req, res) {
      try {
        const lessonId = positiveInteger(req.params.lessonId);
        const exerciseId = positiveInteger(req.params.exerciseId);
        if (!lessonId || !exerciseId) return res.status(400).json({ error: "Noto'g'ri mashq ID." });
        const result = await lessonService.answerExercise(
          req.user.id, lessonId, exerciseId, req.body && req.body.selected_option
        );
        if (result && result.validation_error) return res.status(400).json({ error: "Javob A, B, C yoki D bo'lishi kerak." });
        if (!result) return res.status(404).json({ error: "Faol mashq topilmadi." });
        res.json(result);
      } catch (error) {
        logger.error("Remediation answer xatosi:", error.message);
        res.status(500).json({ error: "Javobni saqlab bo'lmadi." });
      }
    },

    async complete(req, res) {
      try {
        const lessonId = positiveInteger(req.params.lessonId);
        if (!lessonId) return res.status(400).json({ error: "Noto'g'ri dars ID." });
        const result = await lessonService.completeLesson(req.user.id, lessonId);
        if (!result) return res.status(404).json({ error: "Dars topilmadi." });
        if (result.incomplete) {
          return res.status(409).json({
            error: "Darsni yakunlashdan oldin barcha mashqlarga javob bering.",
            answered: result.answered,
            total: result.total,
          });
        }
        if (reviewService && result.remediation_plan_id) {
          try {
            await reviewService.ensureInitialRetest(req.user.id, result.remediation_plan_id);
          } catch (scheduleError) {
            logger.error("Retest yaratish xatosi:", scheduleError.message);
          }
        }
        res.json({ lesson: result });
      } catch (error) {
        logger.error("Remediation complete xatosi:", error.message);
        res.status(500).json({ error: "Darsni yakunlab bo'lmadi." });
      }
    },

    async syncAssessments(req, res) {
      try {
        res.json(await reviewService.syncStudentAssessments(req.user.id));
      } catch (error) {
        logger.error("Assessment sync xatosi:", error.message);
        res.status(500).json({ error: "Qayta tekshiruvlarni tayyorlab bo'lmadi." });
      }
    },

    async dueAssessments(req, res) {
      try {
        res.json({ assessments: await reviewService.listDue(req.user.id) });
      } catch (error) {
        logger.error("Assessment list xatosi:", error.message);
        res.status(500).json({ error: "Qayta tekshiruvlarni yuklab bo'lmadi." });
      }
    },

    async progressOverview(req, res) {
      try {
        res.json(await reviewService.getProgressOverview(req.user.id));
      } catch (error) {
        logger.error("Learning overview xatosi:", error.message);
        res.status(500).json({ error: "O'quv rivojlanish ma'lumotlarini yuklab bo'lmadi." });
      }
    },

    async assessmentDetail(req, res) {
      try {
        const assessmentId = positiveInteger(req.params.assessmentId);
        if (!assessmentId) return res.status(400).json({ error: "Noto'g'ri tekshiruv ID." });
        const assessment = await reviewService.getAssessment(req.user.id,assessmentId);
        if (!assessment) return res.status(404).json({ error: "Tekshiruv topilmadi." });
        res.json({ assessment });
      } catch (error) {
        logger.error("Assessment detail xatosi:", error.message);
        res.status(500).json({ error: "Tekshiruvni yuklab bo'lmadi." });
      }
    },

    async startAssessment(req, res) {
      try {
        const assessmentId = positiveInteger(req.params.assessmentId);
        if (!assessmentId) return res.status(400).json({ error: "Noto'g'ri tekshiruv ID." });
        const assessment = await reviewService.startAssessment(req.user.id,assessmentId);
        if (!assessment) return res.status(404).json({ error: "Boshlash mumkin bo'lgan tekshiruv topilmadi." });
        res.json({ assessment });
      } catch (error) {
        logger.error("Assessment start xatosi:", error.message);
        res.status(500).json({ error: "Tekshiruvni boshlab bo'lmadi." });
      }
    },

    async answerAssessment(req, res) {
      try {
        const assessmentId = positiveInteger(req.params.assessmentId);
        const questionId = positiveInteger(req.params.questionId);
        if (!assessmentId || !questionId) return res.status(400).json({ error: "Noto'g'ri savol ID." });
        const result = await reviewService.answerQuestion(req.user.id,assessmentId,questionId,
          req.body && req.body.selected_option,req.body && req.body.response_time_ms);
        if (result && result.validation_error) return res.status(400).json({ error: "Javob A, B, C yoki D bo'lishi kerak." });
        if (!result) return res.status(404).json({ error: "Faol tekshiruv savoli topilmadi." });
        res.json(result);
      } catch (error) {
        logger.error("Assessment answer xatosi:", error.message);
        res.status(500).json({ error: "Javobni saqlab bo'lmadi." });
      }
    },

    async completeAssessment(req, res) {
      try {
        const assessmentId = positiveInteger(req.params.assessmentId);
        if (!assessmentId) return res.status(400).json({ error: "Noto'g'ri tekshiruv ID." });
        const result = await reviewService.completeAssessment(req.user.id,assessmentId);
        if (!result) return res.status(404).json({ error: "Tekshiruv topilmadi." });
        if (result.incomplete) return res.status(409).json({
          error: "Tekshiruvni yakunlashdan oldin barcha savollarga javob bering.",
          answered: result.answered,total: result.total,
        });
        res.json({ assessment: result });
      } catch (error) {
        logger.error("Assessment complete xatosi:", error.message);
        res.status(500).json({ error: "Tekshiruvni yakunlab bo'lmadi." });
      }
    },
  };
}

module.exports = { createStudentRemediationController, positiveInteger };
