function createBattleBotAnswerSimulationService({
  battles,
  io,
  finishBattle,
  random = () => Math.random(),
  setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
}) {
  return function simulateBotAnswers(roomId, botId, questions) {
    let questionIndex = 0;

    function answerNext() {
      const battle = battles[roomId];
      if (!battle || !battle.players[botId]) return;
      if (questionIndex >= questions.length) {
        battle.players[botId].finished = true;
        const allFinished = Object.values(battle.players).every((player) => player.finished);
        if (allFinished) finishBattle(roomId);
        return;
      }

      const question = questions[questionIndex];
      void question;
      const bot = battle.players[botId];
      const isCorrect = random() < 0.65;
      if (isCorrect) bot.score++;
      bot.answeredCount++;

      io.to(roomId).emit("opponentProgress", { answeredCount: bot.answeredCount });
      questionIndex++;

      if (bot.answeredCount >= questions.length) {
        bot.finished = true;
        const allFinished = Object.values(battle.players).every((player) => player.finished);
        if (allFinished) finishBattle(roomId);
        return;
      }

      const delay = 3000 + random() * 5000;
      setTimeoutFn(answerNext, delay);
    }

    setTimeoutFn(answerNext, 2000 + random() * 3000);
  };
}

module.exports = { createBattleBotAnswerSimulationService };
