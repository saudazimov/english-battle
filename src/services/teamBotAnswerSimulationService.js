function createTeamBotAnswerSimulationService({
  battles,
  emitTeamProgress,
  checkTeamFinish,
  random = () => Math.random(),
  setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
}) {
  return function simulateTeamBotAnswers(roomId, botId, questions) {
    let questionIndex = 0;

    function answerNext() {
      const battle = battles[roomId];
      if (!battle || battle.finished) return;
      const bot = battle.players[botId];
      if (!bot || bot.finished) return;

      if (questionIndex >= questions.length) {
        bot.finished = true;
        emitTeamProgress(roomId);
        checkTeamFinish(roomId);
        return;
      }

      const question = questions[questionIndex];
      void question;
      const correct = random() < 0.68;
      if (correct) bot.score++;
      bot.answeredCount++;
      questionIndex++;
      if (bot.answeredCount >= questions.length) bot.finished = true;

      emitTeamProgress(roomId);

      if (bot.finished) {
        checkTeamFinish(roomId);
      } else {
        setTimeoutFn(answerNext, 2000 + random() * 3500);
      }
    }

    setTimeoutFn(answerNext, 2000 + random() * 3500);
  };
}

module.exports = { createTeamBotAnswerSimulationService };
