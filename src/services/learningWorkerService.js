const { createQuestionAnalysisService } = require("./questionAnalysisService");
const { createLearningAnalyticsService } = require("./learningAnalyticsService");
const { createLearningReviewService } = require("./learningReviewService");
const { createNotificationService } = require("./notificationService");

function startLearningWorkers({ pool, logger = console }) {
  const createNotification = createNotificationService({ pool, logger, reportStatus: true });
  const workers = [
    createQuestionAnalysisService({ pool, logger }),
    createLearningAnalyticsService({ pool, logger }),
    createLearningReviewService({ pool, createNotification, logger }),
  ];
  workers.forEach((worker) => worker.startWorker());
  return {
    stop() {
      workers.forEach((worker) => worker.stopWorker());
    },
  };
}

module.exports = { startLearningWorkers };
